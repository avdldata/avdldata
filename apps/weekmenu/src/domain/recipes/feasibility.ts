import type { IngredientIndex } from '../ingredients/types';
import type { Recipe } from './types';

/**
 * Can this dish actually be bought?
 *
 * A recipe that names an ingredient no chain stocks is not a recipe the planner
 * can put on a Tuesday — it will either be dropped or bought at an availability
 * penalty, and either way the library is smaller than its count suggests. The
 * question is asked per chain and for the three combined, because a dish that
 * needs two chains is fine for someone who shops at both and useless for
 * someone who does not.
 *
 * Pantry staples are excluded on purpose: salt and pepper never reach the
 * shopping list, so their absence from a snapshot says nothing about the dish.
 * Optional lines are excluded for the same reason — the dish works without them.
 */
export interface RecipeFeasibility {
  readonly recipeId: string;
  /** Chain ids where every required ingredient can be bought. */
  readonly chains: readonly string[];
  readonly feasibleCombined: boolean;
  /** Required ingredients no chain in the set offers at all. */
  readonly missingEverywhere: readonly string[];
}

export function requiredIngredientIds(
  recipe: Recipe,
  ingredients: IngredientIndex,
): readonly string[] {
  return [
    ...new Set(
      recipe.ingredients
        .filter((line) => !line.optional && !ingredients.get(line.ingredientId)?.pantryStaple)
        .map((line) => line.ingredientId),
    ),
  ].sort();
}

export function assessFeasibility(
  recipe: Recipe,
  ingredients: IngredientIndex,
  offersByChain: ReadonlyMap<string, ReadonlySet<string>>,
): RecipeFeasibility {
  const required = requiredIngredientIds(recipe, ingredients);
  const chains: string[] = [];
  for (const [chainId, offered] of [...offersByChain].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (required.every((id) => offered.has(id))) chains.push(chainId);
  }
  const anywhere = new Set<string>();
  for (const offered of offersByChain.values()) for (const id of offered) anywhere.add(id);
  const missing = required.filter((id) => !anywhere.has(id));
  return {
    recipeId: recipe.id,
    chains,
    feasibleCombined: missing.length === 0,
    missingEverywhere: missing,
  };
}

/**
 * May a recipe be offered to the planner at all?
 *
 * Feasibility above answers "where can this be bought"; this answers the
 * harder-edged question in front of it. A recipe naming an ingredient that no
 * shop in the active catalogue sells cannot be cooked from a shopping list this
 * app produces, and offering it anyway leaves the user with a plan they cannot
 * complete. There is no honest fallback: a missing product must not become a
 * zero price, a guessed price, a demo product, or a line quietly dropped.
 *
 * So such a recipe is a *record*, not an option. It stays in the library with
 * its reason attached — the gap is in the price data, not in the dish — and
 * `pnpm recipes:report` prints exactly which ingredient is holding it back.
 */
export const RECIPE_AVAILABILITY = [
  'PRODUCTION_AVAILABLE',
  'PRODUCTION_UNAVAILABLE_DATA_GAP',
] as const;
export type RecipeAvailability = (typeof RECIPE_AVAILABILITY)[number];

export interface AvailabilityVerdict {
  readonly recipeId: string;
  readonly status: RecipeAvailability;
  /** Required ingredients no shop in the universe sells. Empty when available. */
  readonly missingIngredientIds: readonly string[];
}

export function assessAvailability(
  recipe: Recipe,
  ingredients: IngredientIndex,
  purchasable: ReadonlySet<string>,
): AvailabilityVerdict {
  const missing = requiredIngredientIds(recipe, ingredients).filter((id) => !purchasable.has(id));
  return {
    recipeId: recipe.id,
    status: missing.length === 0 ? 'PRODUCTION_AVAILABLE' : 'PRODUCTION_UNAVAILABLE_DATA_GAP',
    missingIngredientIds: missing,
  };
}

export interface AvailabilityPartition {
  /** The recipes the week generator may draw from. */
  readonly available: readonly Recipe[];
  /** The rest, each with the ingredient that is holding it back. */
  readonly unavailable: readonly AvailabilityVerdict[];
}

export function partitionByAvailability(
  recipes: readonly Recipe[],
  ingredients: IngredientIndex,
  purchasable: ReadonlySet<string>,
): AvailabilityPartition {
  const available: Recipe[] = [];
  const unavailable: AvailabilityVerdict[] = [];
  for (const recipe of recipes) {
    const verdict = assessAvailability(recipe, ingredients, purchasable);
    if (verdict.status === 'PRODUCTION_AVAILABLE') available.push(recipe);
    else unavailable.push(verdict);
  }
  return { available, unavailable };
}
