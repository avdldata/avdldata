import 'server-only';
import { readFileSync, existsSync, statSync } from 'node:fs';
import type {
  Brand,
  PriceObservation,
  Product,
  ProductNutrition,
  Promotion,
  SupermarketChain,
  SupermarketLocation,
} from '@/domain/stores/types';
import type { CanonicalIngredient, IngredientAlias } from '@/domain/ingredients/types';
import type { IngredientNutrition } from '@/domain/nutrition/facts';
import { cents } from '@/domain/units';
import { buildIngredientPhrases, matchProduct } from '@/domain/ingestion/match-ingredient';
import { resolvePackage } from '@/domain/ingestion/package-parser';
import { packToQuantity } from '@/domain/ingestion/pack-to-quantity';
import { buildVariantIndex, DEFAULT_ACCEPTED_FORMS } from '@/domain/ingredients/taxonomy';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { SEED_CHAINS, SEED_LOCATIONS } from '@/data/seed/stores';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import { SEED_INGREDIENT_VARIANTS } from '@/data/seed/ingredient-taxonomy';
import { INGREDIENT_NUTRITION_PER_100 } from '@/data/seed/ingredient-nutrition';
import { PRODUCT_MATCH_OVERRIDES } from '@/data/matching/overrides';
import { extractRetailerProductId } from '@/services/promotions/retailer-id';
import type { ProductCatalogProvider, ProductSearchQuery } from './catalog/types';
import type { PriceQuery, SupermarketPriceProvider } from './pricing/types';
import type { NutritionDataProvider } from './nutrition/types';
import { loadRealPromotions } from './real-promotions';

/**
 * The real Albert Heijn, Jumbo and Lidl catalogue, as the app prices with it.
 *
 * This provider exists because the app and the measurements had drifted apart:
 * every benchmark in this repository ran on the real snapshot while the app
 * itself quietly priced weeks from the synthetic seed. The numbers a user saw
 * were therefore plausible and invented, which is worse than obviously wrong.
 *
 * ## The same pipeline, not a second one
 *
 * Nothing here decides what a product *is*. Matching is `matchProduct`, the
 * pack size is `resolvePackage`, the taxonomy is the shared one, and the gate
 * is the gate every benchmark used: a product reaches the optimizer only when
 * it has an identity, a positive price, a pack size in a unit we understand,
 * and a match good enough to approve without a human. Everything else is left
 * out — not guessed at, not priced at zero.
 */

/** The three chains Personal Alpha supports. */
export const REAL_CHAIN_IDS = ['ah', 'jumbo', 'lidl'] as const;
export type RealChain = (typeof REAL_CHAIN_IDS)[number];

const SNAPSHOT_PATH = 'data/external/checkjebon-snapshot.json';

interface RawProduct {
  readonly n?: string;
  readonly l?: string;
  readonly s?: string;
  readonly p?: number;
}
interface RawChain {
  readonly n?: string;
  readonly d?: readonly RawProduct[];
}

export class RealDataUnavailableError extends Error {
  constructor(path: string) {
    super(
      `Echte prijsdata ontbreekt (${path}). De app toont liever niets dan een ` +
        'verzonnen prijs; zie PERSONAL_ALPHA.md voor het verversen van de momentopname.',
    );
    this.name = 'RealDataUnavailableError';
  }
}

export function realSnapshotAvailable(path = SNAPSHOT_PATH): boolean {
  return existsSync(path);
}

/** When the snapshot file was last written. The only freshness we can claim. */
export function realSnapshotCapturedAt(path = SNAPSHOT_PATH): string | undefined {
  if (!existsSync(path)) return undefined;
  return statSync(path).mtime.toISOString();
}

interface BuiltCatalogue {
  readonly products: readonly Product[];
  readonly observations: readonly PriceObservation[];
  readonly brands: readonly Brand[];
  readonly capturedAt: string;
  /** Per chain, what the gate let through and what it stopped. */
  readonly stats: Readonly<Record<string, { seen: number; eligible: number }>>;
  /** Retailer article id per product, for joining promotions. */
  readonly retailerIdByProduct: ReadonlyMap<string, string>;
}

