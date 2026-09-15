import { describe, expect, it } from 'vitest';
import { optimisePackaging } from '@/domain/packaging/optimise';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { quantity, cents, type Cents } from '@/domain/units';
import type { ProductOffer } from '@/domain/stores/types';
import { DEMO_HOUSEHOLD } from '@/data/seed/demo-household';
import { loadRealChains, snapshotAvailable } from '../support/real-data-store';

/**
 * Two real chains, and the things that must hold whichever one you shop at.
 *
 * These run against the Checkjebon snapshot, which is not committed (10 MB, and
 * it changes daily). Without it there is nothing to assert about real data, so
 * the suite skips rather than passing vacuously.
 */
const describeReal = snapshotAvailable() ? describe : describe.skip;

describe('the packaging solver refuses to price across units', () => {
  const pieceOffer = (id: string, pieces: number, price: number): ProductOffer => ({
    productId: id,
    chainId: 'test',
    locationId: 'test',
    ingredientId: 'paprika-rood',
    name: id,
    brandName: 'test',
    isPrivateLabel: true,
    packageAmount: quantity(pieces, 'piece'),
    normalUnitPriceCents: cents(price) as Cents,
    unitPriceCents: cents(price) as Cents,
    pricePerBaseUnitCents: price / pieces,
    nutritionOrigin: 'ingredient',
  });

  it('does not read 186 grams as 186 peppers', () => {
    // The shape of a real bug: a week needing 186 g of red pepper, a shop
    // selling them singly, and a solver that took the number at face value.
    // Left unchecked it billed €146,94 on a list that looked entirely normal.
    const result = optimisePackaging('paprika-rood', 186, [pieceOffer('p', 1, 79)], undefined, 'g');
    expect(result.status).toBe('UNAVAILABLE');
    if (result.status === 'UNAVAILABLE') expect(result.reason).toBe('NO_MATCHING_UNIT');
  });

  it('still prices normally when the units agree', () => {
    const result = optimisePackaging(
      'paprika-rood',
      3,
      [pieceOffer('p', 1, 79)],
      undefined,
      'piece',
    );
    expect(result.status).toBe('OK');
    if (result.status === 'OK') expect(result.solution.purchasedAmount).toBe(3);
  });
});

