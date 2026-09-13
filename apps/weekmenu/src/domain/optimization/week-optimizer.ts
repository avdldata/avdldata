import { cents, type Cents, divideCents, ZERO_CENTS } from '../units';
import type { Household } from '../household/types';
import type { IngredientIndex } from '../ingredients/types';
import type { Recipe } from '../recipes/types';
import type { ProductOffer } from '../stores/types';
import {
  calculateHouseholdNutrition,
  type MemberNutrition,
} from '../nutrition/calculate';
import { planPortions, type RecipePortions } from '../nutrition/portions';
import {
  aggregateWeekIngredients,
  purchasableRequirements,
  type PlannedDay,
  type WeekIngredientRequirement,
} from '../aggregation/aggregate';
import { buildLeftoverLedger, summariseWaste } from '../aggregation/leftovers';
import {
  DEFAULT_OPTIMIZER_CONFIG,
  EXTRA_STORE_PENALTY_BY_PREFERENCE,
  type ConveniencePreference,
  type OptimizerConfig,
} from './config';
import { filterCandidateRecipes, type ExcludedRecipe } from './filter';
import { varietyScore, violationsIfAdded, weekDiversityViolations } from './diversity';
import {
  buildPackagingMatrix,
  enumerateStoreOptions,
  representativeStoresPerChain,
  type StoreCandidate,
  type StoreOption,
} from './store-selection';
import { scoreNutrition, scoreRecipePreferences, scoreWeek } from './scoring';
import { buildWeekReasons, buildDayReasons } from './explain';
import type {
  BudgetSettings,
  OptimizerResult,
  PlannedDayResult,
  WeekNutritionSummary,
  WeeklyPlan,
} from './types';

export interface OptimizerLogger {
  (stage: string, data: Readonly<Record<string, number | string>>): void;
}

export interface OptimizerInput {
  readonly household: Household;
  readonly recipes: readonly Recipe[];
  readonly ingredients: IngredientIndex;
  /** Stores the user allows, already resolved with their offers and distance. */
  readonly stores: readonly StoreCandidate[];
  readonly maxStores: number;
  readonly conveniencePreference: ConveniencePreference;
  readonly budget: BudgetSettings;
  /** Monday of the planned week, ISO yyyy-mm-dd. */
  readonly startDate: string;
  /** "Now", passed in so the whole engine stays deterministic. */
  readonly today: Date;
  readonly maxMinutes?: number;
  /** Day index -> recipe id, used by the "replace this dish" flow. */
  readonly lockedRecipeIds?: ReadonlyMap<number, string>;
  readonly config?: OptimizerConfig;
  readonly logger?: OptimizerLogger;
  /** Monotonic clock, injected so tests can stay deterministic. */
  readonly now?: () => number;
}

interface BeamState {
  readonly recipes: readonly Recipe[];
  readonly amounts: ReadonlyMap<string, number>;
  readonly preferencePenalty: number;
  readonly estimate: number;
}

/**
 * The week optimizer.
 *
 * Pipeline (see OPTIMIZER.md for the full write-up):
 *   1  household profile and nutrition targets
 *   2  hard-constraint filtering of the recipe catalogue
 *   3  per-recipe portion scaling and ingredient amounts
 *   4  beam search over the seven slots, gated by the variety rules
 *   5  full pricing of the most promising complete weeks:
 *      aggregate -> packages -> promotions -> store combinations -> travel
 *   6  objective function over the result, best week wins
 *   7  structured explanations for everything the user sees
 *
 * The whole thing is deterministic: no randomness, no clock, stable tie-breaks
 * everywhere. The same input always produces the same week.
 */
