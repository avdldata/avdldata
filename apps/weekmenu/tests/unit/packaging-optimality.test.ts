import { describe, expect, it } from 'vitest';
import { optimisePackaging } from '@/domain/packaging/optimise';
import { DEFAULT_PACKAGING_CONFIG } from '@/domain/packaging/types';
import { priceForUnits } from '@/domain/pricing/promotions';
import { cents } from '@/domain/units';
import type { ProductOffer, Promotion } from '@/domain/stores/types';

/**
 * The package optimizer claims to return the cheapest basket, not a decent one.
 * The only way to hold it to that is to compare it against an exhaustive search
 * over the same catalogue — which is what this file does, on a fixed sequence of
 * generated catalogues so a regression is reproducible rather than occasional.
 *
 * It exists because the original bounded search pruned on "cost only grows with
 * quantity", which a promotion with a minimum quantity makes false: three packs
 * at "vanaf 3 stuks €0,80" cost less than two at full price.
 */

const WASTE_PER_KILO = DEFAULT_PACKAGING_CONFIG.selection.wastePerKiloCents;

let seed = 12345;
const reset = (value: number): void => {
  seed = value;
};
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

function makeOffer(i: number, amount: number, price: number, promotion?: Promotion): ProductOffer {
  return {
    productId: `p${i}`,
    chainId: 'c',
    locationId: 'l',
    ingredientId: 'x',
    name: `p${i}`,
    brandName: 'Merk',
    isPrivateLabel: true,
    packageAmount: { amount, unit: 'g' },
    normalUnitPriceCents: cents(price),
    unitPriceCents: cents(price),
    pricePerBaseUnitCents: price / amount,
    nutritionOrigin: 'none',
    ...(promotion ? { promotion } : {}),
  };
}

function randomPromotion(i: number): Promotion | undefined {
  const kind = int(0, 5);
  if (kind >= 4) return undefined;
  const base = {
    id: `pr${i}`,
    productId: `p${i}`,
    scope: { kind: 'chain', chainId: 'c' } as const,
    minUnits: int(1, 4),
    validFrom: '2000-01-01',
    validUntil: '2099-12-31',
    label: 'aanbieding',
  };
  if (kind === 0) {
    return { ...base, params: { type: 'FIXED_PRICE', unitPriceCents: cents(int(10, 200)) } };
  }
  if (kind === 1) return { ...base, params: { type: 'PERCENT_OFF', percent: int(10, 70) } };
  if (kind === 2) return { ...base, params: { type: 'ONE_PLUS_ONE' } };
  return {
    ...base,
    params: { type: 'N_FOR_X', bundleSize: int(2, 3), bundlePriceCents: cents(int(100, 500)) },
  };
}

function objectiveOf(spent: number, purchased: number, required: number): number {
  return spent + (WASTE_PER_KILO * Math.max(0, purchased - required)) / 1000;
}

/** Exhaustive ground truth over the same objective the optimizer uses. */
function bruteForce(offers: readonly ProductOffer[], required: number, cap: number) {
  let best = Number.POSITIVE_INFINITY;
  let bestCounts: number[] = [];
  const counts = new Array<number>(offers.length).fill(0);

  const walk = (i: number, purchased: number, spent: number): void => {
    if (i === offers.length) {
      if (purchased < required) return;
      const objective = objectiveOf(spent, purchased, required);
      if (objective < best - 1e-9) {
        best = objective;
        bestCounts = [...counts];
      }
      return;
    }
    for (let n = 0; n <= cap; n += 1) {
      counts[i] = n;
      walk(
        i + 1,
        purchased + n * offers[i]!.packageAmount.amount,
        spent + priceForUnits(offers[i]!, n),
      );
    }
    counts[i] = 0;
  };

  walk(0, 0, 0);
  return { objective: best, counts: bestCounts };
}

