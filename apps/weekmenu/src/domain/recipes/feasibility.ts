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
