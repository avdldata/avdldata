import { cents, type Cents } from '../units';
import type { PriceObservation } from '../stores/types';

export interface PriceWindow {
  /** Inclusive ISO date. */
  readonly from: string;
  /** Inclusive ISO date. */
  readonly to: string;
}

export interface HistoricalPriceStats {
  readonly productId: string;
  readonly observationCount: number;
  readonly latestCents: Cents;
  readonly medianCents: Cents;
  readonly averageCents: Cents;
  readonly minCents: Cents;
  readonly maxCents: Cents;
  readonly window: PriceWindow;
}

/** Default look-back for the reference price and the deal score. */
export const DEFAULT_HISTORY_WEEKS = 12;

export function windowEndingAt(isoDate: string, weeks = DEFAULT_HISTORY_WEEKS): PriceWindow {
  const to = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(to.getTime())) throw new RangeError(`Invalid date: ${isoDate}`);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - weeks * 7);
  return { from: from.toISOString().slice(0, 10), to: isoDate };
}

/**
 * Summarise what a product has cost recently.
 *
 * Every price we ever saw is kept, so this can answer the questions a shopper
 * actually has — "is this cheap, or does it only look cheap?" — instead of
 * comparing against a list price the retailer picked.
 *
 * V1 uses it for the reference price and the deal score; the same shape
 * supports a price graph later without touching the data model.
 */
export function getHistoricalPriceStats(
  productId: string,
  observations: readonly PriceObservation[],
  window: PriceWindow,
): HistoricalPriceStats | undefined {
  const relevant = observations
    .filter(
      (observation) =>
        observation.productId === productId &&
        observation.observedAt >= window.from &&
        observation.observedAt <= window.to,
    )
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));

  if (relevant.length === 0) return undefined;

  const prices = relevant.map((observation) => observation.priceCents).sort((a, b) => a - b);

  return {
    productId,
    observationCount: relevant.length,
    latestCents: relevant[relevant.length - 1]!.priceCents,
    medianCents: median(prices),
    averageCents: cents(prices.reduce((sum, price) => sum + price, 0) / prices.length),
    minCents: prices[0]!,
    maxCents: prices[prices.length - 1]!,
    window,
  };
}

/**
 * The price this product "normally" costs.
 *
 * The median of recent observations, which shrugs off both a one-week promotion
 * and a single odd reading. Falls back to the current price when there is no
 * history yet — a brand new product is, by definition, at its normal price.
 */
export function referencePriceCents(
  stats: HistoricalPriceStats | undefined,
  currentCents: Cents,
): Cents {
  if (!stats || stats.observationCount < 2) return currentCents;
  // Never claim the shelf price is above "normal": that would invent a discount.
  return stats.medianCents > currentCents ? stats.medianCents : currentCents;
}

/** Index observations by product once, so lookups do not rescan the history. */
export function indexObservationsByProduct(
  observations: readonly PriceObservation[],
): ReadonlyMap<string, readonly PriceObservation[]> {
  const index = new Map<string, PriceObservation[]>();
  for (const observation of observations) {
    const list = index.get(observation.productId);
    if (list) list.push(observation);
    else index.set(observation.productId, [observation]);
  }
  return index;
}

function median(sorted: readonly Cents[]): Cents {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return cents((sorted[middle - 1]! + sorted[middle]!) / 2);
}
