import { describe, expect, it } from 'vitest';
import { parsePromotionText } from '@/services/promotions/parse-promotion-text';

/**
 * Shelf text, read the way the till reads it.
 *
 * Every string in here is a form that Dutch supermarkets actually print. The
 * asymmetry in this suite is deliberate: the "refuses" block is longer than the
 * "reads" block, because a promotion this parser gets wrong makes the plan
 * cheaper than the receipt, and nobody notices until the checkout.
 */
describe('reading a Dutch promotion off its shelf text', () => {
  const params = (text: string, price?: number) => {
    const result = parsePromotionText(text, price);
    return result.status === 'OK' ? result.params : { type: `FAILED:${result.reason}` };
  };

  it('reads one plus one', () => {
    expect(params('1 + 1 gratis')).toEqual({ type: 'ONE_PLUS_ONE' });
    expect(params('1+1 GRATIS')).toEqual({ type: 'ONE_PLUS_ONE' });
  });

  it('reads two plus one as every third free', () => {
    // Buy three, pay two. No new promotion type needed for it.
    expect(params('2 + 1 gratis')).toEqual({ type: 'BUY_NTH_DISCOUNT', nth: 3, percent: 100 });
  });

  it('reads n for a fixed total', () => {
    expect(params('2 voor € 5')).toEqual({
      type: 'N_FOR_X',
      bundleSize: 2,
      bundlePriceCents: 500,
    });
    expect(params('3 stuks voor 4,99')).toEqual({
      type: 'N_FOR_X',
      bundleSize: 3,
      bundlePriceCents: 499,
    });
    expect(params('2 voor €3,-')).toEqual({
      type: 'N_FOR_X',
      bundleSize: 2,
      bundlePriceCents: 300,
    });
  });

  it('reads a percentage', () => {
    expect(params('25% korting')).toEqual({ type: 'PERCENT_OFF', percent: 25 });
    expect(params('-35%')).toEqual({ type: 'PERCENT_OFF', percent: 35 });
  });

  it('reads the nth-item discount, which is not a percentage off everything', () => {
    expect(params('2e halve prijs')).toEqual({ type: 'BUY_NTH_DISCOUNT', nth: 2, percent: 50 });
    expect(params('2e voor de halve prijs')).toEqual({
      type: 'BUY_NTH_DISCOUNT',
      nth: 2,
      percent: 50,
    });
    expect(params('3e gratis')).toEqual({ type: 'BUY_NTH_DISCOUNT', nth: 3, percent: 100 });
    expect(params('2e 50% korting')).toEqual({ type: 'BUY_NTH_DISCOUNT', nth: 2, percent: 50 });
  });

  it('prefers the nth-item rule over the bare percentage inside it', () => {
    // "2e 50% korting" contains "50%". Reading that as PERCENT_OFF would halve
    // every pack instead of only the second one.
    expect(params('2e 50% korting')).not.toEqual({ type: 'PERCENT_OFF', percent: 50 });
  });

  it('reads a stated action price', () => {
    expect(params('nu € 2,49')).toEqual({ type: 'FIXED_PRICE', unitPriceCents: 249 });
    expect(params('actieprijs 0,99')).toEqual({ type: 'FIXED_PRICE', unitPriceCents: 99 });
  });

  it('falls back to a stated price when there is no text at all', () => {
    expect(params('', 199)).toEqual({ type: 'FIXED_PRICE', unitPriceCents: 199 });
  });
});

describe('what it refuses to price, and why', () => {
  const reason = (text: string, price?: number) => {
    const result = parsePromotionText(text, price);
    return result.status === 'OK' ? `OK:${result.params.type}` : result.reason;
  };

  it('refuses an offer that needs a loyalty card', () => {
    // The card price is not the price for a shopper without the card.
    expect(reason('2e halve prijs met bonuskaart')).toBe('UNSUPPORTED_PROMOTION');
    expect(reason('25% korting voor Extra’s leden')).toBe('UNSUPPORTED_PROMOTION');
  });

  it('refuses an offer with a spend threshold or a per-customer limit', () => {
    expect(reason('1+1 gratis bij aankoop van € 20')).toBe('UNSUPPORTED_PROMOTION');
    expect(reason('2 voor € 5, max 2 per klant')).toBe('UNSUPPORTED_PROMOTION');
  });

  it('refuses an online-only offer', () => {
    expect(reason('alleen online 20% korting')).toBe('UNSUPPORTED_PROMOTION');
  });

  it('refuses two-for-two-free, which the engine cannot express', () => {
    // "2+2 gratis" discounts two of every four. BUY_NTH_DISCOUNT discounts one
    // of every n, so pricing it that way would charge for three of four.
    expect(reason('2 + 2 gratis')).toBe('IMPLAUSIBLE_VALUES');
  });

  it('refuses implausible numbers rather than pricing them', () => {
    expect(reason('110% korting')).toBe('UNSUPPORTED_PROMOTION');
    expect(reason('1e halve prijs')).toBe('IMPLAUSIBLE_VALUES');
  });

  it('reads a was/now pair as the new unit price, not as a bundle', () => {
    // The "29" in "4,29" is cents. Reading it as a count of packs turns an
    // ordinary price cut into a bundle of twenty-nine.
    const result = parsePromotionText('van € 4,29 voor € 2,99');
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.params).toEqual({ type: 'FIXED_PRICE', unitPriceCents: 299 });
    }
  });

  it('does not invent a percentage from a was/now pair', () => {
    // 4,29 → 2,99 is 30,3% off, but whether the discount has conditions is not
    // something the words settle. A fixed price says only what is on the label.
    const result = parsePromotionText('van € 4,29 voor € 2,99');
    if (result.status === 'OK') expect(result.params.type).not.toBe('PERCENT_OFF');
  });

  it('says EMPTY rather than guessing when there is nothing to read', () => {
    expect(reason('')).toBe('EMPTY');
    expect(reason('   ')).toBe('EMPTY');
  });

  it('refuses unrecognised text when no price backs it up', () => {
    expect(reason('feestweek voordeel')).toBe('UNSUPPORTED_PROMOTION');
  });
});
