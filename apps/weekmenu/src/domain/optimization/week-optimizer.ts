import type { Household } from '../household/types';
import type { IngredientIndex } from '../ingredients/types';
import type { Recipe } from '../recipes/types';
import { DEFAULT_OPTIMIZER_CONFIG, type ConveniencePreference, type OptimizerConfig } from './config';
import type { ExcludedRecipe } from './filter';
import { prepareOptimization, type PreparationFailure } from './prepare';
import { bestOrdering } from './diversity';
import type { PackagingCache, StoreCandidate } from './store-selection';
import { evaluateWeek, selectBestPlan } from './evaluate-week';
import { generateCandidateWeeks, weekKey } from './candidates';
import { improveBySwapping, type EvaluatedWeek } from './local-search';
import { weekLowerBound } from './lower-bound';
import type { BudgetSettings, OptimizerResult, WeeklyPlan } from './types';

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
  const clock = input.now ?? (() => 0);
  const startedAt = clock();
  const log = input.logger ?? (() => undefined);

  // ---- 1-3. household, hard filter, portions -------------------------------
  const prepared = prepareOptimization(input);
  if (prepared.status === 'FAILED') return preparationFailure(prepared, input);

  const { config, stores, maxStores, memberNutrition, candidates, excluded, portionsByRecipe } =
    prepared;

  log('filter', { totalRecipes: input.recipes.length, candidates: candidates.length });

  // ---- 4. stage A: candidate weeks ----------------------------------------
  const { weeks, pool } = generateCandidateWeeks({
    candidates,
    portionsByRecipe,
    memberNutrition,
    ingredients: input.ingredients,
    stores,
    preferences: input.household.preferences,
    config,
    ...(input.lockedRecipeIds ? { locked: input.lockedRecipeIds } : {}),
  });

  log('search', { weeksGenerated: weeks.length, pool: pool.length });

  if (weeks.length === 0) {
    return failure(
      'NOT_ENOUGH_CANDIDATE_RECIPES',
      `Er passen maar ${candidates.length} recepten bij jullie instellingen; daar krijgen we geen week van ${config.days} verschillende gerechten uit.`,
      excluded,
    );
  }

  // ---- 5. stage B: full pricing of the most promising weeks ----------------
  const { home, extraStorePenalty } = prepared;

  const seenSets = new Set<string>();
  const evaluated: { plan: WeeklyPlan; penalty: number }[] = [];
  let storeCombinationsEvaluated = 0;

  // One pricing closure, shared by stage B and stage C. Two call sites that
  // each assemble their own evaluation input is two chances for the refinement
  // step to be judging a subtly different week than the search step.
  const packagingCache: PackagingCache = new Map();
  const price = (
    recipes: readonly Recipe[],
    explain = false,
  ): EvaluatedWeek | undefined =>
    evaluateWeek({
      recipes,
      packagingCache,
      explain,
      portionsByRecipe,
      household: input.household,
      memberNutrition,
      ingredients: input.ingredients,
      stores,
      matrixHome: home,
      maxStores,
      extraStorePenalty,
      budget: input.budget,
      startDate: input.startDate,
      config,
      excluded,
    });

  // A hard maximum is the one setting where stopping early is not a trade-off
  // but a wrong answer: telling someone "no week fits under €50" when one does
  // is worse than being slow. So once the usual budget of fully priced weeks is
  // spent and nothing has come in under the ceiling, keep going through the
  // weeks the search already built. That is bounded by the beam width, so the
  // extra work is at most one more pass, and it only happens when a ceiling is
  // set and has not yet been met.
  const hardMaxCents = input.budget.hardMaxCents;
  const fitsBudget = (plan: WeeklyPlan): boolean =>
    hardMaxCents === undefined || plan.totals.groceryCents <= hardMaxCents;

  for (const week of weeks) {
    const spentTheBudget = evaluated.length >= config.search.fullyEvaluatedWeeks;
    const stillLookingForAffordable =
      hardMaxCents !== undefined && !evaluated.some((entry) => fitsBudget(entry.plan));
    if (spentTheBudget && !stillLookingForAffordable) break;

    const key = weekKey(week.recipes);
    if (seenSets.has(key)) continue;
    seenSets.add(key);

    // The same seven dishes in a different order can carry a different
    // repetition penalty, because "no three of one cuisine in a row" is the one
    // variety rule that depends on the order. The beam builds a sequence; this
    // makes sure the user is not charged for an arrangement nobody chose.
    //
    // Except when they did choose it: the replace-a-dish flow locks all seven
    // days, and shuffling Monday's dinner to Friday because it scores better is
    // not what "swap Wednesday" means.
    const priced = price(
      input.lockedRecipeIds ? week.recipes : bestOrdering(week.recipes, config.diversity),
    );
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

  const stageBWinner = selectBestPlan(
    evaluated.map((e) => e.plan),
    input.budget,
  )!;

  // ---- 6. stage C: swap one dish at a time ---------------------------------
  const refined = improveBySwapping({
    start: { plan: stageBWinner, optionCount: 0 },
    pool,
    config,
    budget: input.budget,
    ...(input.lockedRecipeIds ? { locked: input.lockedRecipeIds } : {}),
    alreadyPriced: seenSets,
    evaluate: price,
    lowerBound: (recipes) =>
      weekLowerBound({
        recipes,
        portionsByRecipe,
        household: input.household,
        memberNutrition,
        ingredients: input.ingredients,
        stores,
        config,
        packagingCache,
      }),
  });
  // Only now, once the week is decided, is it worth explaining. Every other
  // candidate was priced without its reasons.
  const winner = (price(refined.best.plan.days.map((day) => day.recipe), true) ?? refined.best).plan;
  storeCombinationsEvaluated += refined.storeCombinationsEvaluated;
  const weeksFullyEvaluated = evaluated.length + refined.evaluations;

  log('localSearch', {
    evaluations: refined.evaluations,
    pruned: refined.pruned,
    iterations: refined.iterations,
    improved: refined.improved ? 1 : 0,
    gainCents: stageBWinner.score.totalPenaltyCents - winner.score.totalPenaltyCents,
  });

  if (input.budget.hardMaxCents !== undefined) {
    const fitting = evaluated.filter(
      (e) => e.plan.totals.groceryCents <= input.budget.hardMaxCents!,
    ).length;
    log('budget', { evaluated: evaluated.length, withinHardMax: fitting });
  }
  const elapsedMs = Math.max(0, clock() - startedAt);

  log('result', {
    weeksFullyEvaluated,
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
        weeksFullyEvaluated,
        localSearchEvaluations: refined.evaluations,
        localSearchPruned: refined.pruned,
        storeCombinationsEvaluated,
        elapsedMs,
      },
    },
  };
}

