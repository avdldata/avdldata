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

/**
 * Which meal of the day a recipe is for.
 *
 * The planner only fills dinner slots, so every production recipe is a dinner.
 * The field exists so that "is this a dinner?" is a stated property rather than
 * something a classifier has to guess from the title — the recipe census showed
 * exactly how badly that guessing goes on someone else's corpus.
 */
export const MEAL_TYPES = ['dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/**
 * The licence under which a recipe may be used.
 *
 * Only the first two may reach production. The rest exist so a candidate that
 * cannot be used is recorded as such instead of quietly disappearing, and so
 * the licence report can prove the production library contains none of them.
 */
export const RECIPE_LICENCES = [
  /** Written for this project. No third-party rights involved. */
  'INTERNAL',
  /** Verified public domain (e.g. CC0, or expired copyright). */
  'PUBLIC_DOMAIN',
  /** Attribution required, commercial use allowed. Needs the attribution filled in. */
  'CC_BY',
  /** Share-alike. Allowed commercially, but viral — kept out of production for now. */
  'CC_BY_SA',
  /** Research/non-commercial only. Never production. */
  'NON_COMMERCIAL_RESEARCH',
  /** Rights not established. Never production. */
  'UNKNOWN',
] as const;
export type RecipeLicence = (typeof RECIPE_LICENCES)[number];

/** Licences a recipe may carry and still be shipped in the app. */
export const PRODUCTION_SAFE_LICENCES: readonly RecipeLicence[] = ['INTERNAL', 'PUBLIC_DOMAIN'];

export function isProductionSafeLicence(licence: RecipeLicence): boolean {
  return PRODUCTION_SAFE_LICENCES.includes(licence);
}

/**
 * Where a recipe came from.
 *
 * `INTERNAL` means the title, the quantities and the steps were written here.
 * Anything else names the corpus it came from so the claim can be checked, and
 * `licence` is what decides whether it may ship — never the other way round.
 */
export interface RecipeProvenance {
  readonly kind: 'INTERNAL' | 'EXTERNAL';
  readonly licence: RecipeLicence;
  /** Corpus or author, for an external recipe. */
  readonly source?: string;
  readonly sourceUrl?: string;
  /** Attribution line to display, when the licence requires one. */
  readonly attribution?: string;
  readonly addedAt: string;
  readonly note?: string;
}

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
  /** Present when the values were computed from ingredient nutrition. */
  readonly sugarsGrams?: number;
  readonly saturatedFatGrams?: number;
}

/** As authored in the seed — friendly units allowed. */
export interface AuthoredRecipeIngredient {
  readonly ingredientId: IngredientId;
  readonly amount: number;
  readonly unit: AuthoringUnit;
  readonly optional?: boolean;
  readonly note?: string;
  /**
   * The specific variant the dish is written around, when the shape matters.
   *
   * Tagliatelle under a ragù and fusilli in a pasta salad are not
   * interchangeable to a cook even though both are `pasta` to the shopping
   * list. Naming the variant lets the recipe say so without splitting the
   * canonical ingredient, and the aggregation keeps buying the parent — which
   * is exactly what `substitutable: true` in the taxonomy means.
   */
  readonly variantId?: string;
}

/** After normalisation — base units only, this is what the engines see. */
export interface RecipeIngredient {
  readonly ingredientId: IngredientId;
  /** Quantity for ONE standard serving, in the ingredient's base unit. */
  readonly perServing: Quantity;
  readonly optional: boolean;
  readonly note?: string;
  readonly variantId?: string;
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
  readonly mealType: MealType;
  readonly tags: readonly RecipeTag[];
  readonly baseServings: number;
  readonly ingredients: readonly AuthoredRecipeIngredient[];
  /**
   * A hand-written cross-check on the engine's own figure.
   *
   * Optional, and deliberately so. It exists for a recipe that arrived with
   * nutrition attached, where two independent numbers catch a mistake in either
   * dataset. Writing one out by hand for a recipe authored here would be a
   * second copy of the same arithmetic wearing a disguise: it would always
   * agree, and the test that compares them would stop meaning anything. A
   * recipe without it is required to have full ingredient coverage instead.
   */
  readonly nutritionPerServing?: NutritionPerServing;
  readonly primaryProtein: PrimaryProtein;
  readonly provenance: RecipeProvenance;
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
  readonly mealType: MealType;
  readonly tags: readonly RecipeTag[];
  readonly baseServings: number;
  readonly ingredients: readonly RecipeIngredient[];
  /**
   * Nutrition for one standard serving, computed from the ingredients wherever
   * the catalogue has the data — see `computeRecipeNutrition`.
   */
  readonly nutritionPerServing: NutritionPerServing;
  /** The hand-written values, kept as a cross-check against the computed ones. */
  readonly authoredNutritionPerServing?: NutritionPerServing;
  readonly nutritionSource: 'derived' | 'authored';
  /** Fraction of the recipe's ingredients that had nutrition data (0–1). */
  readonly nutritionCoverage: number;
  readonly primaryProtein: PrimaryProtein;
  /** Derived from the ingredients (plus any explicit extras). */
  readonly allergens: readonly Allergen[];
  readonly vegetarian: boolean;
  readonly vegan: boolean;
  readonly pregnancySuitable: boolean;
  /** Which pregnancy risks the dish carries, so the UI can explain the exclusion. */
  readonly pregnancyRiskReasons: readonly string[];
  readonly provenance: RecipeProvenance;
}

export type RecipeIndex = ReadonlyMap<RecipeId, Recipe>;

export function buildRecipeIndex(recipes: readonly Recipe[]): RecipeIndex {
  return new Map(recipes.map((r) => [r.id, r]));
}
