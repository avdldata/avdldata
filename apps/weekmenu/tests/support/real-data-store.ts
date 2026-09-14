import { readFileSync } from 'node:fs';
import { cents, quantity, type Cents } from '@/domain/units';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import type { StoreCandidate } from '@/domain/optimization/store-selection';
import type { ProductOffer } from '@/domain/stores/types';
import { resolvePackage } from '@/domain/ingestion/package-parser';
import { buildIngredientPhrases, matchProduct } from '@/domain/ingestion/match-ingredient';
import { reduceCandidates } from '@/domain/ingestion/candidate-reduction';
import { PRODUCT_MATCH_OVERRIDES } from '@/data/matching/overrides';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { DEMO_HOUSEHOLD } from '@/data/seed/demo-household';

/**
 * The real Albert Heijn catalogue, turned into something the optimizer can use.
 *
 * Shared by every script and test that measures against real data, so that they
 * all price the same products through the same quality gate — a benchmark whose
 * inputs differ per caller measures the caller, not the optimizer.
 */

const SNAPSHOT = 'data/external/checkjebon-snapshot.json';

interface RawProduct {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
}

export interface RealDataFixture {
  readonly store: StoreCandidate;
  readonly allOffers: readonly ProductOffer[];
  readonly reducedOffers: readonly ProductOffer[];
  readonly removedCount: number;
  readonly ingredientIndex: ReturnType<typeof buildIngredientIndex>;
  readonly recipes: ReturnType<typeof normaliseRecipes>;
}

export function snapshotAvailable(): boolean {
  try {
    readFileSync(SNAPSHOT, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function loadRealAlbertHeijn(): RealDataFixture {
  const chains = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as {
    n?: string;
    c?: string;
    d?: RawProduct[];
  }[];
  const chain = chains.find((c) => c.n === 'ah');
  if (!chain) throw new Error('geen AH in de momentopname');

  const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
  const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);
  const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);

  const allOffers: ProductOffer[] = [];
  for (const product of chain.d ?? []) {
    const productId = `ah:${product.l ?? product.n ?? ''}`;
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

    const unitPrice = cents(Math.round(price * 100)) as Cents;
    allOffers.push({
      productId,
      chainId: 'ah',
      locationId: 'ah-shadow',
      ingredientId: match.canonicalIngredientId,
      name: product.n ?? '',
      brandName: chain.c ?? 'AH',
      isPrivateLabel: false,
      packageAmount: quantity(pack.info.totalAmount, pack.info.baseUnit),
      normalUnitPriceCents: unitPrice,
      unitPriceCents: unitPrice,
      pricePerBaseUnitCents: unitPrice / Math.max(1, pack.info.totalAmount),
      nutritionOrigin: 'ingredient',
    });
  }

  const reduction = reduceCandidates(allOffers);

  return {
    store: storeWith(allOffers, chain.c ?? 'AH'),
    allOffers,
    reducedOffers: reduction.kept,
    removedCount: reduction.removed.length,
    ingredientIndex,
    recipes,
  };
}

export function storeWith(offers: readonly ProductOffer[], name = 'AH'): StoreCandidate {
  return {
    location: {
      id: 'ah-shadow',
      chainId: 'ah',
      name: `${name} (schaduwmodus)`,
      address: '',
      postalCode: '9711AA',
      city: 'Groningen',
      latitude: DEMO_HOUSEHOLD.location.latitude!,
      longitude: DEMO_HOUSEHOLD.location.longitude!,
      regionId: 'nl',
    },
    chain: { id: 'ah', name, logoUrl: '', colorHex: '#00a0e2' },
    distanceKm: 2.5,
    offers,
  };
}
