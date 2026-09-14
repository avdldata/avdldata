import type { Cents } from '../units';
import { calculateHouseholdNutrition, type MemberNutrition } from '../nutrition/calculate';
import { planPortions, type RecipePortions } from '../nutrition/portions';
import type { Recipe } from '../recipes/types';
import { DEFAULT_OPTIMIZER_CONFIG, extraStorePenaltyFor, type OptimizerConfig } from './config';
import { filterCandidateRecipes, type ExcludedRecipe } from './filter';
import { representativeStoresPerChain, type StoreCandidate } from './store-selection';
import type { OptimizerInput } from './week-optimizer';

/**
 * Everything that happens before a search decides anything.
 *
 * Household nutrition, the hard filter, portion scaling, which shops actually
 * count as distinct, how much an extra stop is worth — none of that depends on
 * which week you are considering, and all of it has to be identical for every
 * engine that looks at the same household. It used to be written out three
 * times: in the optimizer, in the exhaustive reference solver, and again in the
 * benchmark. Three copies of "what does this household need" is three chances
 * for the benchmark to measure two engines that disagree about the question
 * rather than about the answer.
 */

export interface PreparedOptimization {
  readonly status: 'OK';
  readonly config: OptimizerConfig;
  /** One representative store per chain, as the search is allowed to see them. */
  readonly stores: readonly StoreCandidate[];
  readonly maxStores: number;
  readonly memberNutrition: readonly MemberNutrition[];
  readonly candidates: readonly Recipe[];
  readonly excluded: readonly ExcludedRecipe[];
  readonly portionsByRecipe: ReadonlyMap<string, RecipePortions>;
  readonly home: { latitude: number; longitude: number };
  readonly extraStorePenalty: Cents;
}

export interface PreparationFailure {
  readonly status: 'FAILED';
  readonly reason: 'NO_MEMBERS' | 'NO_STORES' | 'NO_CANDIDATE_RECIPES' | 'NOT_ENOUGH_CANDIDATE_RECIPES';
  /** How many recipes survived the filter, for the caller's message. */
  readonly candidateCount: number;
  readonly excluded: readonly ExcludedRecipe[];
}

export function prepareOptimization(
  input: OptimizerInput,
): PreparedOptimization | PreparationFailure {
  const config = input.config ?? DEFAULT_OPTIMIZER_CONFIG;

  if (input.household.members.length === 0) {
    return { status: 'FAILED', reason: 'NO_MEMBERS', candidateCount: 0, excluded: [] };
  }

  const stores = representativeStoresPerChain(input.stores);
  if (stores.length === 0) {
    return { status: 'FAILED', reason: 'NO_STORES', candidateCount: 0, excluded: [] };
  }

  // "No maximum" is expressed as every selected chain, not as zero — a zero that
  // quietly became one would cap the plan to a single shop without saying so.
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

  if (candidates.length === 0) {
    return { status: 'FAILED', reason: 'NO_CANDIDATE_RECIPES', candidateCount: 0, excluded };
  }
  if (candidates.length < config.days) {
    return {
      status: 'FAILED',
      reason: 'NOT_ENOUGH_CANDIDATE_RECIPES',
      candidateCount: candidates.length,
      excluded,
    };
  }

  const portionsByRecipe = new Map<string, RecipePortions>();
  for (const recipe of candidates) {
    portionsByRecipe.set(recipe.id, planPortions(recipe, memberNutrition, config.nutrition));
  }

  return {
    status: 'OK',
    config,
    stores,
    maxStores,
    memberNutrition,
    candidates,
    excluded,
    portionsByRecipe,
    home: {
      latitude: input.household.location.latitude ?? stores[0]!.location.latitude,
      longitude: input.household.location.longitude ?? stores[0]!.location.longitude,
    },
    extraStorePenalty: extraStorePenaltyFor(input.conveniencePreference),
  };
}
