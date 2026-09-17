import { cents, type Cents, divideCents, ZERO_CENTS } from '../units';
import type { Household } from '../household/types';
import type { IngredientIndex } from '../ingredients/types';
import type { Recipe } from '../recipes/types';
import type { MemberNutrition } from '../nutrition/calculate';
import type { RecipePortions } from '../nutrition/portions';
import {
  aggregateWeekIngredients,
  purchasableRequirements,
  type PlannedDay,
  type WeekIngredientRequirement,
} from '../aggregation/aggregate';
import { buildLeftoverLedger, summariseWaste } from '../aggregation/leftovers';
import type { OptimizerConfig } from './config';
import type { ExcludedRecipe } from './filter';
import { varietyScore, weekDiversityViolations } from './diversity';
import {
  buildPackagingMatrix,
  enumerateStoreOptions,
  type PackagingCache,
  type StoreCandidate,
  type StoreOption,
} from './store-selection';
import { scoreNutrition, scoreRecipePreferences, scoreWeek } from './scoring';
import { buildWeekReasons, buildDayReasons } from './explain';
import type { BudgetSettings, PlannedDayResult, WeekNutritionSummary, WeeklyPlan } from './types';

/**
 * Turn one specific set of seven dishes into a fully costed week.
 *
 * This is the objective function, and it is deliberately the *only* copy of it.
 * The production optimizer and the exhaustive reference solver differ purely in
 * which candidate weeks they hand to this function — never in how a week is
 * judged once chosen. Any divergence there would make the benchmark measure the
 * difference between two scoring rules instead of the quality of the search,
 * which is the one thing it exists to measure.
 *
 * Everything the calculation needs is passed in, including the date and the
 * ingredient catalogue: no clock, no globals, no randomness.
 */
export interface WeekEvaluationInput {
  recipes: readonly Recipe[];
  portionsByRecipe: ReadonlyMap<string, RecipePortions>;
  household: Household;
  memberNutrition: readonly MemberNutrition[];
  ingredients: IngredientIndex;
  stores: readonly StoreCandidate[];
  matrixHome: { latitude: number; longitude: number };
  maxStores: number;
  extraStorePenalty: Cents;
  budget: BudgetSettings;
  startDate: string;
  config: OptimizerConfig;
  excluded: readonly ExcludedRecipe[];
  /**
   * Optional memo shared across the weeks priced in one optimizer run. Purely a
   * speed-up: the same ingredient, amount and shop always package the same way.
   */
  packagingCache?: PackagingCache;
  /**
   * Build the human-readable explanations. Default true.
   *
   * A search prices hundreds of weeks and shows one. The reasons are pure
   * presentation — nothing in the score reads them — so the candidates are
   * priced without them and the winner is priced once more with them. Skipping
   * work whose only consumer is a screen nobody will see is not a shortcut;
   * building it for a week that loses is the mistake.
   */
  explain?: boolean;
  requireCompleteBasket?: boolean;
}

