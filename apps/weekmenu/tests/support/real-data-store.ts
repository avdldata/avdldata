import { readFileSync } from 'node:fs';
import { cents, quantity, toBaseQuantity, UnitConversionError, type Cents } from '@/domain/units';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import type { StoreCandidate } from '@/domain/optimization/store-selection';
import { roadDistanceKm, type GeoPoint } from '@/domain/trip/distance';
import type { ProductOffer } from '@/domain/stores/types';
import { resolvePackage } from '@/domain/ingestion/package-parser';
import { buildIngredientPhrases, matchProduct } from '@/domain/ingestion/match-ingredient';
import { reduceCandidates } from '@/domain/ingestion/candidate-reduction';
import type { OfferProvenance } from '@/domain/ingestion/provenance';
import { PRODUCT_MATCH_OVERRIDES } from '@/data/matching/overrides';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { DEMO_HOUSEHOLD } from '@/data/seed/demo-household';

/**
 * The real supermarket catalogues, turned into something the optimizer can use.
 *
 * Shared by every script and test that measures against real data, so that they
 * all price the same products through the same quality gate — a benchmark whose
 * inputs differ per caller measures the caller, not the optimizer.
 *
 * Two chains are loaded the same way, deliberately: one matcher, one parser, one
 * quality gate. A second chain is only evidence about the pipeline if nothing
 * about the pipeline was special-cased for it.
 *
 * The same food sold by both chains is two *offers*, never one. Identity of the
 * product ("this is a 400 g tin of chickpeas") and identity of the retail offer
 * ("Jumbo sells that tin for 89 cent") are different things, and the second is
 * what the optimizer buys. Product ids are chain-prefixed so the two can never
 * be conflated, and `reduceCandidates` groups per location, so a cheaper AH tin
 * can never eliminate the Jumbo one.
 */

const SNAPSHOT = 'data/external/checkjebon-snapshot.json';

/**
 * When the snapshot was published, and how stale a price may therefore be.
 *
 * Checkjebon carries no per-product timestamp — the honest granularity is the
 * day the file was published, which is what every line on a shopping list is
 * labelled with. Anything more precise would be invented.
 */
export const SNAPSHOT_SOURCE = 'Checkjebon (supermarkt/checkjebon)';
export const SNAPSHOT_DATE = '2026-09-14';
export const SNAPSHOT_MAX_AGE_DAYS = 1;

export type RealChainId = 'ah' | 'jumbo';

/**
 * Ingredients where a shop's "stuk" is not a recipe's "stuk".
 *
 * A recipe asks for two cloves of garlic, so the catalogue records a garlic
 * piece as five grams. A shop sells garlic by the bulb — "AH Knoflook, 2
 * stuks", about a hundred grams. Converting the shop's two pieces through the
 * recipe's piece weight gives ten grams, so a week needing thirty grams buys
 * six bulbs. Same story for spring onions and chillies, which are sold by the
 * bunch and cooked by the stalk.
 *
 * There is no way to tell these apart from the data — both say "stuks" — so
 * they are named here and their piece-labelled packs are dropped. Both chains
 * also sell these by weight, so the ingredient stays available.
 */
const RETAIL_PIECE_IS_NOT_RECIPE_PIECE: ReadonlySet<string> = new Set([
  'knoflook',
  'bosui',
  'rode-peper',
]);

interface RawProduct {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
}

/** `u` is the shop's product-page prefix; `l` is the per-product slug. */
interface RawChain {
  n?: string;
  c?: string;
  u?: string;
  d?: RawProduct[];
}

/**
 * What the snapshot does not contain, and what is therefore an assumption.
 *
 * Checkjebon lists prices per chain, not per branch: no addresses, no
 * coordinates, no opening hours. Somewhere has to supply a location, so it is
 * stated here as a modelling choice rather than smuggled in as data. The two
 * shops sit in different directions from the household — a plausible Groningen
 * arrangement — and that placement is what makes the two-store trade-off real:
 * the detour to the second shop is a genuine extra leg, so Jumbo has to be
 * enough cheaper to pay for it.
 *
 * `distanceKm` is derived from these coordinates rather than typed in beside
 * them, because the trip model measures the drive from the coordinates. Two
 * numbers that can disagree eventually will, and the week would then be priced
 * on one and reported on the other.
 */
const HOME: GeoPoint = {
  latitude: DEMO_HOUSEHOLD.location.latitude!,
  longitude: DEMO_HOUSEHOLD.location.longitude!,
};

const CHAIN_PLACEMENT: Readonly<
  Record<RealChainId, { name: string; colorHex: string; location: GeoPoint }>
