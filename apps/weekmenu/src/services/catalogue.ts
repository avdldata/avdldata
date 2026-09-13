import 'server-only';
import { buildIngredientIndex, type CanonicalIngredient } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import type { Recipe } from '@/domain/recipes/types';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';

export interface Catalogue {
  readonly ingredients: readonly CanonicalIngredient[];
  readonly ingredientIndex: ReturnType<typeof buildIngredientIndex>;
  readonly recipes: readonly Recipe[];
}

let cached: Catalogue | undefined;

/**
 * The recipe and ingredient catalogue, normalised once per process.
 *
 * Normalisation (friendly units to base units, derived allergens, derived
 * vegetarian/vegan/pregnancy flags) is pure and deterministic, so caching it is
 * safe and keeps plan generation off the critical path.
 */
export function getCatalogue(): Catalogue {
  if (cached) return cached;
  const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
  cached = {
    ingredients: SEED_INGREDIENTS,
    ingredientIndex,
    recipes: normaliseRecipes(SEED_RECIPES, ingredientIndex),
  };
  return cached;
}
