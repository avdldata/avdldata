import { describe, expect, it } from 'vitest';
import { reduceCandidates } from '@/domain/ingestion/candidate-reduction';
import { priceForUnits } from '@/domain/pricing/promotions';
import { cents, quantity, type Cents } from '@/domain/units';
import type { ProductOffer, Promotion } from '@/domain/stores/types';
import { SeededRandom } from '../../support/scenario';

/**
 * Reduction is only allowed to remove products that cannot change the answer.
 *
 * The tests below are not examples; they are the guarantee. The one that
 * matters most is the last: for every quantity a week might need, the cheapest
 * way to buy it out of the *kept* products costs exactly what it cost out of
 * all of them. If that ever fails, the reduction is not a reduction, it is a
 * silent price rise.
 */

function offer(over: Partial<ProductOffer> & { productId: string }): ProductOffer {
  const price = (over.unitPriceCents ?? cents(100)) as Cents;
  return {
    chainId: 'c',
    locationId: 'loc',
    ingredientId: 'ing',
    name: over.productId,
    brandName: 'b',
    isPrivateLabel: false,
    packageAmount: quantity(500, 'g'),
    normalUnitPriceCents: price,
    unitPriceCents: price,
    pricePerBaseUnitCents: 0.2,
    nutritionOrigin: 'ingredient',
    ...over,
  };
}

describe('what reduction is allowed to remove', () => {
  it('drops a pricier twin of the same pack', () => {
    const result = reduceCandidates([
      offer({ productId: 'cheap', unitPriceCents: cents(100) }),
      offer({ productId: 'dear', unitPriceCents: cents(140) }),
    ]);
    expect(result.kept.map((o) => o.productId)).toEqual(['cheap']);
    expect(result.removed[0]?.offer.productId).toBe('dear');
    expect(result.removed[0]?.rule).toBe('IDENTICAL_PACKAGE_CHEAPER');
  });

  it('never drops a bigger pack just because a smaller one is cheaper', () => {
    // 500 g at €1,00 does not dominate 1 kg at €1,80: a week needing 900 g is
    // cheaper with the big pack, and that is exactly the case a naive
    // price-per-gram cut-off gets wrong.
    const result = reduceCandidates([
      offer({ productId: 'small', unitPriceCents: cents(100), packageAmount: quantity(500, 'g') }),
      offer({ productId: 'big', unitPriceCents: cents(180), packageAmount: quantity(1000, 'g') }),
    ]);
    expect(result.kept).toHaveLength(2);
    expect(result.removed).toHaveLength(0);
  });

  it('never drops a product that carries a promotion', () => {
    const promotion: Promotion = {
      id: 'p',
      productId: 'promo',
      scope: { kind: 'chain', chainId: 'c' },
      params: { type: 'ONE_PLUS_ONE' },
      minUnits: 2,
      validFrom: '2020-01-01',
      validUntil: '2099-12-31',
      label: 'Actie',
    };
    const result = reduceCandidates([
      offer({ productId: 'plain', unitPriceCents: cents(100) }),
      offer({ productId: 'promo', unitPriceCents: cents(140), promotion }),
    ]);
    expect(result.kept.map((o) => o.productId).sort()).toEqual(['plain', 'promo']);
  });

  it('keeps products from different shops apart', () => {
    const result = reduceCandidates([
      offer({ productId: 'a', unitPriceCents: cents(100), locationId: 'one' }),
      offer({ productId: 'b', unitPriceCents: cents(140), locationId: 'two' }),
    ]);
    expect(result.kept).toHaveLength(2);
  });

  it('keeps products whose nutrition the objective can tell apart', () => {
    const nutrition = {
      kcal: 1,
      protein: 1,
      carbohydrates: 1,
      sugars: 1,
      fat: 1,
      saturatedFat: 1,
      fiber: 1,
      salt: 1,
    };
    const result = reduceCandidates([
      offer({
        productId: 'a',
        unitPriceCents: cents(100),
        nutritionOrigin: 'product',
        nutritionPer100: nutrition,
      }),
      offer({
        productId: 'b',
        unitPriceCents: cents(140),
        nutritionOrigin: 'product',
        nutritionPer100: { ...nutrition, kcal: 999 },
      }),
    ]);
    expect(result.kept).toHaveLength(2);
  });

  it('always leaves at least one product per group', () => {
    const result = reduceCandidates([
      offer({ productId: 'a', unitPriceCents: cents(100) }),
      offer({ productId: 'b', unitPriceCents: cents(100) }),
      offer({ productId: 'c', unitPriceCents: cents(100) }),
    ]);
    expect(result.kept).toHaveLength(1);
  });

  it('is deterministic and idempotent', () => {
    const offers = [
      offer({ productId: 'b', unitPriceCents: cents(100) }),
      offer({ productId: 'a', unitPriceCents: cents(100) }),
      offer({ productId: 'c', unitPriceCents: cents(120) }),
    ];
    const once = reduceCandidates(offers);
    const twice = reduceCandidates(once.kept);
    const shuffled = reduceCandidates([...offers].reverse());
    expect(once.kept.map((o) => o.productId)).toEqual(twice.kept.map((o) => o.productId));
    expect(once.kept.map((o) => o.productId)).toEqual(shuffled.kept.map((o) => o.productId));
  });
});

