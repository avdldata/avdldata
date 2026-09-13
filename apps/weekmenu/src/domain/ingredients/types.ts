import type { BaseUnit } from '../units';
import type { NutritionPer100, NutritionSource } from '../nutrition/facts';

/** Shopping-list grouping, in the order a Dutch supermarket is walked. */
export const INGREDIENT_CATEGORIES = [
  'groente-fruit',
  'vlees-vis-vega',
  'zuivel',
  'brood-granen',
  'conserven',
  'kruiden-specerijen',
  'overig',
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

/** The 14 EU declarable allergens. */
export const ALLERGENS = [
  'gluten',
  'schaaldieren',
  'ei',
  'vis',
  'pinda',
  'soja',
  'melk',
  'noten',
  'selderij',
  'mosterd',
  'sesam',
  'sulfiet',
  'lupine',
  'weekdieren',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

/**
 * Why an ingredient is flagged during pregnancy.
 *
 * These labels drive a plain ingredient-exclusion filter. They are not medical
 * advice and the app says so; they exist so the planner never proposes a dish
 * that is commonly advised against.
 */
export const PREGNANCY_RISKS = [
  'rauw-vlees',
  'rauwe-vis',
  'rauw-ei',
  'ongepasteuriseerd',
  'lever-vitamine-a',
  'kwikrijke-vis',
  'alcohol',
  'rauwmelkse-kaas',
] as const;
export type PregnancyRisk = (typeof PREGNANCY_RISKS)[number];

/**
 * How much a leftover of this ingredient actually hurts.
 * 200 g of leftover dry rice is not food waste; 200 g of leftover fresh fish is.
 */
export const PERISHABILITY = ['perishable', 'semi', 'pantry'] as const;
export type Perishability = (typeof PERISHABILITY)[number];

export type IngredientId = string;

/**
 * The canonical ingredient. Recipes and supermarket products both point at one
 * of these, which is what makes cross-recipe aggregation and cross-store price
 * comparison possible at all.
 */
export interface CanonicalIngredient {
  readonly id: IngredientId;
  readonly canonicalName: string;
  readonly category: IngredientCategory;
  readonly baseUnit: BaseUnit;
  /** g per ml — needed to convert volume to mass and back. */
  readonly density?: number;
  /** Average weight of one piece in grams (e.g. one onion ≈ 110 g). */
  readonly pieceWeightGrams?: number;
  readonly perishability: Perishability;
  readonly allergens: readonly Allergen[];
  readonly pregnancyRisks: readonly PregnancyRisk[];
  readonly vegetarian: boolean;
  readonly vegan: boolean;
  /** Staples the planner never puts on the shopping list (salt, pepper, water). */
  readonly pantryStaple?: boolean;
  /**
   * Generic nutrition per 100 g / 100 ml.
   *
   * This is the fallback used whenever a concrete product does not declare its
   * own values, and it is what recipe nutrition is computed from. Optional in
   * the type so an ingredient can exist before its nutrition has been imported.
   */
  readonly nutritionPer100?: NutritionPer100;
  readonly nutritionSource?: NutritionSource;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/**
 * Alternative spellings for an ingredient.
 *
 * Kept as its own record rather than an array on the ingredient, because
 * aliases arrive from a different place than the ingredient itself (an import,
 * a recipe author, a supermarket feed) and each one wants its own provenance.
 * V1 fills them by hand — deliberately no fuzzy matching.
 */
export interface IngredientAlias {
  readonly id: string;
  readonly ingredientId: IngredientId;
  readonly alias: string;
  readonly source: 'demo-seed' | 'handmatig' | 'import';
}

export type AliasIndex = ReadonlyMap<string, IngredientId>;

export function buildAliasIndex(aliases: readonly IngredientAlias[]): AliasIndex {
  return new Map(aliases.map((alias) => [normaliseName(alias.alias), alias.ingredientId]));
}

export type IngredientIndex = ReadonlyMap<IngredientId, CanonicalIngredient>;

export function buildIngredientIndex(ingredients: readonly CanonicalIngredient[]): IngredientIndex {
  return new Map(ingredients.map((i) => [i.id, i]));
}

/**
 * Resolve free text to a canonical ingredient, via its own name or an alias.
 *
 * Exact match on a normalised string only — no fuzzy matching, by design. A
 * smarter resolver can be dropped in behind this signature later without
 * anything else changing.
 */
export function resolveIngredientName(
  name: string,
  ingredients: readonly CanonicalIngredient[],
  aliases: AliasIndex = new Map(),
): CanonicalIngredient | undefined {
  const needle = normaliseName(name);
  const direct = ingredients.find((i) => normaliseName(i.canonicalName) === needle);
  if (direct) return direct;
  const aliased = aliases.get(needle);
  return aliased ? ingredients.find((i) => i.id === aliased) : undefined;
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
