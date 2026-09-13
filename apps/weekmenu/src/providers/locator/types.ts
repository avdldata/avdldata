import type { SupermarketLocation } from '@/domain/stores/types';

export interface NearbyStoresQuery {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusKm: number;
  readonly chainIds?: readonly string[];
}

export interface NearbyStore {
  readonly location: SupermarketLocation;
  /** Estimated road distance from the household, in kilometres. */
  readonly distanceKm: number;
}

/**
 * Finding shops near a household.
 *
 * Business logic never talks to Google Maps, OpenStreetMap or a chain's own
 * store finder — it talks to this. The seeded implementation below does the
 * distance maths locally; a real one performs a lookup and returns the same shape.
 */
export interface StoreLocatorProvider {
  readonly id: string;
  findNearbyStores(query: NearbyStoresQuery): Promise<readonly NearbyStore[]>;
}
