import type { PriceObservation, Promotion } from '@/domain/stores/types';

export interface PriceQuery {
  /** ISO date the prices should be valid on. */
  readonly onDate: string;
  readonly chainIds?: readonly string[];
  readonly locationIds?: readonly string[];
  readonly productIds?: readonly string[];
  /**
   * How far back to return observations. Defaults to the whole history the
   * provider has; the reference price and deal score need more than today's row.
   */
  readonly since?: string;
}

/**
 * Prices and promotions over time.
 *
 * Separate from the catalogue because it changes on a completely different
 * clock, and it returns *observations* rather than a single current price, so
 * a new reading never destroys the previous one.
 */
export interface SupermarketPriceProvider {
  readonly id: string;
  getPriceObservations(query: PriceQuery): Promise<readonly PriceObservation[]>;
  getPromotions(query: PriceQuery): Promise<readonly Promotion[]>;
}
