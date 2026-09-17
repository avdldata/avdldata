import 'server-only';
import { resolveOffersForLocation } from '@/domain/stores/offers';
import type { SupermarketChain, SupermarketLocation } from '@/domain/stores/types';
import type { HistoricalPriceStats } from '@/domain/pricing/price-history';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import type { StoreCandidate } from '@/domain/optimization/store-selection';
import { SeedDataProvider } from '@/providers/seed-data-provider';
import { RealDataProvider, realSnapshotCapturedAt } from '@/providers/real-data-provider';
import { realPromotionsCapturedAt } from '@/providers/real-promotions';
import { dataMode } from '@/config/data-mode';
import { SeedStoreLocatorProvider } from '@/providers/locator/seed-locator';
import { SEED_LOCATIONS } from '@/data/seed/stores';
import type { ProductCatalogProvider } from '@/providers/catalog/types';
import type { SupermarketPriceProvider } from '@/providers/pricing/types';
import type { NutritionDataProvider } from '@/providers/nutrition/types';
import type { StoreLocatorProvider } from '@/providers/locator/types';

/**
 * The three data seams, and the one decision that made them worth having.
 *
 * In `REAL` mode all three are backed by the captured Albert Heijn, Jumbo and
 * Lidl catalogue; in `DEMO` mode by the synthetic seed. This is the only place
 * that choice is made, and it is made once per process.
 *
 * There is deliberately no fallback from REAL to DEMO. If the snapshot is
 * missing, `buildRealCatalogue` throws and the app says so, because the
 * alternative — quietly pricing a week from invented data — produces a number
 * that looks exactly like a real one.
 */
const mode = dataMode();
const backing = mode === 'REAL' ? new RealDataProvider() : new SeedDataProvider();
const catalogProvider: ProductCatalogProvider = backing;
const priceProvider: SupermarketPriceProvider = backing;
const nutritionProvider: NutritionDataProvider = backing;
const locatorProvider: StoreLocatorProvider = new SeedStoreLocatorProvider();

/**
 * Are the branch locations we price travel from the real ones?
 *
 * They are not, in `REAL` mode. The snapshot is a catalogue, not a map: it says
 * what Albert Heijn sells and for how much, and nothing about where its shops
 * are. The branches therefore still come from the seed.
 *
 * That combination is the dangerous one. Real grocery prices plus an invented
 * distance produces a *recommendation* — "one shop is better, the detour is not
 * worth € 0,40" — that is part real and part fiction, and the reader cannot see
 * the seam. So in REAL mode the travel component is switched off entirely and
 * labelled as absent, rather than computed from coordinates nobody checked.
 *
 * In DEMO mode the seed branches are used, which is coherent: everything on the
 * screen is then demo data and says so.
 */
export function travelCostStatus(): 'AVAILABLE' | 'NOT_AVAILABLE' {
  return mode === 'REAL' ? 'NOT_AVAILABLE' : 'AVAILABLE';
}

/** What the interface should tell the reader about the prices it is showing. */
export function dataModeView(): {
  mode: 'REAL' | 'DEMO';
  label: string;
  /** Two snapshots, two dates. They are refreshed separately, so they differ. */
  pricesCapturedAt?: string;
  promotionsCapturedAt?: string;
} {
  if (mode === 'DEMO') {
    return { mode, label: 'Demo-data — dit zijn geen echte winkelprijzen' };
  }
  const capturedAt = realSnapshotCapturedAt();
  const promotionsAt = realPromotionsCapturedAt();
  return {
    mode,
    label: 'Echte prijsdata',
    ...(capturedAt ? { pricesCapturedAt: capturedAt } : {}),
    ...(promotionsAt ? { promotionsCapturedAt: promotionsAt } : {}),
  };
}

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

/** Display names per chain id, so the UI never has to show a raw identifier. */
export async function getChainNames(): Promise<Record<string, string>> {
  const chains = await catalogProvider.getChains();
  return Object.fromEntries(chains.map((chain) => [chain.id, chain.name]));
}

export async function findNearbyStores(input: NearbyStoresInput): Promise<NearbyStoreView[]> {
  const [chains, nearby] = await Promise.all([
    catalogProvider.getChains(),
    locatorProvider.findNearbyStores(input),
  ]);
  const chainById = new Map(chains.map((c) => [c.id, c]));

  return nearby.flatMap((entry) => {
    const chain = chainById.get(entry.location.chainId);
    return chain ? [{ location: entry.location, chain, distanceKm: entry.distanceKm }] : [];
  });
}

export interface SupportedChainView {
  readonly chainId: string;
  readonly chainName: string;
  /** The branch whose shelf stands in for the whole chain. */
  readonly locationId: string;
}

/**
 * Which supermarkets you can choose from — a question about the catalogue, not
 * about geography.
 *
 * Choosing shops used to mean choosing *branches* within a radius of your
 * postcode, and the branches come from the seed (see `travelCostStatus`). For
 * anyone who does not live near Groningen that list was empty, and an empty
 * list meant no shop could be ticked and onboarding could not be finished. The
 * app was unusable for exactly the people it is for.
 *
 * So selection is per chain. That is also what the prices actually are: the
 * snapshot gives one price per chain, so every branch of a chain resolves the
 * same offers, and the branch behind a chain is a bookkeeping detail rather
 * than a choice anyone makes. It is kept because the stored settings, the
 * optimizer and a future real locator all speak locations.
 */
