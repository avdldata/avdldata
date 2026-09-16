import { describe, expect, it } from 'vitest';
import { cents, quantity, type Cents } from '@/domain/units';
import { priceForUnits, promotionSavings } from '@/domain/pricing/promotions';
import type { ProductOffer, Promotion } from '@/domain/stores/types';
import { linkPromotions, toCandidate } from '@/services/promotions/link-promotions';
import { applyPromotions } from '@/services/promotions/apply-promotions';
import type { ExternalPromotion } from '@/services/promotions/types';

/**
 * What the till actually charges, at every quantity that matters.
 *
 * These are built the way a promotion will really arrive — shelf text through
 * the parser, through linking, onto an offer — rather than by constructing a
 * `Promotion` by hand. A test that hand-builds the object it is testing proves
 * the object works and says nothing about whether the text was read correctly.
 *
 * The ladders matter because price is not linear in quantity, and every one of
 * these is a place where multiplying a unit price would give a different, lower
 * answer than the register.
 */

const SHELF = 300;

function offerWith(text: string, priceCents?: number): ProductOffer {
  const base: ProductOffer = {
    productId: 'jumbo:a',
    chainId: 'jumbo',
    locationId: 'jumbo-shadow',
    ingredientId: 'gehakt-half',
    name: 'Jumbo Rundergehakt',
    brandName: 'Jumbo',
    isPrivateLabel: true,
    packageAmount: quantity(300, 'g'),
    normalUnitPriceCents: cents(SHELF) as Cents,
    unitPriceCents: cents(SHELF) as Cents,
    pricePerBaseUnitCents: SHELF / 300,
    nutritionOrigin: 'ingredient',
  };
  const external: ExternalPromotion = {
    externalPromotionId: 'p1',
    source: 'TestBron',
    chainId: 'jumbo',
    productName: 'Jumbo Rundergehakt',
    packageText: '300 g',
    promotionText: text,
    ...(priceCents !== undefined ? { promotionalPriceCents: priceCents } : {}),
    validFrom: '2026-09-14',
    validUntil: '2026-09-20',
    fetchedAt: '2026-09-14T06:00:00.000Z',
  };
  const linked = linkPromotions({
    chainId: 'jumbo',
    candidates: [toCandidate(external)],
    offers: [base],
    retailerIdByProduct: new Map(),
  }).linked;
  const resolved = applyPromotions([base], linked, { shoppingDate: '2026-09-16' });
  return resolved.offers[0]!;
}

const ladder = (offer: ProductOffer, upTo = 5): number[] =>
  Array.from({ length: upTo }, (_, i) => priceForUnits(offer, i + 1));

describe('every supported promotion, priced at every quantity', () => {
  it('one plus one: two packs cost one', () => {
    // The example from the brief, at €3 a pack.
    expect(ladder(offerWith('1 + 1 gratis'))).toEqual([300, 300, 600, 600, 900]);
  });

  it('two plus one: three packs cost two', () => {
    expect(ladder(offerWith('2 + 1 gratis'), 6)).toEqual([300, 600, 600, 900, 1200, 1200]);
  });

  it('two for a fixed total: the third pack is full price again', () => {
    expect(ladder(offerWith('2 voor € 5'))).toEqual([300, 500, 800, 1000, 1300]);
  });

  it('a percentage comes off every pack', () => {
    expect(ladder(offerWith('25% korting'))).toEqual([225, 450, 675, 900, 1125]);
  });

  it('second at half price discounts only the second, not both', () => {
    // The distinction the whole BUY_NTH_DISCOUNT type exists for: at two packs
    // this is €4,50, where "50% korting" would be €3,00.
    expect(ladder(offerWith('2e halve prijs'))).toEqual([300, 450, 750, 900, 1200]);
    expect(ladder(offerWith('50% korting'))).toEqual([150, 300, 450, 600, 750]);
  });

  it('a fixed action price applies from the first pack', () => {
    expect(ladder(offerWith('nu € 2,49'))).toEqual([249, 498, 747, 996, 1245]);
  });

  it('an unsupported promotion changes nothing at all', () => {
    const offer = offerWith('feestweek voordeel');
    expect(offer.promotion).toBeUndefined();
    expect(ladder(offer)).toEqual([300, 600, 900, 1200, 1500]);
  });
});

