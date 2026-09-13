import { euros, type Cents } from '../units';
import type { HistoricalPriceStats } from './price-history';
import type { ProductOffer } from '../stores/types';
import { priceForUnits } from './promotions';

/**
 * How good a deal actually is.
 *
 * A retailer's own "van €3,99 voor €2,99" is a claim, not a measurement. This
 * scores an offer against what the product has genuinely cost over the past
 * weeks, so a permanent "discount" scores nothing and a real dip scores well.
 *
 * V1 keeps it to the two components the brief asks for — how deep the discount
 * is against the historical price, and how many euros that saves in absolute
 * terms. The interface is built so nutrition, price per gram of protein and
 * usefulness in the current week can join later without changing callers.
 */
export interface DealScoreWeights {
  /** Weight on the discount relative to the historical median (0–1 range). */
  readonly historicalDiscount: number;
  /** Weight on the absolute saving, normalised against `absoluteSavingsCap`. */
  readonly absoluteSavings: number;
  /** A saving at or above this counts as a full absolute-savings score. */
  readonly absoluteSavingsCap: Cents;
  /** Below this many observations we do not claim to know the normal price. */
  readonly minimumObservations: number;
}

export const DEFAULT_DEAL_SCORE_WEIGHTS: DealScoreWeights = {
  historicalDiscount: 0.7,
  absoluteSavings: 0.3,
  absoluteSavingsCap: euros(3),
  minimumObservations: 4,
};

export interface DealScore {
  /** 0–100. Zero means "this is simply the normal price". */
  readonly score: number;
  readonly discountFraction: number;
  readonly savingsCents: Cents;
  /** True when today matches the lowest price seen in the window. */
  readonly isLowestInWindow: boolean;
  readonly observationCount: number;
  readonly components: {
    readonly historicalDiscount: number;
    readonly absoluteSavings: number;
  };
}

/**
 * Score one offer against its own price history.
 *
 * Returns undefined when there is not enough history to say anything honest —
 * silence is better than a confident number built on two data points.
 */
export function computeDealScore(
  offer: ProductOffer,
  stats: HistoricalPriceStats | undefined,
  weights: DealScoreWeights = DEFAULT_DEAL_SCORE_WEIGHTS,
): DealScore | undefined {
  if (!stats || stats.observationCount < weights.minimumObservations) return undefined;

  // What a single unit costs today, promotion included.
  const effectiveCents = priceForUnits(offer, 1);
  const reference = stats.medianCents;
  if (reference <= 0) return undefined;

  const savingsCents = Math.max(0, reference - effectiveCents) as Cents;
  const discountFraction = savingsCents / reference;

  const historicalDiscount = clamp01(discountFraction / 0.4); // 40% off = full marks
  const absoluteSavings = clamp01(savingsCents / weights.absoluteSavingsCap);

  const total =
    weights.historicalDiscount * historicalDiscount + weights.absoluteSavings * absoluteSavings;
  const normaliser = weights.historicalDiscount + weights.absoluteSavings;

  return {
    score: Math.round(clamp01(normaliser > 0 ? total / normaliser : 0) * 100),
    discountFraction,
    savingsCents,
    isLowestInWindow: effectiveCents <= stats.minCents,
    observationCount: stats.observationCount,
    components: { historicalDiscount, absoluteSavings },
  };
}

/** Deals worth putting a badge on. */
export const NOTABLE_DEAL_SCORE = 35;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
