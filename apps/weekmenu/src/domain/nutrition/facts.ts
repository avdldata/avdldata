/**
 * Nutrition facts, always expressed per 100 g or per 100 ml.
 *
 * Per-100 is the unit every serious food-data source publishes in (NEVO, GS1
 * product feeds, the back of the pack), so storing it that way means an import
 * never has to guess a portion size. Conversion to an actual amount happens in
 * one place — `scaleNutrition` — and nowhere else.
 */
export const MICRONUTRIENTS = [
  'calcium',
  'iron',
  'folate',
  'vitaminB12',
  'vitaminD',
  'iodine',
  'zinc',
  'magnesium',
] as const;
export type Micronutrient = (typeof MICRONUTRIENTS)[number];

export interface NutritionPer100 {
  readonly kcal: number;
  readonly protein: number;
  readonly carbohydrates: number;
  readonly sugars: number;
  readonly fat: number;
  readonly saturatedFat: number;
  readonly fiber: number;
  readonly salt: number;
  /** Micrograms or milligrams per 100, depending on the nutrient. Optional. */
  readonly micronutrients?: Partial<Record<Micronutrient, number>>;
}

/**
 * Where a nutrition record came from. Recorded so the UI can be honest about
 * whether a number is a product's own declaration or a generic estimate.
 */
export const NUTRITION_SOURCES = ['demo-seed', 'nevo', 'gs1', 'product-label', 'derived'] as const;
export type NutritionSource = (typeof NUTRITION_SOURCES)[number];

export interface IngredientNutrition {
  readonly ingredientId: string;
  readonly per100: NutritionPer100;
  readonly source: NutritionSource;
}

export interface ProductNutrition {
  readonly productId: string;
  readonly per100: NutritionPer100;
  readonly source: NutritionSource;
  readonly updatedAt: string;
}

export const ZERO_NUTRITION: NutritionPer100 = {
  kcal: 0,
  protein: 0,
  carbohydrates: 0,
  sugars: 0,
  fat: 0,
  saturatedFat: 0,
  fiber: 0,
  salt: 0,
};

/** Scale per-100 values to an actual amount of grams or millilitres. */
export function scaleNutrition(per100: NutritionPer100, amountPer100: number): NutritionPer100 {
  const scaled: NutritionPer100 = {
    kcal: per100.kcal * amountPer100,
    protein: per100.protein * amountPer100,
    carbohydrates: per100.carbohydrates * amountPer100,
    sugars: per100.sugars * amountPer100,
    fat: per100.fat * amountPer100,
    saturatedFat: per100.saturatedFat * amountPer100,
    fiber: per100.fiber * amountPer100,
    salt: per100.salt * amountPer100,
  };
  if (!per100.micronutrients) return scaled;
  return {
    ...scaled,
    micronutrients: Object.fromEntries(
      Object.entries(per100.micronutrients).map(([key, value]) => [key, value * amountPer100]),
    ),
  };
}

export function addNutrition(a: NutritionPer100, b: NutritionPer100): NutritionPer100 {
  const sum: NutritionPer100 = {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbohydrates: a.carbohydrates + b.carbohydrates,
    sugars: a.sugars + b.sugars,
    fat: a.fat + b.fat,
    saturatedFat: a.saturatedFat + b.saturatedFat,
    fiber: a.fiber + b.fiber,
    salt: a.salt + b.salt,
  };
  if (!a.micronutrients && !b.micronutrients) return sum;

  const micronutrients: Partial<Record<Micronutrient, number>> = { ...a.micronutrients };
  for (const [key, value] of Object.entries(b.micronutrients ?? {})) {
    const nutrient = key as Micronutrient;
    micronutrients[nutrient] = (micronutrients[nutrient] ?? 0) + value;
  }
  return { ...sum, micronutrients };
}

export function roundNutrition(value: NutritionPer100): NutritionPer100 {
  const round1 = (n: number): number => Math.round(n * 10) / 10;
  return {
    kcal: Math.round(value.kcal),
    protein: round1(value.protein),
    carbohydrates: round1(value.carbohydrates),
    sugars: round1(value.sugars),
    fat: round1(value.fat),
    saturatedFat: round1(value.saturatedFat),
    fiber: round1(value.fiber),
    salt: Math.round(value.salt * 100) / 100,
    ...(value.micronutrients ? { micronutrients: value.micronutrients } : {}),
  };
}