export async function supportedChains(): Promise<readonly SupportedChainView[]> {
  const chains = await catalogProvider.getChains();
  const byPriority = (id: string): number => {
    const index = (PRIORITY_CHAIN_IDS as readonly string[]).indexOf(id);
    return index === -1 ? PRIORITY_CHAIN_IDS.length : index;
  };
  return chains
    .filter((chain) => (PRIORITY_CHAIN_IDS as readonly string[]).includes(chain.id))
    .sort((a, b) => byPriority(a.id) - byPriority(b.id))
    .flatMap((chain) => {
      const location = representativeLocationFor(chain.id);
      return location ? [{ chainId: chain.id, chainName: chain.name, locationId: location }] : [];
    });
}

/** The same branch every time, so a saved setting never drifts. */
function representativeLocationFor(chainId: string): string | undefined {
  return SEED_LOCATIONS.filter((location) => location.chainId === chainId)
    .map((location) => location.id)
    .sort()[0];
}

/** Which chains a stored list of branches comes down to. */
export function chainIdsForLocations(locationIds: readonly string[]): string[] {
  const byId = new Map(SEED_LOCATIONS.map((location) => [location.id, location.chainId]));
  const chains: string[] = [];
  for (const id of locationIds) {
    const chainId = byId.get(id);
    if (chainId && !chains.includes(chainId)) chains.push(chainId);
  }
  return chains;
}

/**
 * Turn chosen chains back into the branches the settings store.
 *
 * A chain the household already had keeps the branch it already had, so saving
 * from the new screen does not rewrite data that was perfectly fine.
 */
export function locationIdsForChains(
  chainIds: readonly string[],
  current: readonly string[] = [],
): string[] {
  const byId = new Map(SEED_LOCATIONS.map((location) => [location.id, location.chainId]));
  return chainIds.flatMap((chainId) => {
    const existing = current.find((id) => byId.get(id) === chainId);
    const location = existing ?? representativeLocationFor(chainId);
    return location ? [location] : [];
  });
}

export interface StoreCandidatesInput {
  readonly locationIds: readonly string[];
  /** Absent when the household has no coordinates yet; distances are 0 then. */
  readonly home?: { latitude: number; longitude: number };
  readonly onDate: string;
}

export interface StoreCandidatesResult {
  readonly candidates: readonly StoreCandidate[];
  /** Products the catalogue could not price or stock at a selected store. */
  readonly unpricedProductCount: number;
  /** Price history per product, for the deal score and the shopping list. */
  readonly priceStats: ReadonlyMap<string, HistoricalPriceStats>;
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
    catalogProvider.getChains(),
    catalogProvider.getStores(),
  ]);

  const selected = locations.filter((l) => input.locationIds.includes(l.id));
  if (selected.length === 0) {
    return { candidates: [], unpricedProductCount: 0, priceStats: new Map() };
  }

  const chainIds = [...new Set(selected.map((l) => l.chainId))];
  const query = { onDate: input.onDate, chainIds };

  const [products, brands, observations, promotions, productNutrition, ingredients] =
    await Promise.all([
      catalogProvider.searchProducts({ chainIds }),
      catalogProvider.getBrands(),
      priceProvider.getPriceObservations(query),
      priceProvider.getPromotions(query),
      nutritionProvider.getProductNutrition(),
      catalogProvider.getIngredients(),
    ]);

  const chainById = new Map(chains.map((c) => [c.id, c]));
  const ingredientIndex = buildIngredientIndex(ingredients);
  const { roadDistanceKm } = await import('@/domain/trip/distance');

  let unpriced = 0;
  const candidates: StoreCandidate[] = [];
  const priceStats = new Map<string, HistoricalPriceStats>();

  for (const location of selected) {
    const chain = chainById.get(location.chainId);
    if (!chain) continue;
    const resolved = resolveOffersForLocation(location, {
      products,
      observations,
      promotions,
      brands,
      productNutrition,
      ingredients: ingredientIndex,
      onDate: input.onDate,
    });
    unpriced += resolved.issues.length;
    for (const [productId, stats] of resolved.stats) priceStats.set(productId, stats);
    candidates.push({
      location,
      chain,
      distanceKm: input.home ? Math.round(roadDistanceKm(input.home, location) * 10) / 10 : 0,
      offers: resolved.offers,
    });
  }

  return { candidates, unpricedProductCount: unpriced, priceStats };
}

/**
 * Every canonical ingredient the active catalogue can actually sell.
 *
 * "Can sell" is deliberately the whole chain of conditions the shopping list
 * depends on, not just "a product row exists": the product must match a
 * canonical ingredient, its pack must convert into that ingredient's unit, and
 * it must carry a price on the day. `resolveOffersForLocation` is what decides
 * all three, so this asks it rather than re-deriving the rules and drifting.
 *
 * The universe is the union over every branch the locator knows, not the
 * shops one household happened to tick. A recipe that no chain stocks is a gap
 * in our data; a recipe that the user's own two shops do not stock is a
 * different matter, and the optimizer already prices that as unavailability.
 *
 * Cached per process per date: availability barely moves within a day, and the
 * full resolve is the expensive part of planning a week.
 */
const purchasableCache = new Map<string, ReadonlySet<string>>();

export async function purchasableIngredientIds(onDate: string): Promise<ReadonlySet<string>> {
  const cached = purchasableCache.get(onDate);
  if (cached) return cached;

  const locations = await catalogProvider.getStores();
  const { candidates } = await buildStoreCandidates({
    locationIds: locations.map((l) => l.id),
    onDate,
  });

  const purchasable = new Set<string>();
  for (const candidate of candidates) {
    for (const offer of candidate.offers) purchasable.add(offer.ingredientId);
  }
  purchasableCache.set(onDate, purchasable);
  return purchasable;
}
