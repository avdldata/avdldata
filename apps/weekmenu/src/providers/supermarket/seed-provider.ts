import type {
  Product,
  ProductPrice,
  Promotion,
  SupermarketChain,
  SupermarketLocation,
} from '@/domain/stores/types';
import { SEED_CHAINS, SEED_LOCATIONS } from '@/data/seed/stores';
import { buildSeedProducts, buildSeedPromotions } from '@/data/seed/products';
import type { PriceQuery, SupermarketProvider } from './types';

/**
 * The V1 provider: everything comes from the seeded demo dataset.
 *
 * It behaves exactly like a remote provider would — async, query-scoped,
 * date-aware — so swapping in a real one changes no calling code.
 */
export class SeedSupermarketProvider implements SupermarketProvider {
  readonly id = 'seed';

  private readonly catalogue = buildSeedProducts();

  async getChains(): Promise<readonly SupermarketChain[]> {
    return SEED_CHAINS;
  }

  async getStores(): Promise<readonly SupermarketLocation[]> {
    return SEED_LOCATIONS;
  }

  async getProducts(query: PriceQuery): Promise<readonly Product[]> {
    return filterByChain(this.catalogue.products, query, (p) => p.chainId);
  }

  async getPrices(query: PriceQuery): Promise<readonly ProductPrice[]> {
    const productIds = new Set((await this.getProducts(query)).map((p) => p.id));
    return this.catalogue.prices.filter((price) => productIds.has(price.productId));
  }

  async getPromotions(query: PriceQuery): Promise<readonly Promotion[]> {
    const productIds = new Set((await this.getProducts(query)).map((p) => p.id));
    return buildSeedPromotions(query.onDate).filter((promo) => productIds.has(promo.productId));
  }
}

function filterByChain<T>(
  items: readonly T[],
  query: PriceQuery,
  chainOf: (item: T) => string,
): readonly T[] {
  if (!query.chainIds || query.chainIds.length === 0) return items;
  const allowed = new Set(query.chainIds);
  return items.filter((item) => allowed.has(chainOf(item)));
}
