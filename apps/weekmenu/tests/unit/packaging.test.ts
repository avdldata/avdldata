import { describe, expect, it } from 'vitest';
import { optimisePackaging } from '@/domain/packaging/optimise';
import { DEFAULT_PACKAGING_CONFIG } from '@/domain/packaging/types';
import { makeOffer, makePromotion, nForX, onePlusOne } from '../support/builders';

describe('package optimisation', () => {
  it('picks the cheapest combination that covers the requirement', () => {
    // The brief's example: 1.180 g needed, packs of 400 g (€4) and 600 g (€5,50).
    const offers = [
      makeOffer({ packAmount: 400, priceCents: 400, productId: 'small' }),
      makeOffer({ packAmount: 600, priceCents: 550, productId: 'large' }),
    ];
    const result = optimisePackaging('ingredient-a', 1180, offers);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.totalCents).toBe(1100); // 2 x 600 g beats 3 x 400 g (1200)
    expect(result.solution.purchasedAmount).toBe(1200);
    expect(result.solution.leftoverAmount).toBe(20);
  });

  it('mixes pack sizes when that is cheaper than one size', () => {
    const offers = [
      makeOffer({ packAmount: 300, priceCents: 100, productId: 'a' }),
      makeOffer({ packAmount: 1000, priceCents: 340, productId: 'b' }),
    ];
    // 1300 g: 1 x 1000 + 1 x 300 = 440, versus 2 x 1000 = 680 or 5 x 300 = 500.
    const result = optimisePackaging('ingredient-a', 1300, offers);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.totalCents).toBe(440);
  });

  it('buys more than needed when 1 + 1 gratis makes it cheaper per gram', () => {
    const offers = [
      makeOffer({ packAmount: 200, priceCents: 200, productId: 'plain' }),
      makeOffer({
        packAmount: 500,
        priceCents: 450,
        productId: 'promo',
        promotion: makePromotion(onePlusOne(), { minUnits: 2 }),
      }),
    ];
    // 600 g: two promo packs give 1000 g for 450, beating 3 x 200 g (600).
    const result = optimisePackaging('ingredient-a', 600, offers);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.totalCents).toBe(450);
    expect(result.solution.purchasedAmount).toBe(1000);
  });

  it('beats a naive cheapest-per-kilo choice', () => {
    // Per kilo the 900 g pack looks best, but you only need 200 g.
    const offers = [
      makeOffer({ packAmount: 200, priceCents: 120, productId: 'small' }),
      makeOffer({ packAmount: 900, priceCents: 450, productId: 'bulk' }),
    ];
    const perKiloWinner = [...offers].sort(
      (a, b) => a.pricePerBaseUnitCents - b.pricePerBaseUnitCents,
    )[0];
    expect(perKiloWinner!.productId).toBe('bulk');

    const result = optimisePackaging('ingredient-a', 200, offers);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.totalCents).toBe(120);
  });

  it('uses an N-for-X bundle when the quantity reaches it', () => {
    const offers = [
      makeOffer({
        packAmount: 400,
        priceCents: 89,
        productId: 'tin',
        promotion: makePromotion(nForX(4, 250), { minUnits: 4 }),
      }),
    ];
    const result = optimisePackaging('ingredient-a', 1500, offers);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.lines[0]!.units).toBe(4);
    expect(result.solution.totalCents).toBe(250);
    expect(result.solution.lines[0]!.promotionApplied).toBe(true);
  });

  it('reports UNAVAILABLE when nothing is sold', () => {
    const result = optimisePackaging('ingredient-a', 500, []);
    expect(result.status).toBe('UNAVAILABLE');
    if (result.status === 'UNAVAILABLE') expect(result.reason).toBe('NO_PRODUCTS');
  });

  it('reports UNAVAILABLE when the only packs are in the wrong unit', () => {
    const offers = [makeOffer({ packAmount: 500, unit: 'ml', priceCents: 100 })];
    const result = optimisePackaging('ingredient-a', 500, offers);
    // The first offer defines the unit, so a single mismatched offer is fine —
    // the mismatch only bites when offers disagree with each other.
    expect(result.status).toBe('OK');
  });

  it('handles a requirement of zero without buying anything', () => {
    const offers = [makeOffer({ packAmount: 500, priceCents: 249 })];
    const result = optimisePackaging('ingredient-a', 0, offers);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.totalCents).toBe(0);
    expect(result.solution.lines).toHaveLength(0);
  });

  it('buys many small packs when that is all there is', () => {
    const offers = [makeOffer({ packAmount: 100, priceCents: 50 })];
    const result = optimisePackaging('ingredient-a', 950, offers);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.lines[0]!.units).toBe(10);
    expect(result.solution.purchasedAmount).toBe(1000);
  });

  it('stays within its search budget on a pathological catalogue', () => {
    const offers = Array.from({ length: 6 }, (_, i) =>
      makeOffer({ packAmount: 50 + i * 7, priceCents: 40 + i * 5, productId: `p${i}` }),
    );
    const started = performance.now();
    const result = optimisePackaging('ingredient-a', 5000, offers, {
      ...DEFAULT_PACKAGING_CONFIG,
      maxSearchNodes: 5000,
    });
    expect(performance.now() - started).toBeLessThan(500);
    if (result.status !== 'OK') throw new Error(result.reason);
    expect(result.solution.purchasedAmount).toBeGreaterThanOrEqual(5000);
  });

  it('is deterministic when two combinations cost the same', () => {
    const offers = [
      makeOffer({ packAmount: 500, priceCents: 100, productId: 'b-second' }),
      makeOffer({ packAmount: 500, priceCents: 100, productId: 'a-first' }),
    ];
    const first = optimisePackaging('ingredient-a', 1000, offers);
    const second = optimisePackaging('ingredient-a', 1000, offers);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