describe('the package optimizer really returns the cheapest basket', () => {
  it('matches an exhaustive search on 400 generated catalogues', () => {
    reset(12345);
    const cap = 8;
    const config = { ...DEFAULT_PACKAGING_CONFIG, maxUnitsPerVariant: cap };
    const failures: string[] = [];

    for (let round = 0; round < 400; round += 1) {
      const variantCount = int(1, 3);
      const offers = Array.from({ length: variantCount }, (_, i) =>
        makeOffer(
          i,
          pick([100, 150, 200, 250, 400, 500, 750, 1000]),
          int(50, 900),
          randomPromotion(i),
        ),
      );
      const required = int(50, 1600);

      const truth = bruteForce(offers, required, cap);
      const result = optimisePackaging('x', required, offers, config);

      if (result.status !== 'OK') {
        if (Number.isFinite(truth.objective)) {
          failures.push(`round ${round}: optimizer gave up while a basket exists`);
        }
        continue;
      }

      const objective = objectiveOf(
        result.solution.totalCents,
        result.solution.purchasedAmount,
        required,
      );
      if (objective > truth.objective + 1e-6) {
        failures.push(
          `round ${round}: paid ${objective.toFixed(1)}, cheapest was ${truth.objective.toFixed(1)} (${truth.counts})`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it('takes the third pack when "vanaf 3 stuks" beats paying for two', () => {
    // One 500 g pack covers the 346 g we need, at €3,72. Three packs cost €1,35
    // in total because of the minimum-quantity deal — cheaper despite the waste.
    const offer = makeOffer(0, 500, 372, {
      id: 'pr',
      productId: 'p0',
      scope: { kind: 'chain', chainId: 'c' },
      params: { type: 'FIXED_PRICE', unitPriceCents: cents(45) },
      minUnits: 3,
      validFrom: '2000-01-01',
      validUntil: '2099-12-31',
      label: 'vanaf 3 stuks €0,45',
    });

    expect([0, 1, 2, 3, 4].map((n) => priceForUnits(offer, n))).toEqual([0, 372, 744, 135, 180]);

    const result = optimisePackaging('x', 346, [offer], DEFAULT_PACKAGING_CONFIG);
    if (result.status !== 'OK') throw new Error('expected a basket');
    expect(result.solution.lines[0]?.units).toBe(3);
    expect(result.solution.totalCents).toBe(135);
  });

  it('prices a minimum quantity far above what the week needs, then weighs the waste', () => {
    // One 400 g pack covers the 200 g we need. The deal starts at four packs:
    // €2,00 instead of €3,00, but it leaves 1,4 kg to throw away.
    const offer = makeOffer(0, 400, 300, {
      id: 'pr',
      productId: 'p0',
      scope: { kind: 'chain', chainId: 'c' },
      params: { type: 'FIXED_PRICE', unitPriceCents: cents(50) },
      minUnits: 4,
      validFrom: '2000-01-01',
      validUntil: '2099-12-31',
      label: 'vanaf 4 stuks €0,50',
    });

    // With the default weights the leftover costs more than the euro it saves.
    const careful = optimisePackaging('x', 200, [offer], DEFAULT_PACKAGING_CONFIG);
    if (careful.status !== 'OK') throw new Error('expected a basket');
    expect(careful.solution.lines[0]?.units).toBe(1);
    expect(careful.solution.totalCents).toBe(300);

    // A household that only looks at the receipt does take the deal — which
    // proves the quantity was actually searched rather than never reached.
    const priceOnly = optimisePackaging('x', 200, [offer], {
      ...DEFAULT_PACKAGING_CONFIG,
      selection: { ...DEFAULT_PACKAGING_CONFIG.selection, wastePerKiloCents: 0 },
    });
    if (priceOnly.status !== 'OK') throw new Error('expected a basket');
    expect(priceOnly.solution.lines[0]?.units).toBe(4);
    expect(priceOnly.solution.totalCents).toBe(200);
  });
});