let cached: BuiltCatalogue | undefined;

function brandsFor(): Brand[] {
  const houseBrands = REAL_CHAIN_IDS.map<Brand>((chainId) => ({
    id: `huismerk-${chainId}`,
    name: SEED_CHAINS.find((c) => c.id === chainId)?.name ?? chainId,
    isPrivateLabel: true,
    chainId,
  }));
  return [
    ...houseBrands,
    // The snapshot gives a product name, not a brand field. Rather than guess a
    // manufacturer from the words, everything that is not clearly a house brand
    // is grouped honestly under one label.
    { id: 'merk-onbekend', name: 'Merk onbekend', isPrivateLabel: false },
  ];
}

function brandIdFor(chainId: RealChain, productName: string): string {
  const chain = SEED_CHAINS.find((c) => c.id === chainId)?.name ?? '';
  const head = productName.trim().toLowerCase();
  if (chain && head.startsWith(chain.toLowerCase())) return `huismerk-${chainId}`;
  if (chainId === 'jumbo' && head.startsWith("jumbo's")) return 'huismerk-jumbo';
  return 'merk-onbekend';
}

export function buildRealCatalogue(path = SNAPSHOT_PATH): BuiltCatalogue {
  if (cached) return cached;
  if (!existsSync(path)) throw new RealDataUnavailableError(path);

  const capturedAt = statSync(path).mtime.toISOString();
  const snapshot = JSON.parse(readFileSync(path, 'utf8')) as RawChain[];
  const phrases = buildIngredientPhrases(
    SEED_INGREDIENTS,
    SEED_INGREDIENT_ALIASES,
    SEED_INGREDIENT_VARIANTS,
  );
  const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
  const variantIndex = buildVariantIndex(SEED_INGREDIENT_VARIANTS);

  const products: Product[] = [];
  const observations: PriceObservation[] = [];
  const retailerIdByProduct = new Map<string, string>();
  const stats: Record<string, { seen: number; eligible: number }> = {};

  for (const chainId of REAL_CHAIN_IDS) {
    const chain = snapshot.find((c) => c.n === chainId);
    const raw = chain?.d ?? [];
    stats[chainId] = { seen: raw.length, eligible: 0 };

    for (const record of raw) {
      const productName = (record.n ?? '').trim();
      const identity = record.l ?? '';
      if (productName === '' || identity === '') continue;

      // A missing price is a missing price. Never zero, never inferred.
      const price = record.p;
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;

      const pack = resolvePackage(record.s, productName);
      if (pack.status !== 'OK') continue;

      const productId = `${chainId}:${identity}`;
      const match = matchProduct({ productId, productName }, phrases, PRODUCT_MATCH_OVERRIDES);
      if (!match) continue;
      if (match.status !== 'AUTO_APPROVED' && match.status !== 'APPROVED') continue;

      // The pack must be expressible in the unit the recipe is written in, or
      // the offer does not exist. Shared with the measurement harness so the
      // app and the benchmarks cannot drift apart on the one conversion that
      // has already gone wrong once.
      const ingredient = ingredientIndex.get(match.canonicalIngredientId);
      if (!ingredient) continue;
      const converted = packToQuantity(pack.info, ingredient);
      if (!converted.ok) continue;

      /*
       * A retail form no recipe asked for is not an offer.
       *
       * The taxonomy says frozen spinach is spinach in a state a salad cannot
       * use, and pre-cut potato wedges are potatoes a stamppot does not want.
       * Until a recipe opts into a form, an offer carrying one is left out —
       * the audit found wedges and strips being bought for plain potato and
       * plain pepper, at a pre-preparation price.
       */
      const variant = match.variantId ? variantIndex.get(match.variantId) : undefined;
      if (variant?.form && !DEFAULT_ACCEPTED_FORMS.includes(variant.form)) continue;

      products.push({
        id: productId,
        brandId: brandIdFor(chainId, productName),
        productName,
        canonicalIngredientId: match.canonicalIngredientId,
        packageAmount: converted.quantity,
        chainId,
        active: true,
        createdAt: capturedAt,
        updatedAt: capturedAt,
      });
      observations.push({
        id: `obs-${productId}`,
        productId,
        scope: { kind: 'chain', chainId },
        priceCents: cents(Math.round(price * 100)),
        validFrom: capturedAt.slice(0, 10),
        observedAt: capturedAt,
        source: 'prijs-snapshot',
      });
      const article = extractRetailerProductId(chainId, identity);
      if (article) retailerIdByProduct.set(productId, article.id.toLowerCase());
      stats[chainId]!.eligible += 1;
    }
  }

  cached = {
    products,
    observations,
    brands: brandsFor(),
    capturedAt,
    stats,
    retailerIdByProduct,
  };
  return cached;
}

