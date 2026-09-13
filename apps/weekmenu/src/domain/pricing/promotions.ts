import { type Cents, cents, minCents, ZERO_CENTS } from '../units';
import type { ProductOffer, Promotion } from '../stores/types';

/**
 * The pricing engine.
 *
 * The single most important property here is that price is NOT linear in the
 * number of units. "1+1 gratis" means two packs cost the same as one; "2 voor
 * €4" means the third pack costs full price again. Anything that multiplies a
 * required weight by a price-per-kilo is simply wrong, which is why the rest of
 * the system only ever asks this module: what do n packs actually cost?
 */

/** Is a date (yyyy-mm-dd) inside a [validFrom, validUntil] window, inclusive? */
export function isWithinValidity(
  window: { readonly validFrom: string; readonly validUntil: string },
  onDate: string,
): boolean {
  return onDate >= window.validFrom && onDate <= window.validUntil;
}

export function isPromotionActive(promotion: Promotion, onDate: string): boolean {
  return isWithinValidity(promotion, onDate);
}

/**
 * What you actually pay at the register for `units` packs of this offer.
 *
 * A promotion is only applied when it is genuinely cheaper than paying the
 * shelf price — a register never charges you more because of an offer, and this
 * also stops a badly entered promotion from inflating the plan.
 */
export function priceForUnits(offer: ProductOffer, units: number): Cents {
  if (!Number.isInteger(units) || units < 0) {
    throw new RangeError(`units must be a non-negative integer, received ${units}`);
  }
  if (units === 0) return ZERO_CENTS;

  const plain = cents(offer.unitPriceCents * units);
  const promotion = offer.promotion;
  if (!promotion || units < promotion.minUnits) return plain;

  return minCents(plain, promotionalPrice(promotion, offer, units));
}

function promotionalPrice(promotion: Promotion, offer: ProductOffer, units: number): Cents {
  const params = promotion.params;
  switch (params.type) {
    case 'FIXED_PRICE':
      return cents(params.unitPriceCents * units);

    case 'PERCENT_OFF': {
      // Supermarkets discount per unit and round each unit to whole cents.
      const discounted = cents(offer.unitPriceCents * (1 - params.percent / 100));
      return cents(discounted * units);
    }

    case 'ONE_PLUS_ONE':
      // Every second pack is free; an odd pack is paid in full.
      return cents(Math.ceil(units / 2) * offer.unitPriceCents);

    case 'N_FOR_X': {
      const bundles = Math.floor(units / params.bundleSize);
      const remainder = units - bundles * params.bundleSize;
      return cents(bundles * params.bundlePriceCents + remainder * offer.unitPriceCents);
    }
  }
}

/**
 * Is the promotion actually used at this quantity? Drives the
 * `PROMOTION_USED` explanation and the "aanbieding" badge in the shopping list.
 */
export function promotionApplies(offer: ProductOffer, units: number): boolean {
  const promotion = offer.promotion;
  if (!promotion || units < promotion.minUnits || units === 0) return false;
  return priceForUnits(offer, units) < cents(offer.unitPriceCents * units);
}

/** How much the promotion saves at this quantity (never negative). */
export function promotionSavings(offer: ProductOffer, units: number): Cents {
  if (units === 0) return ZERO_CENTS;
  const plain = cents(offer.normalUnitPriceCents * units);
  const paid = priceForUnits(offer, units);
  return cents(Math.max(0, plain - paid));
}
