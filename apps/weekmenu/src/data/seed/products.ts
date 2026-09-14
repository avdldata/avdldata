import { cents, type Cents, toBaseQuantity } from '@/domain/units';
import type { IngredientCategory } from '@/domain/ingredients/types';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import type {
  PriceObservation,
  Product,
  ProductNutrition,
  Promotion,
  PromotionParams,
} from '@/domain/stores/types';
import { SEED_INGREDIENTS } from './ingredients';
import { SEED_CATALOGUE, SEED_PROMOTIONS, type SeedPackSpec } from './catalogue';
import { A_BRAND_PRODUCTS, PRIVATE_LABEL_BY_CHAIN, type ABrandProductSpec } from './brands';

/** The demo dataset ships these four chains; the domain itself is open-ended. */
type DemoChainId = 'ah' | 'jumbo' | 'lidl' | 'plus';

const CHAINS: readonly DemoChainId[] = ['ah', 'jumbo', 'lidl', 'plus'];

/**
 * Per-chain price positioning.
 *
 * Every chain has to genuinely own something, or the demo has nothing to
 * demonstrate: if one shop were cheapest in every aisle the comparison screen
 * would always tell the same story and the split-the-shopping logic would never
 * be exercised. So:
 *
 *   Lidl   — clearly cheapest on produce, bread and tins, dearest on meat.
 *   Jumbo  — clearly cheapest on meat, fish and dairy.
 *   Albert Heijn — the highest shelf prices overall, but cheapest on herbs and
 *            spices, and the chain that runs the loudest promotions.
 *   PLUS   — a little above Jumbo everywhere.
 *
 * The gaps are wide enough that "Lidl + Jumbo together beat either alone" is
 * true, and small enough that a single trip can still win once travel and the
 * hassle of a second stop are priced in. That is the shape a real price feed
 * has, and it is what makes both answers reachable from the same dataset.
 *
 * These are made-up numbers for a demo, not observed supermarket prices.
 */
const CHAIN_CATEGORY_MULTIPLIER: Readonly<
  Record<DemoChainId, Readonly<Record<IngredientCategory, number>>>
> = {
  lidl: {
    'groente-fruit': 0.82,
    'vlees-vis-vega': 1.12,
    zuivel: 1.04,
    'brood-granen': 0.86,
    conserven: 0.84,
    'kruiden-specerijen': 0.94,
    overig: 0.9,
  },
  jumbo: {
    'groente-fruit': 1.02,
    'vlees-vis-vega': 0.88,
    zuivel: 0.9,
    'brood-granen': 1.0,
    conserven: 1.02,
    'kruiden-specerijen': 1.0,
    overig: 1.0,
  },
  ah: {
    'groente-fruit': 1.06,
    'vlees-vis-vega': 0.99,
    zuivel: 1.02,
    'brood-granen': 1.05,
    conserven: 1.06,
    'kruiden-specerijen': 0.86,
    overig: 1.04,
  },
  plus: {
    'groente-fruit': 1.0,
    'vlees-vis-vega': 0.95,
    zuivel: 0.98,
    'brood-granen': 1.02,
    conserven: 1.0,
    'kruiden-specerijen': 0.98,
    overig: 1.02,
  },
};

/** Fixed timestamps keep the generated catalogue byte-for-byte deterministic. */
const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);

/** Shelf prices in the Netherlands almost always end in 4 or 9. */
function psychologicalPrice(value: number): Cents {
  return cents(Math.max(1, Math.round(value / 5) * 5 - 1));
}

function packSuffix(amount: number, unit: string): string {
  return `${String(amount).replace('.', '_')}${unit}`;
}

function privateLabelProductId(chainId: string, ingredientId: string, pack: SeedPackSpec): string {
  return `${chainId}-${ingredientId}-${packSuffix(pack.amount, pack.unit)}`;
}

function aBrandProductId(chainId: string, ingredientId: string, spec: ABrandProductSpec): string {
  return `${chainId}-${ingredientId}-${spec.brandId.replace('brand-', '')}-${packSuffix(spec.amount, spec.unit)}`;
}

/**
 * A stable pseudo-GTIN.
 *
 * Real barcodes come from the product feed; the demo needs *something* in the
 * field so the unique constraint and the import path are exercised. Prefixed
 * with 2 (the range reserved for in-store use) so it can never be mistaken for
 * a real registered article.
 */
function demoGtin(productId: string): string {
  let hash = 0;
  for (let i = 0; i < productId.length; i += 1) hash = (hash * 31 + productId.charCodeAt(i)) >>> 0;
  return `2${String(hash).padStart(12, '0').slice(0, 12)}`;
}

export interface SeedProductData {
  readonly products: readonly Product[];
  readonly productNutrition: readonly ProductNutrition[];
}

