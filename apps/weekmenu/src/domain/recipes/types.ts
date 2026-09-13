import type { AuthoringUnit, Quantity } from '../units';
import type { Allergen, IngredientId } from '../ingredients/types';

export const CUISINES = [
  'nederlands',
  'italiaans',
  'mexicaans',
  'aziatisch',
  'mediterraan',
  'indiaas',
  'grieks',
  'frans',
] as const;
export type Cuisine = (typeof CUISINES)[number];

export const RECIPE_TAGS = [
  'pasta',
  'rijst',
  'aardappelen',
  'wraps',
  'brood',
  'peulvruchten',
  'noedels',
  'vegetarisch',
  'veganistisch',
  'vis',
  'kip',
  'rundvlees',
  'varkensvlees',
  'ovenschotel',
  'eenpansgerecht',
  'soep',
  'salade',
  'snel',
  'budget',
  'comfortfood',
] as const;
export type RecipeTag = (typeof RECIPE_TAGS)[number];

/**
 * The dominant protein of a dish. Used by the diversity rules so a week does
 * not turn into "chicken, chicken, chicken, chicken".
 */
export const PRIMARY_PROTEINS = [
  'kip',
  'rund',
  'varken',
  'vis',
  'ei',
  'peulvrucht',
  'zuivel',
  'plantaardig-vlees',
  'geen',
] as const;
export type PrimaryProtein = (typeof PRIMARY_PROTEINS)[number];

export const DIFFICULTIES = ['makkelijk', 'gemiddeld', 'uitdagend'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type RecipeId = string;

/** Nutrition for exactly one standard serving of the recipe. */
export interface NutritionPerServing {
  readonly kcal: number;
  readonly proteinGrams: number;
  readonly carbGrams: number;
  readonly fatGrams: number;
  readonly fiberGrams: number;
  readonly saltGrams: number;
}

/** As authored in the seed — friendly units allowed. */
export interface AuthoredRecipeIngredient {
  readonly ingredientId: IngredientId;
  readonly amount: number;
  readonly unit: AuthoringUnit;
  readonly optional?: boolean;
  readonly note?: string;
}

/** After normalisation — base units only, this is what the engines see. */
export interface RecipeIngredient {
  readonly ingredientId: IngredientId;
  /** Quantity for ONE standard serving, in the ingredient's base unit. */
  readonly perServing: Quantity;
  readonly optional: boolean;
  readonly note?: string;
}

export interface AuthoredRecipe {
  readonly id: RecipeId;
  readonly name: string;
  readonly description: string;
  readonly imageUrl: string;
  readonly steps: readonly string[];
  readonly prepMinutes: number;
  readonly cookMinutes: number;
  readonly difficulty: Difficulty;
  readonly cuisine: Cuisine;
  readonly tags: readonly RecipeTag[];
  readonly baseServings: number;
  readonly ingredients: readonly AuthoredRecipeIngredient[];
  readonly nutritionPerServing: NutritionPerServing;
  readonly primaryProtein: PrimaryProtein;
  /** Overrides; allergens and suitability are otherwise derived from ingredients. */
  readonly extraAllergens?: readonly Allergen[];
  readonly pregnancySuitableOverride?: boolean;
}

export interface Recipe {
  readonly id: RecipeId;
  readonly name: string;
  readonly description: string;
  readonly imageUrl: string;
  readonly steps: readonly string[];
  readonly prepMinutes: number;
  readonly cookMinutes: number;
  readonly totalMinutes: number;
  readonly difficulty: Difficulty;
  readonly cuisine: Cuisine;
  readonly tags: readonly RecipeTag[];
  readonly baseServings: number;
  readonly ingredients: readonly RecipeIngredient[];
  readonly nutritionPerServing: NutritionPerServing;
  readonly primaryProtein: PrimaryProtein;
  /** Derived from the ingredients (plus any explicit extras). */
  readonly allergens: readonly Allergen[];
  readonly vegetarian: boolean;
  readonly vegan: boolean;
  readonly pregnancySuitable: boolean;
  /** Which pregnancy risks the dish carries, so the UI can explain the exclusion. */
  readonly pregnancyRiskReasons: readonly string[];
}

export type RecipeIndex = ReadonlyMap<RecipeId, Recipe>;

export function buildRecipeIndex(recipes: readonly Recipe[]): RecipeIndex {
  return new Map(recipes.map((r) => [r.id, r]));
}
