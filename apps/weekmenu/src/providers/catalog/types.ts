import type {
  Brand,
  Product,
  SupermarketChain,
  SupermarketLocation,
} from '@/domain/stores/types';
import type { CanonicalIngredient, IngredientAlias } from '@/domain/ingredients/types';

export interface ProductSearchQuery {
  /** Restrict to products for these canonical ingredients. */
  readonly ingredientIds?: readonly string[];
  readonly chainIds?: readonly string[];
  /** Include delisted articles. Off by default; history keeps them around. */
  readonly includeInactive?: boolean;
}

/**
 * The catalogue: what exists, not what it costs.
 *
 * Chains, shops, brands, canonical ingredients, their aliases and the concrete
 * articles on the shelf. Everything here is comparatively stable — prices and
 * promotions live behind `SupermarketPriceProvider` precisely because they are not.
 *
 * A real implementation would sit on a product feed (GS1, a chain's own API).
 * Nothing in `src/domain` knows which.
 */
export interface ProductCatalogProvider {
  readonly id: string;
  getChains(): Promise<readonly SupermarketChain[]>;
  getStores(): Promise<readonly SupermarketLocation[]>;
  getBrands(): Promise<readonly Brand[]>;
  getIngredients(): Promise<readonly CanonicalIngredient[]>;
  getIngredientAliases(): Promise<readonly IngredientAlias[]>;
  searchProducts(query: ProductSearchQuery): Promise<readonly Product[]>;
}