/**
 * The property that carries the whole feature.
 *
 * For a thousand random catalogues and every quantity a week might plausibly
 * need, buying that quantity out of the kept products must cost exactly what it
 * would have cost out of the full set.
 */
describe('reduction never makes anything more expensive', () => {
  it('leaves the cheapest way to buy any quantity unchanged', () => {
    const random = new SeededRandom(20260914);
    const failures: string[] = [];

    for (let round = 0; round < 1000; round += 1) {
      const count = random.int(2, 6);
      const offers: ProductOffer[] = [];
      for (let index = 0; index < count; index += 1) {
        const amount = random.pick([100, 250, 400, 500, 1000]);
        offers.push(
          offer({
            productId: `p${index}`,
            unitPriceCents: cents(random.int(50, 400)),
            packageAmount: quantity(amount, 'g'),
          }),
        );
      }

      const { kept } = reduceCandidates(offers);

      // Cheapest cost of covering `needed` grams using whole packs of one
      // product — the same shape of question the packaging optimizer asks.
      const cheapestFor = (pool: readonly ProductOffer[], needed: number): number => {
        let best = Number.POSITIVE_INFINITY;
        for (const candidate of pool) {
          const units = Math.ceil(needed / candidate.packageAmount.amount);
          best = Math.min(best, priceForUnits(candidate, units));
        }
        return best;
      };

      for (const needed of [50, 150, 300, 450, 600, 900, 1200, 2000, 3300]) {
        const before = cheapestFor(offers, needed);
        const after = cheapestFor(kept, needed);
        if (after !== before) {
          failures.push(`ronde ${round}, ${needed} g: ${before} werd ${after}`);
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('every removed product names a survivor that is no more expensive', () => {
    const random = new SeededRandom(7);
    for (let round = 0; round < 300; round += 1) {
      const offers = Array.from({ length: random.int(2, 8) }, (_, index) =>
        offer({
          productId: `p${index}`,
          unitPriceCents: cents(random.int(50, 400)),
          packageAmount: quantity(random.pick([250, 500, 1000]), 'g'),
        }),
      );
      const { kept, removed } = reduceCandidates(offers);
      for (const entry of removed) {
        const survivor = kept.find((o) => o.productId === entry.dominatedBy);
        expect(survivor, 'dominator must survive').toBeDefined();
        expect(survivor!.unitPriceCents).toBeLessThanOrEqual(entry.offer.unitPriceCents);
        expect(survivor!.packageAmount.amount).toBe(entry.offer.packageAmount.amount);
        expect(survivor!.locationId).toBe(entry.offer.locationId);
        expect(survivor!.ingredientId).toBe(entry.offer.ingredientId);
      }
    }
  });
});