/**
 * Expand the compact catalogue into concrete articles.
 *
 * Every pack size of every brand at every chain becomes its own product with
 * its own identity — which is exactly what a barcode addresses. Notably absent
 * from the result: prices. Those are observations, built separately below.
 */
export function buildSeedProducts(): SeedProductData {
  const products: Product[] = [];
  const productNutrition: ProductNutrition[] = [];

  for (const entry of SEED_CATALOGUE) {
    const ingredient = ingredientIndex.get(entry.ingredientId);
    if (!ingredient) {
      throw new Error(`Seed catalogue references unknown ingredient "${entry.ingredientId}"`);
    }

    const toQuantity = (amount: number, unit: SeedPackSpec['unit']) =>
      toBaseQuantity(amount, unit, {
        baseUnit: ingredient.baseUnit,
        density: ingredient.density,
        pieceWeightGrams: ingredient.pieceWeightGrams,
      });

    for (const chainId of CHAINS) {
      if (entry.notAtChains?.includes(chainId)) continue;

      // ---- private label -------------------------------------------------
      for (const pack of entry.packs) {
        if (pack.chains && !pack.chains.includes(chainId)) continue;
        const id = privateLabelProductId(chainId, entry.ingredientId, pack);
        products.push({
          id,
          gtin: demoGtin(id),
          brandId: PRIVATE_LABEL_BY_CHAIN[chainId]!,
          productName: `${entry.productName}${pack.suffix ? ` ${pack.suffix}` : ''}`,
          canonicalIngredientId: entry.ingredientId,
          packageAmount: toQuantity(pack.amount, pack.unit),
          chainId,
          active: true,
          createdAt: SEED_TIMESTAMP,
          updatedAt: SEED_TIMESTAMP,
        });
      }

      // ---- A-brands --------------------------------------------------------
      for (const spec of A_BRAND_PRODUCTS[entry.ingredientId] ?? []) {
        if (spec.chains && !spec.chains.includes(chainId)) continue;
        const id = aBrandProductId(chainId, entry.ingredientId, spec);
        products.push({
          id,
          gtin: demoGtin(id),
          brandId: spec.brandId,
          productName: spec.productName,
          canonicalIngredientId: entry.ingredientId,
          packageAmount: toQuantity(spec.amount, spec.unit),
          chainId,
          active: true,
          createdAt: SEED_TIMESTAMP,
          updatedAt: SEED_TIMESTAMP,
        });

        // Only where the label genuinely differs from the generic value — the
        // rest deliberately fall back to the canonical ingredient.
        if (spec.nutritionPer100) {
          productNutrition.push({
            productId: id,
            per100: spec.nutritionPer100,
            source: 'demo-seed',
            updatedAt: SEED_TIMESTAMP,
          });
        }
      }
    }
  }

  return { products, productNutrition };
}

// ---------------------------------------------------------------------------
// Price observations
// ---------------------------------------------------------------------------

/** How many weeks of history the demo dataset carries. */
export const SEED_HISTORY_WEEKS = 12;

function referencePriceFor(
  entry: (typeof SEED_CATALOGUE)[number],
  chainId: DemoChainId,
  basePriceCents: number,
  brandMultiplier: number,
): Cents {
  const ingredient = ingredientIndex.get(entry.ingredientId)!;
  const chainMultiplier = CHAIN_CATEGORY_MULTIPLIER[chainId][ingredient.category];
  return psychologicalPrice(basePriceCents * chainMultiplier * brandMultiplier);
}

/**
 * Deterministic per-week variation, seeded from the product id.
 *
 * Real shelf prices drift and occasionally get marked down; a flat line for
 * twelve weeks would make the reference price and the deal score meaningless.
 * Roughly one product in six gets a genuine dip, so "cheapest in twelve weeks"
 * says something when it appears.
 */
function weeklyFactor(productId: string, weeksAgo: number): number {
  let hash = 0;
  for (let i = 0; i < productId.length; i += 1) hash = (hash * 31 + productId.charCodeAt(i)) >>> 0;
  const drift = ((((hash >>> (weeksAgo % 8)) + weeksAgo * 7) % 9) - 4) / 100; // -4% .. +4%
  const dipWeek = hash % 17;
  const hasDip = dipWeek < SEED_HISTORY_WEEKS;
  const isDip = hasDip && dipWeek === weeksAgo && weeksAgo > 0;
  return 1 + drift - (isDip ? 0.18 : 0);
}