export function evaluateWeek(
  input: WeekEvaluationInput,
): { plan: WeeklyPlan; optionCount: number } | undefined {
  const { config } = input;
  const explain = input.explain !== false;

  const plannedDays: PlannedDay[] = input.recipes.map((recipe, dayIndex) => ({
    dayIndex,
    recipe,
    portions: input.portionsByRecipe.get(recipe.id)!,
  }));

  const allRequirements = aggregateWeekIngredients(plannedDays, input.ingredients);
  const requirements = purchasableRequirements(allRequirements);
  const pantryItems = allRequirements.filter((r) => r.pantryStaple);

  const matrix = buildPackagingMatrix(
    requirements,
    input.stores,
    config.packaging,
    input.packagingCache,
  );
  const allOptions = enumerateStoreOptions({
    requirements,
    stores: input.stores,
    matrix,
    home: input.matrixHome,
    maxStores: input.maxStores,
    extraStorePenaltyCents: input.extraStorePenalty,
    unavailableItemPenaltyCents: config.weights.unavailableItemPenalty,
    tripConfig: config.trip,
  });
  const options = input.requireCompleteBasket
    ? allOptions.filter((option) => option.unavailable.length === 0)
    : allOptions;

  if (options.length === 0) return undefined;

  // "Cheapest" has to mean cheapest for the same shopping list. A combination
  // that leaves items out has a lower bill only because it buys less, so it can
  // never be the cheapest option unless no combination can supply everything.
  const byGrocery = (a: StoreOption, b: StoreOption): number =>
    a.groceryCents - b.groceryCents || a.locationIds.length - b.locationIds.length;
  const complete = options.filter((option) => option.unavailable.length === 0);
  const cheapest = [...(complete.length > 0 ? complete : options)].sort(byGrocery)[0]!;

  // A hard maximum is the user saying "never above this". Before writing a menu
  // off as too expensive we shop for it differently: take the best-ranked
  // combination that stays under the ceiling, rather than the most convenient
  // one. Only when no combination fits does the week itself become the problem.
  const hardMax = input.budget.hardMaxCents;
  const recommended =
    hardMax !== undefined && options[0]!.groceryCents > hardMax
      ? (options.find((option) => option.groceryCents <= hardMax) ?? options[0]!)
      : options[0]!;

  const leftovers = buildLeftoverLedger(
    requirements,
    recommended.purchasedByIngredient,
    config.leftovers,
  );
  const waste = summariseWaste(leftovers);

  const nutritionPenalty = scoreNutrition({
    days: plannedDays,
    members: input.memberNutrition,
    nutritionConfig: config.nutrition,
    weights: config.weights,
  });

  const diversityViolations = weekDiversityViolations(input.recipes, config.diversity);
  const preferencePenalty = cents(
    input.recipes.reduce(
      (sum, recipe) =>
        sum +
        scoreRecipePreferences(recipe, input.household.preferences, config.weights).penaltyCents,
      0,
    ),
  );

  const score = scoreWeek({
    option: recommended,
    variety: varietyScore(input.recipes),
    nutrition: nutritionPenalty,
    waste,
    diversityViolations,
    preferencePenaltyCents: preferencePenalty,
    budget: input.budget,
    weights: config.weights,
  });

  const dayCosts = allocateCostPerDay(plannedDays, requirements, recommended);
  const memberCount = Math.max(1, input.household.members.length);

  const days: PlannedDayResult[] = plannedDays.map((day) => ({
    dayIndex: day.dayIndex,
    date: addDays(input.startDate, day.dayIndex),
    recipe: day.recipe,
    portions: day.portions,
    allocatedCostCents: dayCosts.get(day.dayIndex) ?? ZERO_CENTS,
    nutrition: {
      kcal: Math.round(day.recipe.nutritionPerServing.kcal * day.portions.totalServings),
      proteinGrams: round1(
        day.recipe.nutritionPerServing.proteinGrams * day.portions.totalServings,
      ),
      carbGrams: round1(day.recipe.nutritionPerServing.carbGrams * day.portions.totalServings),
      fatGrams: round1(day.recipe.nutritionPerServing.fatGrams * day.portions.totalServings),
      fiberGrams: round1(day.recipe.nutritionPerServing.fiberGrams * day.portions.totalServings),
      saltGrams: round1(day.recipe.nutritionPerServing.saltGrams * day.portions.totalServings),
    },
    reasons: explain
      ? buildDayReasons({
          day,
          option: recommended,
          requirements,
          leftovers,
          household: input.household,
          allocatedCostCents: dayCosts.get(day.dayIndex) ?? ZERO_CENTS,
          memberCount,
        })
      : [],
  }));

  const budgetOutcome = evaluateBudget(input.budget, recommended.groceryCents);

  const plan: WeeklyPlan = {
    startDate: input.startDate,
    days,
    requirements,
    pantryItems,
    leftovers,
    waste,
    recommendedOption: recommended,
    alternativeOptions: options.slice(1),
    cheapestOption: cheapest,
    totals: {
      groceryCents: recommended.groceryCents,
      travelCents: recommended.trip.estimatedTravelCostCents,
      extraStorePenaltyCents: recommended.extraStorePenaltyCents,
      practicalTotalCents: recommended.practicalTotalCents,
      promotionSavingsCents: recommended.promotionSavingsCents,
      perPersonCents: divideCents(recommended.groceryCents, memberCount),
      perMealCents: divideCents(recommended.groceryCents, Math.max(1, days.length)),
      perPersonPerMealCents: divideCents(
        recommended.groceryCents,
        Math.max(1, memberCount * days.length),
      ),
    },
    nutrition: summariseWeekNutrition(plannedDays, input.memberNutrition),
    memberNutrition: input.memberNutrition,
    score,
    reasons: explain
      ? buildWeekReasons({
          option: recommended,
          options,
          waste,
          leftovers,
          budget: budgetOutcome,
          nutrition: nutritionPenalty,
          diversityViolations,
          recipes: input.recipes,
          household: input.household,
          stores: input.stores,
        })
      : [],
    budget: budgetOutcome,
    excludedRecipes: input.excluded,
    diagnostics: {
      totalRecipes: 0,
      candidateRecipes: 0,
      weeksGenerated: 0,
      weeksFullyEvaluated: 0,
      localSearchEvaluations: 0,
      localSearchPruned: 0,
      storeCombinationsEvaluated: options.length,
      elapsedMs: 0,
    },
  };

  return { plan, optionCount: options.length };
}