/**
 * The shared preparation reports *what* went wrong; the wording is this layer's
 * business, because these strings end up in front of a user.
 */
function preparationFailure(failed: PreparationFailure, input: OptimizerInput): OptimizerResult {
  const days = (input.config ?? DEFAULT_OPTIMIZER_CONFIG).days;
  const messages: Record<PreparationFailure['reason'], string> = {
    NO_MEMBERS: 'Voeg minimaal één gezinslid toe voordat je een week maakt.',
    NO_STORES: 'Selecteer minimaal één supermarkt in de buurt.',
    NO_CANDIDATE_RECIPES: 'Geen enkel recept past bij de ingestelde dieetregels en uitsluitingen.',
    NOT_ENOUGH_CANDIDATE_RECIPES:
      `Er passen maar ${failed.candidateCount} recepten bij jullie instellingen; ` +
      `we hebben er ${days} nodig.`,
  };
  return failure(failed.reason, messages[failed.reason], failed.excluded);
}

function failure(
  reason:
    | 'NO_MEMBERS'
    | 'NO_STORES'
    | 'NO_CANDIDATE_RECIPES'
    | 'NOT_ENOUGH_CANDIDATE_RECIPES'
    | 'NO_PRICEABLE_WEEK',
  message: string,
  excludedRecipes: readonly ExcludedRecipe[],
): OptimizerResult {
  return { status: 'FAILED', reason, message, excludedRecipes };
}
