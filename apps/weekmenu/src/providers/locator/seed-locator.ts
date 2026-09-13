import { roadDistanceKm } from '@/domain/trip/distance';
import { SEED_LOCATIONS } from '@/data/seed/stores';
import type { NearbyStore, NearbyStoresQuery, StoreLocatorProvider } from './types';

/**
 * Distance-only store locator over the seeded location list.
 *
 * Straight-line distance with a road detour factor is good enough to rank
 * nearby shops; when a routing provider is wired in, only this class changes.
 */
export class SeedStoreLocatorProvider implements StoreLocatorProvider {
  readonly id = 'seed';

  async findNearbyStores(query: NearbyStoresQuery): Promise<readonly NearbyStore[]> {
    const allowed = query.chainIds && query.chainIds.length > 0 ? new Set(query.chainIds) : undefined;

    return SEED_LOCATIONS.filter((location) => !allowed || allowed.has(location.chainId))
      .map((location) => ({
        location,
        distanceKm:
          Math.round(
            roadDistanceKm(
              { latitude: query.latitude, longitude: query.longitude },
              location,
            ) * 10,
          ) / 10,
      }))
      .filter((entry) => entry.distanceKm <= query.radiusKm)
      .sort(
        (a, b) => a.distanceKm - b.distanceKm || a.location.id.localeCompare(b.location.id),
      );
  }
}
