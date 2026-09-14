import { describe, expect, it } from 'vitest';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { optimisePackaging } from '@/domain/packaging/optimise';
import { DEFAULT_PACKAGING_CONFIG } from '@/domain/packaging/types';
import { priceForUnits } from '@/domain/pricing/promotions';
import {
  demoHousehold,
  ingredientIndex,
  recipes,
  storeCandidates,
  TEST_DATE,
  TEST_TODAY,
} from '../support/fixtures';

/**
 * The demo dataset has a job beyond being plausible: every answer the app can
 * give has to be reachable from it. If one chain were cheapest in every aisle,
 * the comparison screen would always tell the same story and half the engine
 * would never run — the demo would look fine and prove nothing.
 *
 * These are made-up prices. They are shaped to be instructive, not observed.
 */

const base = (over: Partial<Parameters<typeof optimiseWeek>[0]> = {}) => ({
  household: demoHousehold,
  recipes,
  ingredients: ingredientIndex,
  stores: storeCandidates(),
  maxStores: 3,
  conveniencePreference: 'gebalanceerd' as const,
  budget: {},
  startDate: TEST_DATE,
  today: TEST_TODAY,
  ...over,
});

function plan(over: Partial<Parameters<typeof optimiseWeek>[0]> = {}) {
  const result = optimiseWeek(base(over));
  if (result.status !== 'OK') throw new Error(`expected a plan, got ${result.reason}`);
  return result.plan;
}

describe('every chain wins something', () => {
  const stores = storeCandidates();

  const cheapestChainFor = (ingredientId: string): string | undefined => {
    const costs = stores
      .map((store) => {
        const result = optimisePackaging(ingredientId, 500, store.offers, DEFAULT_PACKAGING_CONFIG);
        return {
          chain: store.chain.id,
          cost: result.status === 'OK' ? result.solution.totalCents : Infinity,
        };
      })
      .filter((entry) => Number.isFinite(entry.cost))
      .sort((a, b) => a.cost - b.cost);
    if (costs.length < 2 || costs[0]!.cost === costs[1]!.cost) return undefined;
    return costs[0]!.chain;
  };

  it('no chain is cheapest for more than two thirds of the catalogue', () => {
    const ingredientIds = [...new Set(stores.flatMap((s) => s.offers.map((o) => o.ingredientId)))];
    const wins = new Map<string, number>();
    let compared = 0;
    for (const id of ingredientIds) {
      const winner = cheapestChainFor(id);
      if (!winner) continue;
      compared += 1;
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }

    expect(compared).toBeGreaterThan(50);
    for (const chain of ['lidl', 'jumbo', 'ah']) {
      expect(wins.get(chain) ?? 0).toBeGreaterThan(compared * 0.1);
      expect(wins.get(chain) ?? 0).toBeLessThan(compared * 0.67);
    }
  });

  it('names a different chain as cheapest for at least three categories', () => {
    const winners = plan().recommendedOption.categoryWinners;
    expect(new Set(winners.values()).size).toBeGreaterThanOrEqual(3);
  });
});

describe('both answers to "where do I shop" are reachable', () => {
  it('splitting the shopping really is cheaper on groceries', () => {
    const result = plan();
    const single = [result.recommendedOption, ...result.alternativeOptions]
      .filter((option) => option.locationIds.length === 1)
      .sort((a, b) => a.groceryCents - b.groceryCents)[0]!;

    expect(result.cheapestOption.locationIds.length).toBeGreaterThan(1);
    // Worth at least a couple of euro, or the trade-off is not worth showing.
    expect(single.groceryCents - result.cheapestOption.groceryCents).toBeGreaterThan(150);
  });

  it('one trip still wins once the hassle of a second stop is priced in', () => {
    const balanced = plan({ conveniencePreference: 'gebalanceerd' });
    expect(balanced.recommendedOption.locationIds).toHaveLength(1);
    expect(balanced.totals.groceryCents).toBeGreaterThan(balanced.cheapestOption.groceryCents);
  });

  it('a household that only cares about price is sent to more than one shop', () => {
    const thrifty = plan({ conveniencePreference: 'laagste-prijs' });
    expect(thrifty.recommendedOption.locationIds.length).toBeGreaterThan(1);
    expect(thrifty.totals.extraStorePenaltyCents).toBe(0);
  });
});

describe('the promotion cases the pricing engine has to handle all occur', () => {
  const offers = storeCandidates().flatMap((store) => store.offers);
  const promoted = offers.filter((offer) => offer.promotion !== undefined);

  it('carries every promotion type', () => {
    const types = new Set(promoted.map((offer) => offer.promotion!.params.type));
    expect(types).toEqual(new Set(['FIXED_PRICE', 'PERCENT_OFF', 'ONE_PLUS_ONE', 'N_FOR_X']));
  });

  it('has a promotion that is worth taking and one that is not', () => {
    // Worth taking: the promotion beats the shelf price at the quantity needed.
    const worthIt = promoted.filter((offer) => priceForUnits(offer, 2) < offer.unitPriceCents * 2);
    expect(worthIt.length).toBeGreaterThan(0);

    // Not worth taking: a promoted product that is still dearer than a plain
    // rival for the same ingredient at the same shop.
    const beaten = promoted.filter((offer) =>
      offers.some(
        (rival) =>
          rival.locationId === offer.locationId &&
          rival.ingredientId === offer.ingredientId &&
          rival.productId !== offer.productId &&
          rival.pricePerBaseUnitCents < offer.pricePerBaseUnitCents,
      ),
    );
    expect(beaten.length).toBeGreaterThan(0);
  });
});

describe('the week the demo produces exercises the engine', () => {
  const result = plan();

  it('reuses an ingredient across days instead of buying it twice', () => {
    const shared = result.requirements.filter((r) => r.perDay.length > 1);
    expect(shared.length).toBeGreaterThan(2);
    expect(result.waste.reusedIngredientIds.length).toBeGreaterThan(2);
  });

  it('buys more than one pack where that is cheaper', () => {
    const bulk = result.recommendedOption.assignments.filter((a) =>
      a.packaging.lines.some((line) => line.units > 1),
    );
    expect(bulk.length).toBeGreaterThan(0);
  });

  it('actually uses a promotion', () => {
    expect(result.totals.promotionSavingsCents).toBeGreaterThan(0);
    const used = result.recommendedOption.assignments.flatMap((a) =>
      a.packaging.lines.filter((line) => line.promotionApplied),
    );
    expect(used.length).toBeGreaterThan(0);
  });
});
