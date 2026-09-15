import 'server-only';
import { resolveOffersForLocation } from '@/domain/stores/offers';
import type { SupermarketChain, SupermarketLocation } from '@/domain/stores/types';
import type { HistoricalPriceStats } from '@/domain/pricing/price-history';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import type { StoreCandidate } from '@/domain/optimization/store-selection';
import { SeedDataProvider } from '@/providers/seed-data-provider';
import { RealDataProvider, realSnapshotCapturedAt } from '@/providers/real-data-provider';
import { dataMode } from '@/config/data-mode';
import { SeedStoreLocatorProvider } from '@/providers/locator/seed-locator';
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

/** What the interface should tell the reader about the prices it is showing. */
export function dataModeView(): {
  mode: 'REAL' | 'DEMO';
  label: string;
  pricesCapturedAt?: string;
} {
  if (mode === 'DEMO') {
    return { mode, label: 'Demo-data — dit zijn geen echte winkelprijzen' };
  }
  const capturedAt = realSnapshotCapturedAt();
  return {
    mode,
    label: 'Echte prijsdata',
    ...(capturedAt ? { pricesCapturedAt: capturedAt } : {}),
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