/**
 * Pick the winning week from a set of fully costed ones.
 *
 * Shared by the production optimizer and the reference solver so that "best"
 * means the same thing to both: a hard budget maximum filters rather than
 * penalises, and among the survivors the lowest total penalty wins, with stable
 * tie-breaks so the same input never yields two different answers.
 *
 * If nothing fits the hard maximum, the cheapest legitimate week is returned
 * anyway — the caller reports that the budget was missed rather than quietly
 * dropping a dietary rule to hit the number.
 */
export function selectBestPlan(
  plans: readonly WeeklyPlan[],
  budget: BudgetSettings,
): WeeklyPlan | undefined {
  if (plans.length === 0) return undefined;

  return [...plans].sort(comparePlans(budget))[0];
}

/**
 * The winner rule, as a comparator, so that everything choosing between weeks
 * chooses the same way.
 *
 * A hard maximum is a promise, not a preference: any week that keeps it beats
 * every week that breaks it, however good the latter scores. Below that the
 * objective decides, then the actual bill, then the dish ids — the last one
 * purely so that two equally good weeks always resolve the same way on every
 * machine.
 */
export function comparePlans(budget: BudgetSettings): (a: WeeklyPlan, b: WeeklyPlan) => number {
  const fits = fitsBudget(budget);
  return (a, b) =>
    fits(a) - fits(b) ||
    a.score.totalPenaltyCents - b.score.totalPenaltyCents ||
    a.totals.groceryCents - b.totals.groceryCents ||
    byDishIds(a, b);
}

/**
 * The comparator to use while nothing yet fits the ceiling.
 *
 * `comparePlans` ranks two weeks that both break the ceiling by their overall
 * score — health, waste, variety and all. That is the right question once you
 * are choosing what to cook, and the wrong one while you are still trying to
 * get under a number: it will happily walk towards a nicer week that is just as
 * unaffordable. Here the bill leads instead, so each step actually moves
 * towards the ceiling. As soon as something fits, `fits` dominates in both
 * orderings and the search goes back to judging quality.
 */
export function compareForAffordability(
  budget: BudgetSettings,
): (a: WeeklyPlan, b: WeeklyPlan) => number {
  const fits = fitsBudget(budget);
  return (a, b) =>
    fits(a) - fits(b) ||
    a.totals.groceryCents - b.totals.groceryCents ||
    a.score.totalPenaltyCents - b.score.totalPenaltyCents ||
    byDishIds(a, b);
}

