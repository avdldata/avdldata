import type {
  Brand,
  PriceObservation,
  Product,
  ProductNutrition,
  Promotion,
  SupermarketChain,
  SupermarketLocation,
} from '@/domain/stores/types';
import type { CanonicalIngredient, IngredientAlias } from '@/domain/ingredients/types';
import type { IngredientNutrition } from '@/domain/nutrition/facts';
import { SEED_CHAINS, SEED_LOCATIONS } from '@/data/seed/stores';
import { SEED_BRANDS } from '@/data/seed/brands';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import {
  buildSeedPriceObservations,
  buildSeedProducts,
  buildSeedPromotions,
} from '@/data/seed/products';
import type { ProductCatalogProvider, ProductSearchQuery } from './catalog/types';
import type { PriceQuery, SupermarketPriceProvider } from './pricing/types';
import type { NutritionDataProvider } from './nutrition/types';

/**
 * The V1 provider: catalogue, prices and nutrition all come from the seeded
 * demo dataset.
 *
 * It implements the three interfaces separately even though one class backs
 * them, because that is the seam: a real deployment can keep this for nutrition
 * while pointing the price provider at a live feed, without anything else
 * noticing. It behaves like a remote provider would — async, query-scoped,
 * date-aware.
 */
export class SeedDataProvider
  implements ProductCatalogProvider, SupermarketPriceProvider, NutritionDataProvider
{
  readonly id = 'seed';

  private readonly catalogue = buildSeedProducts();

  // ---- ProductCatalogProvider ---------------------------------------------

  async getChains(): Promise<readonly SupermarketChain[]> {
    return SEED_CHAINS;
  }

  async getStores(): Promise<readonly SupermarketLocation[]> {
    return SEED_LOCATIONS;
  }

  async getBrands(): Promise<readonly Brand[]> {
    return SEED_BRANDS;
  }

  async getIngredients(): Promise<readonly CanonicalIngredient[]> {
    return SEED_INGREDIENTS;
  }

  async getIngredientAliases(): Promise<readonly IngredientAlias[]> {
    return SEED_INGREDIENT_ALIASES;
  }

  async searchProducts(query: ProductSearchQuery): Promise<readonly Product[]> {
    const chains = query.chainIds?.length ? new Set(query.chainIds) : undefined;
    const ingredients = query.ingredientIds?.length ? new Set(query.ingredientIds) : undefined;

    return this.catalogue.products.filter(
      (product) =>
        (query.includeInactive || product.active) &&
        (!chains || chains.has(product.chainId)) &&
        (!ingredients || ingredients.has(product.canonicalIngredientId)),
    );
  }

  // ---- SupermarketPriceProvider -------------------------------------------

  async getPriceObservations(query: PriceQuery): Promise<readonly PriceObservation[]> {
    const productIds = await this.productIdsFor(query);
    return buildSeedPriceObservations(query.onDate).filter(
      (observation) =>
        productIds.has(observation.productId) &&
        (!query.since || observation.observedAt >= query.since),
    );
  }

  async getPromotions(query: PriceQuery): Promise<readonly Promotion[]> {
    const productIds = await this.productIdsFor(query);
    return buildSeedPromotions(query.onDate).filter((promotion) =>
      productIds.has(promotion.productId),
    );
  }

  // ---- NutritionDataProvider ----------------------------------------------

  async getIngredientNutrition(
    ingredientIds?: readonly string[],
  ): Promise<readonly IngredientNutrition[]> {
    const wanted = ingredientIds?.length ? new Set(ingredientIds) : undefined;
    return SEED_INGREDIENTS.flatMap((ingredient) =>
      ingredient.nutritionPer100 && (!wanted || wanted.has(ingredient.id))
        ? [
            {
              ingredientId: ingredient.id,
              per100: ingredient.nutritionPer100,
              source: ingredient.nutritionSource ?? ('demo-seed' as const),
            },
          ]
        : [],
    );
  }

  async getProductNutrition(productIds?: readonly string[]): Promise<readonly ProductNutrition[]> {
    const wanted = productIds?.length ? new Set(productIds) : undefined;
    return this.catalogue.productNutrition.filter(
      (entry) => !wanted || wanted.has(entry.productId),
    );
  }

  private async productIdsFor(query: PriceQuery): Promise<ReadonlySet<string>> {
    if (query.productIds?.length) return new Set(query.productIds);
    const products = await this.searchProducts(
      query.chainIds?.length ? { chainIds: query.chainIds } : {},
    );
    return new Set(products.map((product) => product.id));
  }
}
