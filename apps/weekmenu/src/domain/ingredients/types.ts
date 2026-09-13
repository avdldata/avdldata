import type { BaseUnit } from '../units';

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
  /** Alternative spellings; the hook for automatic normalisation later. */
  readonly synonyms: readonly string[];
  /** Staples the planner never puts on the shopping list (salt, pepper, water). */
  readonly pantryStaple?: boolean;
}

export type IngredientIndex = ReadonlyMap<IngredientId, CanonicalIngredient>;

export function buildIngredientIndex(
  ingredients: readonly CanonicalIngredient[],
): IngredientIndex {
  return new Map(ingredients.map((i) => [i.id, i]));
}

/**
 * Resolve a free-text ingredient name to a canonical id via its synonyms.
 * V1 only uses this for seed validation and for the ingredient picker in the UI;
 * a fuzzier resolver can be dropped in behind the same signature later.
 */
export function resolveIngredientName(
  name: string,
  ingredients: readonly CanonicalIngredient[],
): CanonicalIngredient | undefined {
  const needle = normaliseName(name);
  return ingredients.find(
    (i) =>
      normaliseName(i.canonicalName) === needle ||
      i.synonyms.some((s) => normaliseName(s) === needle),
  );
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
