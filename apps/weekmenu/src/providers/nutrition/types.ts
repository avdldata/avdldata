import type { IngredientNutrition } from '@/domain/nutrition/facts';
import type { ProductNutrition } from '@/domain/stores/types';

/**
 * Food composition data.
 *
 * Generic values per canonical ingredient (the kind of thing NEVO publishes)
 * and article-specific values per product (the kind of thing a product feed or
 * the back of the pack provides). The engines never import a dataset directly,
 * so a licensed source can be swapped in without touching the calculations.
 */
export interface NutritionDataProvider {
  readonly id: string;
  getIngredientNutrition(
    ingredientIds?: readonly string[],
  ): Promise<readonly IngredientNutrition[]>;
  getProductNutrition(productIds?: readonly string[]): Promise<readonly ProductNutrition[]>;
}
