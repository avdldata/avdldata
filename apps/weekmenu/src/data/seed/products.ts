import { cents, type Cents, toBaseQuantity } from '@/domain/units';
import type { IngredientCategory } from '@/domain/ingredients/types';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import type {
  Product,
  ProductPrice,
  Promotion,
  PromotionParams,
} from '@/domain/stores/types';
import { SEED_INGREDIENTS } from './ingredients';
import { SEED_CATALOGUE, SEED_PROMOTIONS, type SeedPackSpec } from './catalogue';

/** The demo dataset ships these four chains; the domain itself is open-ended. */
type DemoChainId = 'ah' | 'jumbo' | 'lidl' | 'plus';

const CHAINS: readonly DemoChainId[] = ['ah', 'jumbo', 'lidl', 'plus'];

/**
 * Per-chain price positioning.
 *
 * Lidl is cheapest on produce, dairy and pantry goods; Jumbo is sharpest on
 * meat and fish; Albert Heijn is the most expensive shelf price but runs the
 * loudest promotions; PLUS sits just above Jumbo. This is what makes
 * "Lidl + Jumbo together beat any single store" true in the demo data, and it
 * is the shape a real price feed tends to have.
 */
const CHAIN_CATEGORY_MULTIPLIER: Readonly<
  Record<DemoChainId, Readonly<Record<IngredientCategory, number>>>
> = {
  lidl: {
    'groente-fruit': 0.82,
    'vlees-vis-vega': 0.97,
    zuivel: 0.85,
    'brood-granen': 0.86,
    conserven: 0.84,
    'kruiden-specerijen': 0.88,
    overig: 0.88,
  },
  jumbo: {
    'groente-fruit': 1.0,
    'vlees-vis-vega': 0.91,
    zuivel: 1.0,
    'brood-granen': 0.98,
    conserven: 1.0,
    'kruiden-specerijen': 0.99,
    overig: 1.0,
  },
  ah: {
    'groente-fruit': 1.09,
    'vlees-vis-vega': 1.06,
    zuivel: 1.06,
    'brood-granen': 1.07,
    conserven: 1.06,
    'kruiden-specerijen': 1.05,
    overig: 1.06,
  },
  plus: {
    'groente-fruit': 1.05,
    'vlees-vis-vega': 1.02,
    zuivel: 1.03,
    'brood-granen': 1.04,
    conserven: 1.03,
    'kruiden-specerijen': 1.03,
    overig: 1.03,
  },
};

const CHAIN_BRAND: Readonly<Record<DemoChainId, string>> = {
  ah: 'AH',
  jumbo: 'Jumbo',
  lidl: 'Lidl',
  plus: 'PLUS',
};

/** Prices are permanently valid; only promotions have a window. */
const PRICE_VALID_FROM = '2020-01-01';
const PRICE_VALID_UNTIL = '2099-12-31';

const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);

/** Shelf prices in the Netherlands almost always end in 4 or 9. */
function psychologicalPrice(value: number): Cents {
  return cents(Math.max(1, Math.round(value / 5) * 5 - 1));
}

function productId(chainId: string, ingredientId: string, pack: SeedPackSpec): string {
  const size = `${String(pack.amount).replace('.', '_')}${pack.unit}`;
  return `${chainId}-${ingredientId}-${size}`;
}

export interface SeedProductData {
  readonly products: readonly Product[];
  readonly prices: readonly ProductPrice[];
}

/**
 * Expand the compact catalogue into concrete products and chain-level prices.
 * Pack sizes are converted to base units here — after this point nothing in the
 * system deals with kilos or litres again.
 */
export function buildSeedProducts(): SeedProductData {
  const products: Product[] = [];
  const prices: ProductPrice[] = [];

  for (const entry of SEED_CATALOGUE) {
    const ingredient = ingredientIndex.get(entry.ingredientId);
    if (!ingredient) {
      throw new Error(`Seed catalogue references unknown ingredient "${entry.ingredientId}"`);
    }

    for (const chainId of CHAINS) {
      if (entry.notAtChains?.includes(chainId)) continue;

      for (const pack of entry.packs) {
        if (pack.chains && !pack.chains.includes(chainId)) continue;

        const packageAmount = toBaseQuantity(pack.amount, pack.unit, {
          baseUnit: ingredient.baseUnit,
          density: ingredient.density,
          pieceWeightGrams: ingredient.pieceWeightGrams,
        });

        const multiplier = CHAIN_CATEGORY_MULTIPLIER[chainId][ingredient.category];
        const price = psychologicalPrice(pack.referencePriceCents * multiplier);
        const id = productId(chainId, entry.ingredientId, pack);

        products.push({
          id,
          chainId,
          name: `${CHAIN_BRAND[chainId]} ${entry.productName}${pack.suffix ? ` ${pack.suffix}` : ''}`,
          brand: CHAIN_BRAND[chainId],
          canonicalIngredientId: entry.ingredientId,
          packageAmount,
        });

        prices.push({
          id: `price-${id}`,
          productId: id,
          scope: { kind: 'chain', chainId },
          normalPriceCents: price,
          currentPriceCents: price,
          validFrom: PRICE_VALID_FROM,
          validUntil: PRICE_VALID_UNTIL,
        });
      }
    }
  }

  return { products, prices };
}

/** Monday (inclusive) and Sunday (inclusive) of the week containing `isoDate`. */
export function weekWindow(isoDate: string, offsetWeeks = 0): { from: string; until: string } {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${isoDate}`);
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // Monday = 0
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
      productId: productId(entry.chainId, entry.ingredientId, pack),
      scope: { kind: 'chain', chainId: entry.chainId },
      params: toPromotionParams(entry),
      minUnits: entry.minUnits ?? 1,
      validFrom: window.from,
      validUntil: window.until,
      label: entry.label,
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