/** For tests: forget the parsed snapshot so a different fixture can be read. */
export function resetRealCatalogueCache(): void {
  cached = undefined;
}

export class RealDataProvider
  implements ProductCatalogProvider, SupermarketPriceProvider, NutritionDataProvider
{
  readonly id = 'real-snapshot';

  constructor(private readonly path = SNAPSHOT_PATH) {}

  private catalogue(): BuiltCatalogue {
    return buildRealCatalogue(this.path);
  }

  async getChains(): Promise<readonly SupermarketChain[]> {
    return SEED_CHAINS.filter((c) => (REAL_CHAIN_IDS as readonly string[]).includes(c.id));
  }

  /** Branch locations stay from the seed: the snapshot is a catalogue, not a map. */
  async getStores(): Promise<readonly SupermarketLocation[]> {
    return SEED_LOCATIONS.filter((l) => (REAL_CHAIN_IDS as readonly string[]).includes(l.chainId));
  }

  async getBrands(): Promise<readonly Brand[]> {
    return this.catalogue().brands;
  }

  async getIngredients(): Promise<readonly CanonicalIngredient[]> {
    return SEED_INGREDIENTS;
  }

  async getIngredientAliases(): Promise<readonly IngredientAlias[]> {
    return SEED_INGREDIENT_ALIASES;
  }

  async searchProducts(query: ProductSearchQuery): Promise<readonly Product[]> {
    const all = this.catalogue().products;
    if (!query.chainIds || query.chainIds.length === 0) return all;
    const wanted = new Set(query.chainIds);
    return all.filter((p) => wanted.has(p.chainId));
  }

  async getPriceObservations(query: PriceQuery): Promise<readonly PriceObservation[]> {
    const { observations, products } = this.catalogue();
    if (!query.chainIds || query.chainIds.length === 0) return observations;
    const wanted = new Set(query.chainIds);
    const inScope = new Set(products.filter((p) => wanted.has(p.chainId)).map((p) => p.id));
    return observations.filter((o) => inScope.has(o.productId));
  }

  /**
   * Real promotions, joined on the shop's own article number.
   *
   * A missing or unreadable folder yields none rather than an error: a week
   * priced on ordinary prices alone is slightly more expensive and entirely
   * correct, so losing the folder must never stop someone cooking. What it must
   * not do is fall back to demo promotions, and it does not.
   */
  async getPromotions(query: PriceQuery): Promise<readonly Promotion[]> {
    const { retailerIdByProduct } = this.catalogue();
    return loadRealPromotions({
      onDate: query.onDate,
      ...(query.chainIds ? { chainIds: query.chainIds } : {}),
      retailerIdByProduct,
    }).promotions;
  }

  async getProductNutrition(): Promise<readonly ProductNutrition[]> {
    // The snapshot carries no per-article nutrition, so every product falls
    // back to its canonical ingredient — which is exactly what the fallback
    // was built for.
    return [];
  }

  async getIngredientNutrition(): Promise<readonly IngredientNutrition[]> {
    return Object.entries(INGREDIENT_NUTRITION_PER_100).map(([ingredientId, per100]) => ({
      ingredientId,
      per100,
      source: 'demo-seed' as const,
    }));
  }
}