> = {
  // ~2,5 km up the road.
  ah: {
    name: 'Albert Heijn',
    colorHex: '#00a0e2',
    location: { latitude: 53.23669, longitude: 6.5665 },
  },
  // ~3,8 km the other way, so visiting both is ~4,6 km of extra driving.
  jumbo: {
    name: 'Jumbo',
    colorHex: '#eeb111',
    location: { latitude: 53.2194, longitude: 6.61041 },
  },
};

export const CHAIN_PROFILES: Readonly<
  Record<RealChainId, { name: string; distanceKm: number; colorHex: string }>
> = {
  ah: {
    name: CHAIN_PLACEMENT.ah.name,
    colorHex: CHAIN_PLACEMENT.ah.colorHex,
    distanceKm: Math.round(roadDistanceKm(HOME, CHAIN_PLACEMENT.ah.location) * 10) / 10,
  },
  jumbo: {
    name: CHAIN_PLACEMENT.jumbo.name,
    colorHex: CHAIN_PLACEMENT.jumbo.colorHex,
    distanceKm: Math.round(roadDistanceKm(HOME, CHAIN_PLACEMENT.jumbo.location) * 10) / 10,
  },
};

export interface RealDataFixture {
  readonly chainId: RealChainId;
  readonly store: StoreCandidate;
  readonly allOffers: readonly ProductOffer[];
  readonly reducedOffers: readonly ProductOffer[];
  readonly removedCount: number;
  /** Matched, priced products dropped because the pack unit cannot be converted. */
  readonly unconvertibleCount: number;
  readonly ingredientIndex: ReturnType<typeof buildIngredientIndex>;
  readonly recipes: ReturnType<typeof normaliseRecipes>;
  /** Per offer, where its price and pack size came from. */
  readonly provenance: ReadonlyMap<string, OfferProvenance>;
}

export interface RealTwoChainFixture {
  readonly chains: readonly RealDataFixture[];
  /** Both shops, reduced, ready to hand to the optimizer as `stores`. */
  readonly stores: readonly StoreCandidate[];
  readonly ingredientIndex: ReturnType<typeof buildIngredientIndex>;
  readonly recipes: ReturnType<typeof normaliseRecipes>;
  /** Every chain's provenance in one map; product ids are chain-prefixed. */
  readonly provenance: ReadonlyMap<string, OfferProvenance>;
}

export function snapshotAvailable(): boolean {
  try {
    readFileSync(SNAPSHOT, 'utf8');
    return true;
  } catch {
    return false;
  }
}

let cachedSnapshot: RawChain[] | undefined;

function snapshot(): RawChain[] {
  // Parsing 32k products per call turns a fifty-week audit into a coffee break.
  cachedSnapshot ??= JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as RawChain[];
  return cachedSnapshot;
}

/**
 * One chain's catalogue, filtered down to what can honestly be priced.
 *
 * The gate is the same for both: the matcher must have decided the product is
 * the ingredient without a human, the package must parse to a real quantity,
 * and the price must be a positive number. Anything else is left out rather
 * than guessed at — a week priced on a guess is worse than a week that reports
 * the item as unavailable.
 */