describeReal('both chains, loaded through the same gate', () => {
  const fixture = loadRealChains(['ah', 'jumbo']);

  it('expresses every pack in the unit its ingredient is measured in', () => {
    // The ingestion-side half of the same bug. An offer that survives in a
    // different unit is one the solver would have to guess about.
    const wrong: string[] = [];
    for (const chain of fixture.chains) {
      for (const offer of chain.allOffers) {
        const ingredient = fixture.ingredientIndex.get(offer.ingredientId);
        if (ingredient && offer.packageAmount.unit !== ingredient.baseUnit) {
          wrong.push(`${offer.productId}: ${offer.packageAmount.unit} ≠ ${ingredient.baseUnit}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('keeps the two chains as separate offers on separate shelves', () => {
    // Same food, two shops, two prices. Conflating them would let a cheaper AH
    // tin be "bought" on a Jumbo-only trip.
    const ids = new Set<string>();
    for (const chain of fixture.chains) {
      for (const offer of chain.reducedOffers) {
        expect(offer.productId.startsWith(`${chain.chainId}:`)).toBe(true);
        expect(offer.locationId).toBe(`${chain.chainId}-shadow`);
        expect(ids.has(offer.productId)).toBe(false);
        ids.add(offer.productId);
      }
    }
  });

  it('never lets one chain eliminate the other chain in candidate reduction', () => {
    // Reduction groups per location by construction; this pins that, because a
    // future grouping key that dropped locationId would be a silent disaster.
    for (const chain of fixture.chains) {
      const ingredientsWithOffers = new Set(chain.reducedOffers.map((o) => o.ingredientId));
      expect(ingredientsWithOffers.size).toBeGreaterThan(50);
    }
  });

  it('gives every offer a traceable origin', () => {
    for (const chain of fixture.chains) {
      for (const offer of chain.reducedOffers) {
        const source = fixture.provenance.get(offer.productId);
        expect(source, offer.productId).toBeDefined();
        expect(source!.chainId).toBe(chain.chainId);
        expect(source!.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(source!.rawPrice).toMatch(/^€ \d+\.\d{2}$/);
      }
    }
  });

  it('plans a week from either shop, or from both', { timeout: 60_000 }, () => {
    const ah = fixture.chains.find((c) => c.chainId === 'ah')!.store;
    const jumbo = fixture.chains.find((c) => c.chainId === 'jumbo')!.store;

    for (const [label, stores, maxStores] of [
      ['ah', [ah], 1],
      ['jumbo', [jumbo], 1],
      ['beide, één winkel', [ah, jumbo], 1],
      ['beide, twee winkels', [ah, jumbo], 2],
    ] as const) {
      const result = optimiseWeek({
        household: DEMO_HOUSEHOLD,
        recipes: fixture.recipes,
        ingredients: fixture.ingredientIndex,
        stores,
        maxStores,
        conveniencePreference: 'gebalanceerd',
        budget: {},
        startDate: '2026-09-14',
        today: new Date('2026-09-14T09:00:00Z'),
      });
      expect(result.status, label).toBe('OK');
      if (result.status !== 'OK') continue;

      const option = result.plan.recommendedOption;
      expect(option.locationIds.length, label).toBeLessThanOrEqual(maxStores);

      // A weekly bill for two people that is plausible. Deliberately wide: it
      // is a smoke alarm for unit and packaging mistakes, not a price target.
      expect(option.groceryCents, label).toBeGreaterThan(1500);
      expect(option.groceryCents, label).toBeLessThan(15_000);

      for (const assignment of option.assignments) {
        for (const line of assignment.packaging.lines) {
          // Nobody buys twenty packs of one thing for seven dinners.
          expect(line.units, `${label}: ${line.offer.name}`).toBeLessThanOrEqual(20);
        }
        // Never more than one spare pack beyond what the week needs.
        const { requiredAmount, purchasedAmount } = assignment.packaging;
        const largestPack = Math.max(
          ...assignment.packaging.lines.map((l) => l.offer.packageAmount.amount),
        );
        expect(purchasedAmount, `${label}: ${assignment.ingredientId}`).toBeLessThan(
          requiredAmount + largestPack,
        );
      }
    }
  });
});

/**
 * Quantities a person would recognise.
 *
 * Every one of these was found by reading the products fifty real weeks bought,
 * not by a failing assertion — which is the point of doing that pass at all.
 */
describeReal('what fifty real weeks actually buy', () => {
  const fixture = loadRealChains(['ah', 'jumbo']);
  const offersFor = (ingredientId: string) =>
    fixture.chains.flatMap((c) => c.reducedOffers.filter((o) => o.ingredientId === ingredientId));

  it('buys eight wraps when the box says eight', () => {
    const wraps = offersFor('wraps').filter((o) => /8\s*(stuks|x)/i.test(o.name));
    expect(wraps.length).toBeGreaterThan(0);
    for (const offer of wraps) expect(offer.packageAmount.amount).toBe(8);
  });

  it('does not sell garlic by a piece that means something else', () => {
    // A shop's garlic "stuk" is a bulb; a recipe's is a clove. Both chains also
    // sell it by weight, so refusing the piece packs costs no coverage.
    const garlic = offersFor('knoflook');
    expect(garlic.length).toBeGreaterThan(0);
    for (const offer of garlic) expect(offer.packageAmount.unit).toBe('g');
  });

  it('keeps infant purée out of the offer set entirely', () => {
    for (const chain of fixture.chains) {
      const babyFood = chain.allOffers.filter((o) => /\d+\s*m\+/i.test(o.name));
      expect(babyFood.map((o) => o.name)).toEqual([]);
    }
  });
});
