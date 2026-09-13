import type {
  Product,
  ProductPrice,
  Promotion,
  SupermarketChain,
  SupermarketLocation,
} from '@/domain/stores/types';

export interface PriceQuery {
  /** ISO date the prices should be valid on. */
  readonly onDate: string;
  readonly chainIds?: readonly string[];
  readonly locationIds?: readonly string[];
}

/**
 * The seam between this application and real supermarket data.
 *
 * Nothing in `src/domain` knows that Albert Heijn, Jumbo or Lidl exist. The
 * optimizer receives chains, locations, products, prices and promotions through
 * this interface, so adding a real provider is a matter of implementing five
 * methods — see ARCHITECTURE.md, "Een echte prijsprovider toevoegen".
 */
export interface SupermarketProvider {
  readonly id: string;
  getChains(): Promise<readonly SupermarketChain[]>;
  getStores(): Promise<readonly SupermarketLocation[]>;
  getProducts(query: PriceQuery): Promise<readonly Product[]>;
  getPrices(query: PriceQuery): Promise<readonly ProductPrice[]>;
  getPromotions(query: PriceQuery): Promise<readonly Promotion[]>;
}