export function optimiseWeek(input: OptimizerInput): OptimizerResult {
  const config = input.config ?? DEFAULT_OPTIMIZER_CONFIG;
  const clock = input.now ?? (() => 0);
  const startedAt = clock();
  const log = input.logger ?? (() => undefined);

  if (input.household.members.length === 0) {
    return failure('NO_MEMBERS', 'Voeg minimaal één gezinslid toe voordat je een week maakt.', []);
  }

  const stores = representativeStoresPerChain(input.stores);
  if (stores.length === 0) {
    return failure('NO_STORES', 'Selecteer minimaal één supermarkt in de buurt.', []);
  }

  const memberNutrition = calculateHouseholdNutrition(
    input.household.members,
    input.today,
    config.nutrition,
  );

  const { candidates, excluded } = filterCandidateRecipes({
    household: input.household,
    recipes: input.recipes,
    ...(input.maxMinutes !== undefined ? { maxMinutes: input.maxMinutes } : {}),
  });

  log('filter', { totalRecipes: input.recipes.length, candidates: candidates.length });

  if (candidates.length === 0) {
    return failure(
      'NO_CANDIDATE_RECIPES',
      'Geen enkel recept past bij de ingestelde dieetregels en uitsluitingen.',
      excluded,
    );
  }
  if (candidates.length < config.days) {
    return failure(
      'NOT_ENOUGH_CANDIDATE_RECIPES',
      `Er passen maar ${candidates.length} recepten bij jullie instellingen; we hebben er ${config.days} nodig.`,
      excluded,
    );
  }

  // ---- 3. portions and per-recipe ingredient amounts -----------------------
  const portionsByRecipe = new Map<string, RecipePortions>();
  const amountsByRecipe = new Map<string, ReadonlyMap<string, number>>();
  for (const recipe of candidates) {
    const portions = planPortions(recipe, memberNutrition, config.nutrition);
    portionsByRecipe.set(recipe.id, portions);
    amountsByRecipe.set(recipe.id, recipeAmounts(recipe, portions, input.ingredients));
  }

  const referenceOffers = buildReferenceOffers(stores);
  const preferencePenalties = new Map<string, number>();
  for (const recipe of candidates) {
    preferencePenalties.set(
      recipe.id,
      scoreRecipePreferences(recipe, input.household.preferences, config.weights).penaltyCents,
    );
  }

  // ---- 4. beam search ------------------------------------------------------
  const pool = rankCandidates(candidates, {
    amountsByRecipe,
    referenceOffers,
    preferencePenalties,
    portionsByRecipe,
    memberNutrition,
  }).slice(0, Math.max(config.search.candidatesPerSlot, config.days * 4));

  const weeks = beamSearch({
    pool,
    config,
    ...(input.lockedRecipeIds ? { locked: input.lockedRecipeIds } : {}),
    amountsByRecipe,
    referenceOffers,
    preferencePenalties,
  });

  log('search', { weeksGenerated: weeks.length, pool: pool.length });

  if (weeks.length === 0) {
    return failure(
      'NOT_ENOUGH_CANDIDATE_RECIPES',
      'We konden geen week samenstellen die aan de variatieregels voldoet.',
      excluded,
    );
  }

  // ---- 5. full pricing of the most promising weeks -------------------------
  const extraStorePenalty = EXTRA_STORE_PENALTY_BY_PREFERENCE[input.conveniencePreference];
  const home = {
    latitude: input.household.location.latitude ?? stores[0]!.location.latitude,
    longitude: input.household.location.longitude ?? stores[0]!.location.longitude,
  };

  const seenSets = new Set<string>();
  const evaluated: { plan: WeeklyPlan; penalty: number }[] = [];
  let storeCombinationsEvaluated = 0;

  for (const week of weeks) {
    if (evaluated.length >= config.search.fullyEvaluatedWeeks) break;
    const key = week.recipes
      .map((r) => r.id)
      .slice()
      .sort()
      .join('|');
    if (seenSets.has(key)) continue;
    seenSets.add(key);

    const priced = priceWeek({
      recipes: week.recipes,
      portionsByRecipe,
      household: input.household,
      memberNutrition,
      ingredients: input.ingredients,
      stores,
      matrixHome: home,
      maxStores: input.maxStores,
      extraStorePenalty,
      budget: input.budget,
      startDate: input.startDate,
      config,
      excluded,
    });
    if (!priced) continue;
    storeCombinationsEvaluated += priced.optionCount;
    evaluated.push({ plan: priced.plan, penalty: priced.plan.score.totalPenaltyCents });
  }

  if (evaluated.length === 0) {
    return failure(
      'NO_PRICEABLE_WEEK',
      'We konden geen prijs berekenen voor deze week — controleer de geselecteerde supermarkten.',
      excluded,
    );
  }

  // A hard budget maximum is a filter, not a penalty. If nothing fits we still
  // return the cheapest legitimate week and say so, rather than quietly
  // dropping a dietary rule to hit the number.
  const withinHardMax =
    input.budget.hardMaxCents === undefined
      ? evaluated
      : evaluated.filter((e) => e.plan.totals.groceryCents <= input.budget.hardMaxCents!);

  const pool2 = withinHardMax.length > 0 ? withinHardMax : evaluated;
  pool2.sort(
    (a, b) =>
      a.penalty - b.penalty ||
      a.plan.totals.groceryCents - b.plan.totals.groceryCents ||
      a.plan.days
        .map((d) => d.recipe.id)
        .join('|')
        .localeCompare(b.plan.days.map((d) => d.recipe.id).join('|')),
  );

  const winner = pool2[0]!.plan;
  const elapsedMs = Math.max(0, clock() - startedAt);

  log('result', {
    weeksFullyEvaluated: evaluated.length,
    storeCombinations: storeCombinationsEvaluated,
    winningGroceryCents: winner.totals.groceryCents,
    wasteScore: Math.round(winner.waste.wasteScore),
    elapsedMs,
  });

  return {
    status: 'OK',
    plan: {
      ...winner,
      diagnostics: {
        totalRecipes: input.recipes.length,
        candidateRecipes: candidates.length,
        weeksGenerated: weeks.length,
        weeksFullyEvaluated: evaluated.length,
        storeCombinationsEvaluated,
        elapsedMs,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Candidate ranking and beam search
// ---------------------------------------------------------------------------

interface RankingContext {
  amountsByRecipe: ReadonlyMap<string, ReadonlyMap<string, number>>;
  referenceOffers: ReadonlyMap<string, ProductOffer>;
  preferencePenalties: ReadonlyMap<string, number>;
  portionsByRecipe: ReadonlyMap<string, RecipePortions>;
  memberNutrition: readonly MemberNutrition[];
}

function rankCandidates(candidates: readonly Recipe[], ctx: RankingContext): Recipe[] {
  const scored = candidates.map((recipe) => {
    const amounts = ctx.amountsByRecipe.get(recipe.id) ?? new Map();
    const cost = estimateAmountsCost(amounts, ctx.referenceOffers);
    const preference = ctx.preferencePenalties.get(recipe.id) ?? 0;
    const portions = ctx.portionsByRecipe.get(recipe.id);
    const deviation = portions
      ? portions.perMember.reduce((sum, p) => sum + Math.abs(p.kcal - p.targetKcal), 0)
      : 0;
    return { recipe, score: cost + preference + deviation * 0.6 };
  });

  scored.sort((a, b) => a.score - b.score || a.recipe.id.localeCompare(b.recipe.id));
  return scored.map((s) => s.recipe);
}

interface BeamSearchInput {
  pool: readonly Recipe[];
  config: OptimizerConfig;
  locked?: ReadonlyMap<number, string>;
  amountsByRecipe: ReadonlyMap<string, ReadonlyMap<string, number>>;
  referenceOffers: ReadonlyMap<string, ProductOffer>;
  preferencePenalties: ReadonlyMap<string, number>;
}

/**
 * Build promising weeks slot by slot, keeping the best `beamWidth` partial
 * weeks at each step.
 *
 * The partial estimate deliberately rounds ingredient amounts up to whole
 * packs: that is what makes the search prefer weeks where Monday's and
 * Wednesday's chicken come out of the same pack. It is an estimate — the exact
 * price comes later — but it points the search in the right direction.
 *
 * Complexity: O(days × beamWidth × pool × ingredients). With the defaults
 * (7 × 40 × 28 × ~30) that is well under a million cheap operations.
 */
function beamSearch(input: BeamSearchInput): BeamState[] {
  const { config } = input;
  let states: BeamState[] = [
    { recipes: [], amounts: new Map(), preferencePenalty: 0, estimate: 0 },
  ];

  for (let slot = 0; slot < config.days; slot += 1) {
    const lockedId = input.locked?.get(slot);
    const next: BeamState[] = [];

    for (const state of states) {
      for (const candidate of input.pool) {
        if (lockedId !== undefined && candidate.id !== lockedId) continue;
        if (state.recipes.some((r) => r.id === candidate.id)) continue;
        // A locked day comes from the user's existing plan; the variety rules
        // must not veto a choice they already made.
        if (
          lockedId === undefined &&
          violationsIfAdded(state.recipes, candidate, config.diversity).length > 0
        ) {
          continue;
        }

        const amounts = mergeAmounts(
          state.amounts,
          input.amountsByRecipe.get(candidate.id) ?? new Map(),
        );
        const preferencePenalty =
          state.preferencePenalty + (input.preferencePenalties.get(candidate.id) ?? 0);

        next.push({
          recipes: [...state.recipes, candidate],
          amounts,
          preferencePenalty,
          estimate: estimateAmountsCost(amounts, input.referenceOffers) + preferencePenalty,
        });
      }
    }

    if (next.length === 0) return [];

    next.sort(
      (a, b) =>
        a.estimate - b.estimate ||
        a.recipes
          .map((r) => r.id)
          .join('|')
          .localeCompare(b.recipes.map((r) => r.id).join('|')),
    );

    // Two partial weeks holding the same dishes in a different order cost the
    // same. Without this the beam fills up with permutations of one menu and we
    // end up fully pricing three weeks instead of forty.
    const bySet = new Map<string, BeamState>();
    for (const state of next) {
      const key = state.recipes
        .map((r) => r.id)
        .slice()
        .sort()
        .join('|');
      if (!bySet.has(key)) bySet.set(key, state);
      if (bySet.size >= config.search.beamWidth) break;
    }
    states = [...bySet.values()];
  }

  return states;
}

// ---------------------------------------------------------------------------
// Full pricing of one complete week
// ---------------------------------------------------------------------------

interface PriceWeekInput {
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
}

function priceWeek(input: PriceWeekInput): { plan: WeeklyPlan; optionCount: number } | undefined {
  const { config } = input;

  const plannedDays: PlannedDay[] = input.recipes.map((recipe, dayIndex) => ({
    dayIndex,
    recipe,
    portions: input.portionsByRecipe.get(recipe.id)!,
  }));

  const allRequirements = aggregateWeekIngredients(plannedDays, input.ingredients);
  const requirements = purchasableRequirements(allRequirements);
  const pantryItems = allRequirements.filter((r) => r.pantryStaple);

  const matrix = buildPackagingMatrix(requirements, input.stores, config.packaging);
  const options = enumerateStoreOptions({
    requirements,
    stores: input.stores,
    matrix,
    home: input.matrixHome,
    maxStores: input.maxStores,
    extraStorePenaltyCents: input.extraStorePenalty,
    tripConfig: config.trip,
  });

  if (options.length === 0) return undefined;

  const recommended = options[0]!;
  const cheapest = [...options].sort(
    (a, b) => a.groceryCents - b.groceryCents || a.locationIds.length - b.locationIds.length,
  )[0]!;

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
      proteinGrams: round1(day.recipe.nutritionPerServing.proteinGrams * day.portions.totalServings),
      carbGrams: round1(day.recipe.nutritionPerServing.carbGrams * day.portions.totalServings),
      fatGrams: round1(day.recipe.nutritionPerServing.fatGrams * day.portions.totalServings),
      fiberGrams: round1(day.recipe.nutritionPerServing.fiberGrams * day.portions.totalServings),
      saltGrams: round1(day.recipe.nutritionPerServing.saltGrams * day.portions.totalServings),
    },
    reasons: buildDayReasons({
      day,
      option: recommended,
      requirements,
      leftovers,
      household: input.household,
      allocatedCostCents: dayCosts.get(day.dayIndex) ?? ZERO_CENTS,
      memberCount,
    }),
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
    reasons: buildWeekReasons({
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
    }),
    budget: budgetOutcome,
    excludedRecipes: input.excluded,
    diagnostics: {
      totalRecipes: 0,
      candidateRecipes: 0,
      weeksGenerated: 0,
      weeksFullyEvaluated: 0,
      storeCombinationsEvaluated: options.length,
      elapsedMs: 0,
    },
  };

  return { plan, optionCount: options.length };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recipeAmounts(
  recipe: Recipe,
  portions: RecipePortions,
  ingredients: IngredientIndex,
): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const line of recipe.ingredients) {
    if (line.optional) continue;
    const ingredient = ingredients.get(line.ingredientId);
    if (!ingredient || ingredient.pantryStaple) continue;
    const amount = line.perServing.amount * portions.totalServings;
    if (amount <= 0) continue;
    amounts.set(line.ingredientId, (amounts.get(line.ingredientId) ?? 0) + amount);
  }
  return amounts;
}

function mergeAmounts(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): Map<string, number> {
  const merged = new Map(a);
  for (const [key, value] of b) merged.set(key, (merged.get(key) ?? 0) + value);
  return merged;
}

/** Cheapest offer per ingredient across all allowed stores, for fast estimates. */
function buildReferenceOffers(stores: readonly StoreCandidate[]): Map<string, ProductOffer> {
  const best = new Map<string, ProductOffer>();
  for (const store of stores) {
    for (const offer of store.offers) {
      const current = best.get(offer.ingredientId);
      if (
        !current ||
        offer.pricePerBaseUnitCents < current.pricePerBaseUnitCents ||
        (offer.pricePerBaseUnitCents === current.pricePerBaseUnitCents &&
          offer.productId.localeCompare(current.productId) < 0)
      ) {
        best.set(offer.ingredientId, offer);
      }
    }
  }
  return best;
}

/**
 * Rough price for a bag of ingredient amounts: whole packs of the cheapest
 * product per ingredient. Promotions and multi-store splits are ignored here —
 * that is exactly what the full evaluation adds.
 */
function estimateAmountsCost(
  amounts: ReadonlyMap<string, number>,
  referenceOffers: ReadonlyMap<string, ProductOffer>,
): number {
  let total = 0;
  for (const [ingredientId, amount] of amounts) {
    const offer = referenceOffers.get(ingredientId);
    if (!offer || offer.packageAmount.amount <= 0) continue;
    total += Math.ceil(amount / offer.packageAmount.amount) * offer.unitPriceCents;
  }
  return total;
}

/**
 * Spread each ingredient's purchase cost over the days that use it, in
 * proportion to how much each day uses. This is an allocation for display —
 * the pack is bought once — and the day costs always sum to the grocery total.
 */
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

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${isoDate}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function failure(
  reason: 'NO_MEMBERS' | 'NO_STORES' | 'NO_CANDIDATE_RECIPES' | 'NOT_ENOUGH_CANDIDATE_RECIPES' | 'NO_PRICEABLE_WEEK',
  message: string,
  excludedRecipes: readonly ExcludedRecipe[],
): OptimizerResult {
  return { status: 'FAILED', reason, message, excludedRecipes };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

