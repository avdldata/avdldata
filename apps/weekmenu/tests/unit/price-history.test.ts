import { describe, expect, it } from 'vitest';
import { cents } from '@/domain/units';
import {
  getHistoricalPriceStats,
  indexObservationsByProduct,
  referencePriceCents,
  windowEndingAt,
} from '@/domain/pricing/price-history';
import { computeDealScore, DEFAULT_DEAL_SCORE_WEIGHTS } from '@/domain/pricing/deal-score';
import type { PriceObservation } from '@/domain/stores/types';
import { fixedPrice, makeOffer, makePromotion } from '../support/builders';

function weekly(weeksAgo: number, priceCents: number, productId = 'p1'): PriceObservation {
  const date = new Date('2026-03-02T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - weeksAgo * 7);
  const iso = date.toISOString().slice(0, 10);
  return {
    id: `obs-${productId}-${iso}`,
    productId,
    scope: { kind: 'chain', chainId: 'jumbo' },
    priceCents: cents(priceCents),
    validFrom: iso,
    observedAt: iso,
    source: 'demo-seed',
  };
}

const window = windowEndingAt('2026-03-02', 12);

describe('price history', () => {
  it('keeps every observation instead of overwriting the last one', () => {
    const history = [weekly(2, 599), weekly(1, 549), weekly(0, 449)];
    const stats = getHistoricalPriceStats('p1', history, window)!;
    expect(stats.observationCount).toBe(3);
    expect(stats.minCents).toBe(449);
    expect(stats.maxCents).toBe(599);
    expect(stats.latestCents).toBe(449);
  });

  it('a new observation does not destroy the previous one', () => {
    const before = [weekly(1, 599)];
    const after = [...before, weekly(0, 449)];
    expect(getHistoricalPriceStats('p1', before, window)!.observationCount).toBe(1);
    const stats = getHistoricalPriceStats('p1', after, window)!;
    expect(stats.observationCount).toBe(2);
    expect(stats.maxCents).toBe(599); // the old price is still on record
  });

  it('computes median and average over the window', () => {
    const history = [weekly(3, 100), weekly(2, 200), weekly(1, 300), weekly(0, 400)];
    const stats = getHistoricalPriceStats('p1', history, window)!;
    expect(stats.medianCents).toBe(250);
    expect(stats.averageCents).toBe(250);
  });

  it('ignores observations outside the window', () => {
    const history = [weekly(30, 100), weekly(1, 500), weekly(0, 500)];
    const stats = getHistoricalPriceStats('p1', history, window)!;
    expect(stats.observationCount).toBe(2);
    expect(stats.minCents).toBe(500);
  });

  it('reports nothing at all for a product with no history', () => {
    expect(getHistoricalPriceStats('unknown', [weekly(0, 100)], window)).toBeUndefined();
  });

  it('keeps each product’s history separate', () => {
    const history = [weekly(0, 100, 'p1'), weekly(0, 900, 'p2')];
    const index = indexObservationsByProduct(history);
    expect(index.get('p1')).toHaveLength(1);
    expect(getHistoricalPriceStats('p2', history, window)!.latestCents).toBe(900);
  });
});

describe('reference price', () => {
  it('is the historical median, not the current price', () => {
    const stats = getHistoricalPriceStats(
      'p1',
      [weekly(2, 599), weekly(1, 599), weekly(0, 449)],
      window,
    );
    expect(referencePriceCents(stats, cents(449))).toBe(599);
  });

  it('never sits below the current price, so no discount is invented', () => {
    const stats = getHistoricalPriceStats(
      'p1',
      [weekly(2, 399), weekly(1, 399), weekly(0, 599)],
      window,
    );
    expect(referencePriceCents(stats, cents(599))).toBe(599);
  });

  it('falls back to the current price without enough history', () => {
    expect(referencePriceCents(undefined, cents(549))).toBe(549);
    const thin = getHistoricalPriceStats('p1', [weekly(0, 549)], window);
    expect(referencePriceCents(thin, cents(549))).toBe(549);
  });
});

describe('deal score', () => {
  const history = [weekly(4, 599), weekly(3, 599), weekly(2, 579), weekly(1, 599), weekly(0, 399)];
  const stats = getHistoricalPriceStats('p1', history, window)!;

  it('scores a genuine dip against the historical price', () => {
    const offer = makeOffer({ packAmount: 500, priceCents: 399, productId: 'p1' });
    const score = computeDealScore(offer, stats)!;
    expect(score.score).toBeGreaterThan(50);
    expect(score.savingsCents).toBe(200);
    expect(score.isLowestInWindow).toBe(true);
  });

  it('scores nothing when today is simply the normal price', () => {
    const offer = makeOffer({ packAmount: 500, priceCents: 599, productId: 'p1' });
    const score = computeDealScore(offer, stats)!;
    expect(score.score).toBe(0);
    expect(score.savingsCents).toBe(0);
    expect(score.isLowestInWindow).toBe(false);
  });

  it('counts a promotion as part of what you actually pay', () => {
    const offer = makeOffer({
      packAmount: 500,
      priceCents: 599,
      productId: 'p1',
      promotion: makePromotion(fixedPrice(349)),
    });
    const score = computeDealScore(offer, stats)!;
    expect(score.savingsCents).toBe(250);
    expect(score.score).toBeGreaterThan(60);
  });

  it('stays silent when there is too little history to judge', () => {
    const thin = getHistoricalPriceStats('p1', [weekly(1, 599), weekly(0, 399)], window);
    const offer = makeOffer({ packAmount: 500, priceCents: 399, productId: 'p1' });
    expect(computeDealScore(offer, thin)).toBeUndefined();
  });

  it('has configurable weights rather than hidden constants', () => {
    const offer = makeOffer({ packAmount: 500, priceCents: 399, productId: 'p1' });
    const discountOnly = computeDealScore(offer, stats, {
      ...DEFAULT_DEAL_SCORE_WEIGHTS,
      historicalDiscount: 1,
      absoluteSavings: 0,
    })!;
    const savingsOnly = computeDealScore(offer, stats, {
      ...DEFAULT_DEAL_SCORE_WEIGHTS,
      historicalDiscount: 0,
      absoluteSavings: 1,
    })!;
    expect(discountOnly.score).not.toBe(savingsOnly.score);
  });
});
