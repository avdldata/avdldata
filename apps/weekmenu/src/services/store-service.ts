import 'server-only';
import { resolveOffersForLocation } from '@/domain/stores/offers';
import type { SupermarketChain, SupermarketLocation } from '@/domain/stores/types';
import type { StoreCandidate } from '@/domain/optimization/store-selection';
import { SeedSupermarketProvider } from '@/providers/supermarket/seed-provider';
import { SeedStoreLocatorProvider } from '@/providers/locator/seed-locator';
import type { SupermarketProvider } from '@/providers/supermarket/types';
import type { StoreLocatorProvider } from '@/providers/locator/types';

const supermarketProvider: SupermarketProvider = new SeedSupermarketProvider();
const locatorProvider: StoreLocatorProvider = new SeedStoreLocatorProvider();

export interface NearbyStoreView {
  readonly location: SupermarketLocation;
  readonly chain: SupermarketChain;
  readonly distanceKm: number;
}

export interface NearbyStoresInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusKm: number;
}

/** Chains the product wants selected by default when one is within range. */
export const PRIORITY_CHAIN_IDS = ['lidl', 'jumbo', 'ah'] as const;

export async function findNearbyStores(input: NearbyStoresInput): Promise<NearbyStoreView[]> {
  const [chains, nearby] = await Promise.all([
    supermarketProvider.getChains(),
    locatorProvider.findNearbyStores(input),
  ]);
  const chainById = new Map(chains.map((c) => [c.id, c]));

  return nearby.flatMap((entry) => {
    const chain = chainById.get(entry.location.chainId);
    return chain ? [{ location: entry.location, chain, distanceKm: entry.distanceKm }] : [];
  });
}

/**
 * Suggest which nearby stores to tick on first use: the three priority chains,
 * nearest branch each. The user always keeps control — this is a starting point,
 * not a decision.
 */
export function defaultSelectedLocationIds(stores: readonly NearbyStoreView[]): string[] {
  const chosen: string[] = [];
  for (const chainId of PRIORITY_CHAIN_IDS) {
    const nearest = stores
      .filter((s) => s.chain.id === chainId)
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];
    if (nearest) chosen.push(nearest.location.id);
  }
  return chosen;
}

export interface StoreCandidatesInput {
  readonly locationIds: readonly string[];
  readonly home: { latitude: number; longitude: number };
  readonly onDate: string;
}

export interface StoreCandidatesResult {
  readonly candidates: readonly StoreCandidate[];
  /** Ingredients that no selected store sells at all. */
  readonly unpricedProductCount: number;
}

/**
 * Turn the user's selected store locations into fully priced candidates.
 *
 * Products, prices and promotions are fetched through the provider interface
 * and resolved into flat offers per location, honouring chain / region /
 * location price scopes and per-branch availability.
 */
export async function buildStoreCandidates(
  input: StoreCandidatesInput,
): Promise<StoreCandidatesResult> {
  const [chains, locations] = await Promise.all([
    supermarketProvider.getChains(),
    supermarketProvider.getStores(),
  ]);

  const selected = locations.filter((l) => input.locationIds.includes(l.id));
  if (selected.length === 0) return { candidates: [], unpricedProductCount: 0 };

  const chainIds = [...new Set(selected.map((l) => l.chainId))];
  const query = { onDate: input.onDate, chainIds };

  const [products, prices, promotions] = await Promise.all([
    supermarketProvider.getProducts(query),
    supermarketProvider.getPrices(query),
    supermarketProvider.getPromotions(query),
  ]);

  const chainById = new Map(chains.map((c) => [c.id, c]));
  const { roadDistanceKm } = await import('@/domain/trip/distance');

  let unpriced = 0;
  const candidates: StoreCandidate[] = [];

  for (const location of selected) {
    const chain = chainById.get(location.chainId);
    if (!chain) continue;
    const resolved = resolveOffersForLocation(location, {
      products,
      prices,
      promotions,
      onDate: input.onDate,
    });
    unpriced += resolved.issues.length;
    candidates.push({
      location,
      chain,
      distanceKm: Math.round(roadDistanceKm(input.home, location) * 10) / 10,
      offers: resolved.offers,
    });
  }

  return { candidates, unpricedProductCount: unpriced };
}