describe('the mistakes a promotion feed invites', () => {
  it('never prices a bundle as a per-item discount', () => {
    // A feed saying "2 voor € 3 (€ 1,50 per stuk)" tempts exactly this: one
    // pack at €1,50. The register charges €3,00 for one pack.
    const offer = offerWith('2 voor € 3', 150);
    expect(priceForUnits(offer, 1)).toBe(300);
    expect(priceForUnits(offer, 2)).toBe(300);
    expect(priceForUnits(offer, 3)).toBe(600);
  });

  it('never charges more because of a promotion', () => {
    // A badly entered offer that is worse than the shelf price must not inflate
    // the plan. The engine takes the cheaper of the two, always.
    const offer = offerWith('nu € 4,99');
    expect(priceForUnits(offer, 1)).toBe(300);
    expect(promotionSavings(offer, 1)).toBe(0);
  });

  it('does not apply a bundle below its minimum quantity', () => {
    const offer = offerWith('3 voor € 5');
    expect(priceForUnits(offer, 1)).toBe(300);
    expect(priceForUnits(offer, 2)).toBe(600);
    expect(priceForUnits(offer, 3)).toBe(500);
  });

  it('keeps every total in whole cents', () => {
    // 33% off €3,00 is €2,01 a pack, not €2,0100000000000002.
    for (const text of ['33% korting', '2e halve prijs', '3 voor € 5', '1 + 1 gratis']) {
      for (const units of [1, 2, 3, 4, 5, 7]) {
        const total = priceForUnits(offerWith(text), units);
        expect(Number.isInteger(total), `${text} @ ${units}`).toBe(true);
      }
    }
  });

  it('is monotone: more packs never cost less', () => {
    // Not a mathematical necessity — it is a property of these five types, and
    // one the packaging solver's lower bound relies on.
    for (const text of [
      '1 + 1 gratis',
      '2 + 1 gratis',
      '2 voor € 5',
      '25% korting',
      '2e halve prijs',
    ]) {
      const prices = ladder(offerWith(text), 8);
      for (let i = 1; i < prices.length; i += 1) {
        expect(prices[i]!, `${text} @ ${i + 1}`).toBeGreaterThanOrEqual(prices[i - 1]!);
      }
    }
  });
});

/**
 * A discount is never a reason to eat something you cannot eat.
 *
 * Dietary and safety rules are applied in the recipe filter, long before any
 * price is computed, so a promotion structurally cannot reach them. This test
 * exists because "structurally cannot" is a claim, and a later refactor that
 * moved filtering after pricing would break it silently.
 */
// A full week optimisation over the whole library, so the default five-second
// budget is too tight: the library grew from 56 dishes to 141 in Sprint 2.
describe('a promotion never outranks a dietary rule', { timeout: 120_000 }, () => {
  it('does not appear in a plan for a household that cannot eat it', async () => {
    const { optimiseWeek } = await import('@/domain/optimization/week-optimizer');
    const { demoHousehold, ingredientIndex, recipes, storeCandidates, TEST_DATE, TEST_TODAY } =
      await import('../../support/fixtures');

    // A household that cannot have milk, and a spectacular discount on it.
    const household = {
      ...demoHousehold,
      members: demoHousehold.members.map((member) => ({
        ...member,
        allergies: [...member.allergies, 'melk' as (typeof member.allergies)[number]],
      })),
    };

    const freeMilk: Promotion = {
      id: 'test:milk',
      productId: 'wordt-per-aanbod-gezet',
      scope: { kind: 'chain', chainId: 'ah' },
      params: { type: 'PERCENT_OFF', percent: 99 },
      minUnits: 1,
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
      label: '99% korting',
    };
    const stores = storeCandidates().map((store) => ({
      ...store,
      offers: store.offers.map((offer) =>
        offer.ingredientId === 'melk'
          ? { ...offer, promotion: { ...freeMilk, productId: offer.productId } }
          : offer,
      ),
    }));

    const result = optimiseWeek({
      household,
      recipes,
      ingredients: ingredientIndex,
      stores,
      maxStores: 1,
      conveniencePreference: 'laagste-prijs',
      budget: {},
      startDate: TEST_DATE,
      today: TEST_TODAY,
    });

    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    const bought = result.plan.recommendedOption.assignments.map((a) => a.ingredientId);
    expect(bought).not.toContain('melk');
  });
});
