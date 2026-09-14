import { describe, expect, it } from 'vitest';
import {
  isPromotionActive,
  priceForUnits,
  promotionApplies,
  promotionSavings,
} from '@/domain/pricing/promotions';
import {
  fixedPrice,
  makeOffer,
  makePromotion,
  nForX,
  onePlusOne,
  percentOff,
} from '../support/builders';

describe('promotion pricing', () => {
  it('charges the shelf price when there is no promotion', () => {
    const offer = makeOffer({ packAmount: 500, priceCents: 249 });
    expect(priceForUnits(offer, 0)).toBe(0);
    expect(priceForUnits(offer, 1)).toBe(249);
    expect(priceForUnits(offer, 3)).toBe(747);
  });

  it('applies a fixed promotional price', () => {
    const offer = makeOffer({
      packAmount: 600,
      priceCents: 749,
      promotion: makePromotion(fixedPrice(599)),
    });
    expect(priceForUnits(offer, 1)).toBe(599);
    expect(priceForUnits(offer, 2)).toBe(1198);
  });

  it('applies a percentage discount per unit, rounded per unit', () => {
    const offer = makeOffer({
      packAmount: 250,
      priceCents: 199,
      promotion: makePromotion(percentOff(25)),
    });
    // 199 * 0.75 = 149.25 -> 149 per unit
    expect(priceForUnits(offer, 1)).toBe(149);
    expect(priceForUnits(offer, 3)).toBe(447);
  });

  it('makes every second pack free with 1 + 1 gratis', () => {
    const offer = makeOffer({
      packAmount: 500,
      priceCents: 549,
      promotion: makePromotion(onePlusOne(), { minUnits: 2 }),
    });
    expect(priceForUnits(offer, 1)).toBe(549); // below minUnits
    expect(priceForUnits(offer, 2)).toBe(549);
    expect(priceForUnits(offer, 3)).toBe(1098);
    expect(priceForUnits(offer, 4)).toBe(1098);
  });

  it('charges bundle price for complete bundles and shelf price for the rest', () => {
    const offer = makeOffer({
      packAmount: 400,
      priceCents: 89,
      promotion: makePromotion(nForX(4, 250), { minUnits: 4 }),
    });
    expect(priceForUnits(offer, 3)).toBe(267); // promotion not reached
    expect(priceForUnits(offer, 4)).toBe(250);
    expect(priceForUnits(offer, 5)).toBe(339);
    expect(priceForUnits(offer, 8)).toBe(500);
  });

  it('honours a promotion that only starts from two units', () => {
    const offer = makeOffer({
      packAmount: 250,
      priceCents: 119,
      promotion: makePromotion(nForX(2, 179), { minUnits: 2 }),
    });
    expect(priceForUnits(offer, 1)).toBe(119);
    expect(priceForUnits(offer, 2)).toBe(179);
    expect(promotionApplies(offer, 1)).toBe(false);
    expect(promotionApplies(offer, 2)).toBe(true);
  });

  it('never charges more because of a promotion', () => {
    // A badly entered "2 voor €5" while the shelf price is €2 each.
    const offer = makeOffer({
      packAmount: 100,
      priceCents: 200,
      promotion: makePromotion(nForX(2, 500), { minUnits: 2 }),
    });
    expect(priceForUnits(offer, 2)).toBe(400);
    expect(promotionApplies(offer, 2)).toBe(false);
  });

  it('ignores an expired promotion', () => {
    const promotion = makePromotion(fixedPrice(99), {
      validFrom: '2020-01-01',
      validUntil: '2020-01-07',
    });
    expect(isPromotionActive(promotion, '2026-03-02')).toBe(false);
    expect(isPromotionActive(promotion, '2020-01-05')).toBe(true);
  });

  it('ignores a promotion that has not started yet', () => {
    const promotion = makePromotion(fixedPrice(99), {
      validFrom: '2099-01-01',
      validUntil: '2099-01-07',
    });
    expect(isPromotionActive(promotion, '2026-03-02')).toBe(false);
  });

  it('reports savings against the normal price', () => {
    const offer = makeOffer({
      packAmount: 500,
      priceCents: 549,
      normalPriceCents: 549,
      promotion: makePromotion(onePlusOne(), { minUnits: 2 }),
    });
    expect(promotionSavings(offer, 2)).toBe(549);
    expect(promotionSavings(offer, 0)).toBe(0);
  });

  it('rejects fractional or negative pack counts', () => {
    const offer = makeOffer({ packAmount: 500, priceCents: 249 });
    expect(() => priceForUnits(offer, 1.5)).toThrow(RangeError);
    expect(() => priceForUnits(offer, -1)).toThrow(RangeError);
  });
});

describe('every nth item discounted', () => {
  /**
   * The Dutch classic the model could not express until now. A percentage off
   * with a minimum quantity discounts *every* pack, which is a different and
   * much cheaper offer than discounting only the second one — using it for
   * "2e halve prijs" understates the bill by a quarter.
   */
  const offer = makeOffer({ packAmount: 400, priceCents: 300 });

  const secondHalfPrice = makePromotion({ type: 'BUY_NTH_DISCOUNT', nth: 2, percent: 50 });
  const thirdFree = makePromotion({ type: 'BUY_NTH_DISCOUNT', nth: 3, percent: 100 });

  it('charges full price for a single pack', () => {
    expect(priceForUnits({ ...offer, promotion: secondHalfPrice }, 1)).toBe(300);
  });

  it('halves only the second pack', () => {
    // Not 300: that would be half off both.
    expect(priceForUnits({ ...offer, promotion: secondHalfPrice }, 2)).toBe(450);
  });

  it('starts a fresh pair at the third pack', () => {
    expect(priceForUnits({ ...offer, promotion: secondHalfPrice }, 3)).toBe(750);
    expect(priceForUnits({ ...offer, promotion: secondHalfPrice }, 4)).toBe(900);
  });

  it('gives the third one away without touching the first two', () => {
    expect(priceForUnits({ ...offer, promotion: thirdFree }, 2)).toBe(600);
    expect(priceForUnits({ ...offer, promotion: thirdFree }, 3)).toBe(600);
    expect(priceForUnits({ ...offer, promotion: thirdFree }, 6)).toBe(1200);
  });

  it('respects a minimum quantity like every other promotion', () => {
    const fromThree = makePromotion(
      { type: 'BUY_NTH_DISCOUNT', nth: 2, percent: 50 },
      {
        minUnits: 3,
      },
    );
    expect(priceForUnits({ ...offer, promotion: fromThree }, 2)).toBe(600);
    expect(priceForUnits({ ...offer, promotion: fromThree }, 3)).toBe(750);
  });

  it('never charges more than the shelf price', () => {
    const uselessOffer = makePromotion({ type: 'BUY_NTH_DISCOUNT', nth: 9, percent: 10 });
    for (let units = 1; units <= 5; units += 1) {
      expect(priceForUnits({ ...offer, promotion: uselessOffer }, units)).toBe(300 * units);
    }
  });

  it('reports the saving against the shelf price, not the reference price', () => {
    const withPromotion = { ...offer, promotion: secondHalfPrice };
    expect(promotionApplies(withPromotion, 2)).toBe(true);
    expect(promotionSavings(withPromotion, 2)).toBe(150);
    expect(promotionSavings(withPromotion, 1)).toBe(0);
  });
});