function fitsBudget(budget: BudgetSettings): (plan: WeeklyPlan) => number {
  return (plan) =>
    budget.hardMaxCents === undefined || plan.totals.groceryCents <= budget.hardMaxCents ? 0 : 1;
}

function byDishIds(a: WeeklyPlan, b: WeeklyPlan): number {
  return a.days
    .map((d) => d.recipe.id)
    .join('|')
    .localeCompare(b.days.map((d) => d.recipe.id).join('|'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allocateCostPerDay(
  days: readonly PlannedDay[],
  requirements: readonly WeekIngredientRequirement[],
  option: StoreOption,
): Map<number, Cents> {
  const perDay = new Map<number, number>();
  for (const day of days) perDay.set(day.dayIndex, 0);

  const requirementById = new Map(requirements.map((r) => [r.ingredientId, r]));

  for (const assignment of option.assignments) {
    const requirement = requirementById.get(assignment.ingredientId);
    if (!requirement || requirement.totalAmount <= 0) continue;
    for (const usage of requirement.perDay) {
      const share = usage.amount / requirement.totalAmount;
      perDay.set(
        usage.dayIndex,
        (perDay.get(usage.dayIndex) ?? 0) + assignment.packaging.totalCents * share,
      );
    }
  }

  // Round to whole cents while keeping the sum exactly equal to the total.
  const entries = [...perDay.entries()].sort((a, b) => a[0] - b[0]);
  const rounded = new Map<number, Cents>();
  let allocated = 0;
  entries.forEach(([dayIndex, value], index) => {
    if (index === entries.length - 1) {
      rounded.set(dayIndex, cents(option.groceryCents - allocated));
    } else {
      const amount = cents(value);
      allocated += amount;
      rounded.set(dayIndex, amount);
    }
  });
  return rounded;
}

function summariseWeekNutrition(
  days: readonly PlannedDay[],
  members: readonly MemberNutrition[],
): WeekNutritionSummary {
  const dayCount = Math.max(1, days.length);

  const perMember = members.map((member) => {
    const total = days.reduce((sum, day) => {
      const portion = day.portions.perMember.find((p) => p.memberId === member.memberId);
      return sum + (portion?.kcal ?? 0);
    }, 0);
    const average = Math.round(total / dayCount);
    return {
      memberId: member.memberId,
      name: member.name,
      targetDinnerKcal: member.dinnerEnergyKcal,
      averageDinnerKcal: average,
      deviationKcal: average - member.dinnerEnergyKcal,
    };
  });

  const totals = days.reduce(
    (acc, day) => {
      const n = day.recipe.nutritionPerServing;
      const s = day.portions.totalServings;
      return {
        kcal: acc.kcal + n.kcal * s,
        protein: acc.protein + n.proteinGrams * s,
        fiber: acc.fiber + n.fiberGrams * s,
        salt: acc.salt + n.saltGrams * s,
      };
    },
    { kcal: 0, protein: 0, fiber: 0, salt: 0 },
  );

  return {
    perMember,
    averageDailyKcal: Math.round(totals.kcal / dayCount),
    averageDailyProteinGrams: round1(totals.protein / dayCount),
    averageDailyFiberGrams: round1(totals.fiber / dayCount),
    averageDailySaltGrams: round1(totals.salt / dayCount),
  };
}

function evaluateBudget(budget: BudgetSettings, groceryCents: Cents) {
  const ceiling = budget.hardMaxCents ?? budget.targetCents;
  if (ceiling === undefined) return { met: true };
  const met = groceryCents <= ceiling;
  return {
    ...(budget.targetCents !== undefined ? { targetCents: budget.targetCents } : {}),
    ...(budget.hardMaxCents !== undefined ? { hardMaxCents: budget.hardMaxCents } : {}),
    met,
    ...(met ? {} : { shortfallCents: cents(groceryCents - ceiling) }),
  };
}

/** ISO date `days` after `isoDate`. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${isoDate}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
