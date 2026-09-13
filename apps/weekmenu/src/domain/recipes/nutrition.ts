import type { CanonicalIngredient, IngredientIndex } from '../ingredients/types';
import { addNutrition, scaleNutrition, ZERO_NUTRITION } from '../nutrition/facts';
import type { NutritionPer100 } from '../nutrition/facts';
import type { NutritionPerServing, RecipeIngredient } from './types';

export interface ComputedRecipeNutrition {
  readonly perServing: NutritionPerServing;
  /** Fraction of the counted ingredient lines that had nutrition data (0–1). */
  readonly coverage: number;
  readonly missingIngredientIds: readonly string[];
}

/**
 * Compute a recipe's nutrition from its ingredients.
 *
 * This is the direction the data is supposed to flow: a recipe knows what goes
 * into it, the catalogue knows what those things contain, so the recipe's
 * nutrition is a consequence rather than a second set of numbers that can drift.
 *
 * Two deliberate choices:
 *  - Optional ingredients do not count. They are not bought either, so counting
 *    them would report a dish nobody actually cooks.
 *  - Pantry staples (salt, pepper) DO count. They never reach the shopping list,
 *    but they very much reach the plate — leaving salt out would be misleading.
 *
 * When an ingredient has no nutrition data the line is skipped and `coverage`
 * drops, so the caller can fall back rather than silently under-report.
 */
export function computeRecipeNutrition(
  ingredients: readonly RecipeIngredient[],
  index: IngredientIndex,
): ComputedRecipeNutrition {
  const counted = ingredients.filter((line) => !line.optional);
  const missing: string[] = [];
  let total: NutritionPer100 = ZERO_NUTRITION;

  for (const line of counted) {
    const ingredient = index.get(line.ingredientId);
    if (!ingredient?.nutritionPer100) {
      missing.push(line.ingredientId);
      continue;
    }
    const grams = nutritionAmountFor(line, ingredient);
    if (grams <= 0) continue;
    total = addNutrition(total, scaleNutrition(ingredient.nutritionPer100, grams / 100));
  }

  return {
    perServing: {
      kcal: Math.round(total.kcal),
      proteinGrams: round1(total.protein),
      carbGrams: round1(total.carbohydrates),
      fatGrams: round1(total.fat),
      fiberGrams: round1(total.fiber),
      saltGrams: round2(total.salt),
      sugarsGrams: round1(total.sugars),
      saturatedFatGrams: round1(total.saturatedFat),
    },
    coverage: counted.length === 0 ? 1 : (counted.length - missing.length) / counted.length,
    missingIngredientIds: missing,
  };
}

/**
 * How much of this ingredient the nutrition table should be applied to.
 *
 * Values are stored per 100 g for solids and per 100 ml for liquids, so a
 * quantity already in the ingredient's own base unit needs no conversion.
 * Pieces are the exception: they become grams via the average piece weight.
 */
function nutritionAmountFor(line: RecipeIngredient, ingredient: CanonicalIngredient): number {
  if (line.perServing.unit !== 'piece') return line.perServing.amount;
  return line.perServing.amount * (ingredient.pieceWeightGrams ?? 0);
}

/** How far a computed value sits from the hand-written one, as a fraction. */
export function nutritionDeviation(
  computed: NutritionPerServing,
  authored: NutritionPerServing,
): number {
  if (authored.kcal <= 0) return 0;
  return Math.abs(computed.kcal - authored.kcal) / authored.kcal;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