function isoWeekStart(isoDate: string, weeksAgo: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${isoDate}`);
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek - weeksAgo * 7);
  return date.toISOString().slice(0, 10);
}

/**
 * Twelve weeks of weekly price observations per product, ending in the week of
 * `onDate`.
 *
 * Each week is its own record. Nothing is ever overwritten, which is the whole
 * point: it is what lets the app say what a product normally costs rather than
 * trusting a retailer's own "van/voor" claim.
 */
export function buildSeedPriceObservations(onDate: string): PriceObservation[] {
  const observations: PriceObservation[] = [];

  for (const entry of SEED_CATALOGUE) {
    for (const chainId of CHAINS) {
      if (entry.notAtChains?.includes(chainId)) continue;

      const variants: { id: string; base: number; multiplier: number }[] = [];
      for (const pack of entry.packs) {
        if (pack.chains && !pack.chains.includes(chainId)) continue;
        variants.push({
          id: privateLabelProductId(chainId, entry.ingredientId, pack),
          base: pack.referencePriceCents,
          multiplier: 1,
        });
      }
      for (const spec of A_BRAND_PRODUCTS[entry.ingredientId] ?? []) {
        if (spec.chains && !spec.chains.includes(chainId)) continue;
        const nearestPack =
          entry.packs.find((pack) => pack.amount === spec.amount) ?? entry.packs[0]!;
        variants.push({
          id: aBrandProductId(chainId, entry.ingredientId, spec),
          base: nearestPack.referencePriceCents * (spec.amount / nearestPack.amount),
          multiplier: spec.priceMultiplier,
        });
      }

      for (const variant of variants) {
        const reference = referencePriceFor(entry, chainId, variant.base, variant.multiplier);
        for (let weeksAgo = SEED_HISTORY_WEEKS - 1; weeksAgo >= 0; weeksAgo -= 1) {
          const weekStart = isoWeekStart(onDate, weeksAgo);
          const price = psychologicalPrice(reference * weeklyFactor(variant.id, weeksAgo));
          observations.push({
            id: `obs-${variant.id}-${weekStart}`,
            productId: variant.id,
            scope: { kind: 'chain', chainId },
            priceCents: price,
            validFrom: weekStart,
            // The current week is still running; older weeks have closed.
            ...(weeksAgo > 0 ? { validUntil: isoWeekStart(onDate, weeksAgo - 1) } : {}),
            observedAt: weekStart,
            source: 'demo-seed',
          });
        }
      }
    }
  }

  return observations;
}

/** Monday (inclusive) and Sunday (inclusive) of the week containing `isoDate`. */
export function weekWindow(isoDate: string, offsetWeeks = 0): { from: string; until: string } {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${isoDate}`);
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - dayOfWeek + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: isoDay(monday), until: isoDay(sunday) };
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Promotions for the week containing `onDate`.
 *
 * The demo dataset anchors offers to the requested week so the app always has
 * live promotions to show, while the two deliberately inactive entries (one
 * expired, one not yet started) keep the validity logic honest.
 */
export function buildSeedPromotions(onDate: string): Promotion[] {
  const thisWeek = weekWindow(onDate, 0);
  const lastWeek = weekWindow(onDate, -2);
  const nextWeek = weekWindow(onDate, 2);

  return SEED_PROMOTIONS.map((entry, index): Promotion => {
    const catalogueEntry = SEED_CATALOGUE.find((c) => c.ingredientId === entry.ingredientId);
    const pack = catalogueEntry?.packs.find((p) => p.amount === entry.packAmount);
    if (!catalogueEntry || !pack) {
      throw new Error(
        `Promotion ${index} references unknown pack ${entry.ingredientId} ${entry.packAmount}`,
      );
    }

    const window =
      entry.window === 'expired' ? lastWeek : entry.window === 'future' ? nextWeek : thisWeek;

    return {
      id: `promo-${entry.chainId}-${entry.ingredientId}-${index}`,
      productId: privateLabelProductId(entry.chainId, entry.ingredientId, pack),
      scope: { kind: 'chain', chainId: entry.chainId },
      params: toPromotionParams(entry),
      minUnits: entry.minUnits ?? 1,
      validFrom: window.from,
      validUntil: window.until,
      label: entry.label,
      source: 'demo-seed',
    };
  });
}

function toPromotionParams(entry: (typeof SEED_PROMOTIONS)[number]): PromotionParams {
  switch (entry.type) {
    case 'FIXED_PRICE':
      return { type: 'FIXED_PRICE', unitPriceCents: cents(entry.unitPriceCents ?? 0) };
    case 'PERCENT_OFF':
      return { type: 'PERCENT_OFF', percent: entry.percent ?? 0 };
    case 'ONE_PLUS_ONE':
      return { type: 'ONE_PLUS_ONE' };
    case 'N_FOR_X':
      return {
        type: 'N_FOR_X',
        bundleSize: entry.bundleSize ?? 2,
        bundlePriceCents: cents(entry.bundlePriceCents ?? 0),
      };
  }
}
