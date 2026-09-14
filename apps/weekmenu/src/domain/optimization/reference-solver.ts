import type { Household } from '../household/types';
import type { IngredientIndex } from '../ingredients/types';
import { calculateHouseholdNutrition } from '../nutrition/calculate';
import { planPortions, type RecipePortions } from '../nutrition/portions';
import { DEFAULT_OPTIMIZER_CONFIG, extraStorePenaltyFor, type OptimizerConfig } from './config';
import { bestOrdering } from './diversity';
import { evaluateWeek, selectBestPlan } from './evaluate-week';
import { filterCandidateRecipes } from './filter';
import { representativeStoresPerChain, type StoreCandidate } from './store-selection';
import type { OptimizerInput } from './week-optimizer';
import type { WeeklyPlan } from './types';

/**
 * The exhaustive reference solver.
 *
 * TEST AND BENCHMARK ONLY. Never import this from the application — the ESLint
 * layer rule blocks `src/app`, `src/features`, `src/services` and `src/data`
 * from reaching it, because its cost grows as C(n, 7) and it exists to answer a
 * question the product never asks: what would the *perfect* week have been?
 *
 * It shares every judgement with the production optimizer — the same hard
 * filter, the same portion scaling, the same `evaluateWeek`, the same
 * `selectBestPlan`. The only difference is the search: where production keeps
 * the most promising forty partial weeks, this tries every combination there
 * is. That is what makes the gap between them a measurement of the search
 * strategy rather than of two different opinions about what "good" means.
 */

export interface ExhaustiveSolverInput extends OptimizerInput {
  /**
   * Refuse to run beyond this many combinations rather than hang. C(12, 7) is
   * 792; C(20, 7) is 77.520, which is where "exhaustive" stops being a test and
   * starts being a coffee break.
   */
  readonly maxCombinations?: number;
}

export interface ExhaustiveSolverResult {
  readonly status: 'OK';
  readonly plan: WeeklyPlan;
  /** How many complete weeks were priced. */
  readonly combinationsEvaluated: number;
  readonly candidateRecipes: number;
}

export interface ExhaustiveSolverFailure {
  readonly status: 'FAILED';
  readonly reason:
    | 'NO_MEMBERS'
    | 'NO_STORES'
    | 'NOT_ENOUGH_CANDIDATE_RECIPES'
    | 'NO_PRICEABLE_WEEK'
    | 'TOO_MANY_COMBINATIONS';
  readonly message: string;
}

export const DEFAULT_MAX_COMBINATIONS = 5_000;

/**
 * Price every legal week and return the genuinely best one.
 *
 * Only the consecutive-cuisine rule depends on the order of the seven dishes;
 * every other part of the score is a property of the set. So the search runs
 * over combinations, and for each combination looks for the arrangement that
 * breaks the fewest variety rules before pricing it — otherwise the "optimum"
 * would be an artefact of the order the recipes happened to arrive in.
 */
export function solveWeeklyPlanExhaustive(
  input: ExhaustiveSolverInput,
): ExhaustiveSolverResult | ExhaustiveSolverFailure {
  const config = input.config ?? DEFAULT_OPTIMIZER_CONFIG;
  const limit = input.maxCombinations ?? DEFAULT_MAX_COMBINATIONS;

  if (input.household.members.length === 0) {
    return { status: 'FAILED', reason: 'NO_MEMBERS', message: 'Geen gezinsleden.' };
  }

  const stores = representativeStoresPerChain(input.stores);
  if (stores.length === 0) {
    return { status: 'FAILED', reason: 'NO_STORES', message: 'Geen winkels.' };
  }
  const maxStores = input.maxStores > 0 ? Math.min(input.maxStores, stores.length) : stores.length;

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

  if (candidates.length < config.days) {
    return {
      status: 'FAILED',
      reason: 'NOT_ENOUGH_CANDIDATE_RECIPES',
      message: `${candidates.length} kandidaten, ${config.days} nodig.`,
    };
  }

  const total = binomial(candidates.length, config.days);
  if (total > limit) {
    return {
      status: 'FAILED',
      reason: 'TOO_MANY_COMBINATIONS',
      message: `C(${candidates.length}, ${config.days}) = ${total} overschrijdt de limiet ${limit}.`,
    };
  }

  const portionsByRecipe = new Map<string, RecipePortions>();
  for (const recipe of candidates) {
    portionsByRecipe.set(recipe.id, planPortions(recipe, memberNutrition, config.nutrition));
  }

  const home = {
    latitude: input.household.location.latitude ?? stores[0]!.location.latitude,
    longitude: input.household.location.longitude ?? stores[0]!.location.longitude,
  };
  const extraStorePenalty = extraStorePenaltyFor(input.conveniencePreference);

  const plans: WeeklyPlan[] = [];
  let evaluatedCount = 0;

  for (const combination of combinations(candidates, config.days)) {
    const ordered = bestOrdering(combination, config.diversity);
    const priced = evaluateWeek({
      recipes: ordered,
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
    if (!priced) continue;
    evaluatedCount += 1;
    plans.push(priced.plan);
  }

  const best = selectBestPlan(plans, input.budget);
  if (!best) {
    return {
      status: 'FAILED',
      reason: 'NO_PRICEABLE_WEEK',
      message: 'Geen enkele combinatie was te prijzen.',
    };
  }

  return {
    status: 'OK',
    plan: best,
    combinationsEvaluated: evaluatedCount,
    candidateRecipes: candidates.length,
  };
}

/**
 * Every way to pick `size` recipes out of `items`, in a stable order.
 *
 * A generator rather than an array: with a dozen candidates the list is small,
 * but holding hundreds of fully materialised weeks in memory to then throw them
 * away is pointless.
 */
export function* combinations<T>(items: readonly T[], size: number): Generator<T[]> {
  const indices = Array.from({ length: size }, (_, i) => i);
  if (size > items.length) return;

  for (;;) {
    yield indices.map((i) => items[i]!);

    let position = size - 1;
    while (position >= 0 && indices[position] === items.length - size + position) position -= 1;
    if (position < 0) return;
    indices[position] = indices[position]! + 1;
    for (let next = position + 1; next < size; next += 1) {
      indices[next] = indices[next - 1]! + 1;
    }
  }
}

export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** Convenience for tests: the objective score of a plan, in eurocent-equivalents. */
export function planScore(plan: WeeklyPlan): number {
  return plan.score.totalPenaltyCents;
}

export type { Household, IngredientIndex, StoreCandidate, OptimizerConfig };