export function loadRealChain(chainId: RealChainId): RealDataFixture {
  const chain = snapshot().find((c) => c.n === chainId);
  if (!chain) throw new Error(`geen ${chainId} in de momentopname`);

  const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
  const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);
  const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);
  const profile = CHAIN_PROFILES[chainId];

  const allOffers: ProductOffer[] = [];
  const provenance = new Map<string, OfferProvenance>();
  let unconvertible = 0;
  for (const product of chain.d ?? []) {
    const productId = `${chainId}:${product.l ?? product.n ?? ''}`;
    const match = matchProduct(
      { productId, productName: product.n ?? '' },
      phrases,
      PRODUCT_MATCH_OVERRIDES,
    );
    if (!match || (match.status !== 'AUTO_APPROVED' && match.status !== 'APPROVED')) continue;

    const pack = resolvePackage(product.s, product.n);
    const price = product.p;
    if (pack.status !== 'OK') continue;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;

    /*
     * Express the pack in the unit the recipes are written in.
     *
     * Without this the packaging solver compares numbers that mean different
     * things. It takes the unit of the first offer it sees and assumes the
     * requirement is in that unit, so "186 g of red pepper" met by a pack of
     * "1 stuk" quietly becomes 186 peppers — €146,94, on a list that otherwise
     * looks perfectly ordinary. Found while pricing one fixed menu in both
     * chains; it was wrong for Albert Heijn alone too.
     *
     * When the catalogue gives no way to convert (a piece pack for an
     * ingredient with no piece weight), the offer is dropped rather than
     * guessed at. That shows up as coverage lost, which is the honest place
     * for it.
     */
    const ingredient = ingredientIndex.get(match.canonicalIngredientId);
    if (!ingredient) continue;
    if (pack.info.baseUnit === 'piece' && RETAIL_PIECE_IS_NOT_RECIPE_PIECE.has(ingredient.id)) {
      unconvertible += 1;
      continue;
    }

    // A label that states a count outranks one that states a weight, but only
    // for an ingredient a recipe counts. "8 Stuks 320 g" is eight wraps; via
    // the average wrap weight it would be 5,16 wraps, and nobody buys 5,16.
    const counted =
      ingredient.baseUnit === 'piece' && pack.info.pieceCount !== undefined
        ? pack.info.pieceCount
        : undefined;

    let packageAmount;
    try {
      packageAmount =
        counted !== undefined
          ? quantity(counted, 'piece')
          : toBaseQuantity(pack.info.totalAmount, pack.info.baseUnit, {
              baseUnit: ingredient.baseUnit,
              density: ingredient.density,
              pieceWeightGrams: ingredient.pieceWeightGrams,
            });
    } catch (error) {
      if (!(error instanceof UnitConversionError)) throw error;
      unconvertible += 1;
      continue;
    }
    if (packageAmount.amount <= 0) continue;

    const unitPrice = cents(Math.round(price * 100)) as Cents;
    provenance.set(productId, {
      chainId,
      chainName: chain.c ?? profile.name,
      productUrl: chain.u && product.l ? `${chain.u}${product.l}` : undefined,
      source: SNAPSHOT_SOURCE,
      observedOn: SNAPSHOT_DATE,
      maxAgeDays: SNAPSHOT_MAX_AGE_DAYS,
      rawPrice: `€ ${price.toFixed(2)}`,
      rawPackage: (product.s ?? '').trim() || product.n || '',
      packageSource: pack.info.source,
      packageApproximate: pack.info.approximate,
      packageAmount: pack.info.totalAmount,
      packageUnit: pack.info.baseUnit,
      /** What the pack became once expressed in the recipe's own unit. */
      convertedAmount: packageAmount.amount,
      convertedUnit: packageAmount.unit,
      matchStatus: match.status,
      matchReasons: match.reasons,
      // Checkjebon carries no nutrition at all, so every line falls back to the
      // canonical ingredient. Recorded per line rather than assumed, because a
      // source that does carry it should show up here as a difference.
      nutritionOrigin: 'ingredient',
    });
    allOffers.push({
      productId,
      chainId,
      locationId: `${chainId}-shadow`,
      ingredientId: match.canonicalIngredientId,
      name: product.n ?? '',
      brandName: chain.c ?? profile.name,
      isPrivateLabel: false,
      packageAmount,
      normalUnitPriceCents: unitPrice,
      unitPriceCents: unitPrice,
      pricePerBaseUnitCents: unitPrice / Math.max(1, packageAmount.amount),
      nutritionOrigin: 'ingredient',
    });
  }

  const reduction = reduceCandidates(allOffers);

  return {
    chainId,
    store: storeWith(reduction.kept, chainId),
    allOffers,
    reducedOffers: reduction.kept,
    removedCount: reduction.removed.length,
    unconvertibleCount: unconvertible,
    ingredientIndex,
    recipes,
    provenance,
  };
}

/** Albert Heijn on its own — the baseline every two-chain number is read against. */
export function loadRealAlbertHeijn(): RealDataFixture {
  return loadRealChain('ah');
}

/** Both chains, as the optimizer sees them when it is allowed to visit either. */
export function loadRealChains(
  chainIds: readonly RealChainId[] = ['ah', 'jumbo'],
): RealTwoChainFixture {
  const chains = chainIds.map(loadRealChain);
  const first = chains[0];
  if (!first) throw new Error('geen ketens opgegeven');
  const provenance = new Map<string, OfferProvenance>();
  for (const chain of chains) for (const [id, p] of chain.provenance) provenance.set(id, p);
  return {
    chains,
    stores: chains.map((c) => c.store),
    ingredientIndex: first.ingredientIndex,
    recipes: first.recipes,
    provenance,
  };
}

export function storeWith(
  offers: readonly ProductOffer[],
  chainId: RealChainId = 'ah',
): StoreCandidate {
  const profile = CHAIN_PROFILES[chainId];
  const placement = CHAIN_PLACEMENT[chainId];
  return {
    location: {
      id: `${chainId}-shadow`,
      chainId,
      name: `${profile.name} (schaduwmodus)`,
      address: '',
      postalCode: '9711AA',
      city: 'Groningen',
      latitude: placement.location.latitude,
      longitude: placement.location.longitude,
      regionId: 'nl',
    },
    chain: { id: chainId, name: profile.name, logoUrl: '', colorHex: profile.colorHex },
    distanceKm: profile.distanceKm,
    offers,
  };
}
