/**
 * The authoring helpers the recipe seed files share.
 *
 * Splitting these out keeps the recipe files themselves nothing but recipes,
 * which matters once there are a hundred and twenty of them: a reader scanning
 * for a dish should not have to scroll past the plumbing.
 */
import type { AuthoringUnit } from '@/domain/units';
import type {
  AuthoredRecipe,
  AuthoredRecipeIngredient,
  Cuisine,
  Difficulty,
  NutritionPerServing,
  PrimaryProtein,
  RecipeProvenance,
  RecipeTag,
} from '@/domain/recipes/types';

export function li(
  ingredientId: string,
  amount: number,
  unit: AuthoringUnit,
  optional = false,
): AuthoredRecipeIngredient {
  return { ingredientId, amount, unit, ...(optional ? { optional: true } : {}) };
}

export interface RecipeSpec {
  readonly description: string;
  readonly prep: number;
  readonly cook: number;
  readonly difficulty?: Difficulty;
  readonly servings?: number;
  readonly steps: readonly string[];
  readonly ingredients: readonly AuthoredRecipeIngredient[];
  /** Only the original demo recipes carry one; see AuthoredRecipe. */
  readonly nutrition?: NutritionPerServing;
  readonly pregnancySuitableOverride?: boolean;
  /** Only an externally sourced recipe states this; everything here is ours. */
  readonly provenance?: RecipeProvenance;
}

/**
 * Every recipe in this file was written for this project: the title, the
 * quantities and the steps. Nothing is copied or paraphrased from a cookbook,
 * a food blog or one of the scraped corpora, so the licence is unencumbered.
 *
 * An externally sourced recipe must override this with its real origin and its
 * real licence — see `isProductionSafeLicence`, which is what decides whether a
 * recipe may ship, and the licence report in `scripts/recipes-report.ts`.
 */
export const INTERNAL: RecipeProvenance = {
  kind: 'INTERNAL',
  licence: 'INTERNAL',
  addedAt: '2026-01-01T00:00:00.000Z',
};

export function r(
  id: string,
  name: string,
  cuisine: Cuisine,
  primaryProtein: PrimaryProtein,
  tags: readonly RecipeTag[],
  spec: RecipeSpec,
): AuthoredRecipe {
  return {
    id,
    name,
    description: spec.description,
    imageUrl: `/recipes/${id}.svg`,
    steps: spec.steps,
    prepMinutes: spec.prep,
    cookMinutes: spec.cook,
    difficulty: spec.difficulty ?? 'makkelijk',
    cuisine,
    mealType: 'dinner',
    tags,
    baseServings: spec.servings ?? 4,
    ingredients: spec.ingredients,
    ...(spec.nutrition !== undefined ? { nutritionPerServing: spec.nutrition } : {}),
    primaryProtein,
    provenance: spec.provenance ?? INTERNAL,
    ...(spec.pregnancySuitableOverride !== undefined
      ? { pregnancySuitableOverride: spec.pregnancySuitableOverride }
      : {}),
  };
}

export const n = (
  kcal: number,
  proteinGrams: number,
  carbGrams: number,
  fatGrams: number,
  fiberGrams: number,
  saltGrams: number,
): NutritionPerServing => ({ kcal, proteinGrams, carbGrams, fatGrams, fiberGrams, saltGrams });

