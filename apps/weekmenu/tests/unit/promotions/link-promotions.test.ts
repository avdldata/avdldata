import { describe, expect, it } from 'vitest';
import { cents, quantity, type Cents } from '@/domain/units';
import type { ProductOffer } from '@/domain/stores/types';
import { linkPromotions, toCandidate } from '@/services/promotions/link-promotions';
import type { ExternalPromotion } from '@/services/promotions/types';

/**
 * Tying a promotion to a product, and refusing to when the evidence is thin.
 *
 * The failure this suite is built around is not "we missed a discount". It is a
 * discount landing on the wrong pack: a 1+1 on the 300 g mince applied to the
 * 500 g mince makes the plan cheaper than the till and changes what gets
 * bought. So most of these tests are about what does *not* link.
 */

const offer = (
  productId: string,
  name: string,
  amount: number,
  priceCents: number,
  chainId = 'jumbo',
): ProductOffer => ({
  productId,
  chainId,
  locationId: `${chainId}-shadow`,
  ingredientId: 'gehakt-half',
  name,
  brandName: chainId,
  isPrivateLabel: true,
  packageAmount: quantity(amount, 'g'),
  normalUnitPriceCents: cents(priceCents) as Cents,
  unitPriceCents: cents(priceCents) as Cents,
  pricePerBaseUnitCents: priceCents / amount,
  nutritionOrigin: 'ingredient',
});

const external = (over: Partial<ExternalPromotion> = {}): ExternalPromotion => ({
  externalPromotionId: 'p1',
  source: 'TestBron',
  chainId: 'jumbo',
  productName: 'Jumbo Rundergehakt',
  packageText: '300 g',
  promotionText: '1 + 1 gratis',
  validFrom: '2026-09-14',
  validUntil: '2026-09-20',
  fetchedAt: '2026-09-14T06:00:00.000Z',
  ...over,
});

const run = (
  promotions: readonly ExternalPromotion[],
  offers: readonly ProductOffer[],
  retailerIds: Record<string, string> = {},
  gtins?: Record<string, string>,
) =>
  linkPromotions({
    chainId: 'jumbo',
    candidates: promotions.map(toCandidate),
    offers,
    retailerIdByProduct: new Map(Object.entries(retailerIds)),
    ...(gtins ? { gtinByProduct: new Map(Object.entries(gtins)) } : {}),
  });

describe('tier 1: the shop’s own article number', () => {
  it('links on an exact retailer id', () => {
    const result = run(
      [external({ externalProductId: 'jumbo-rundergehakt-300-g-12345ZK' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
      { 'jumbo:a': '12345ZK' },
    );
    expect(result.linked).toHaveLength(1);
    expect(result.linked[0]!.matchedBy).toBe('EXACT_RETAILER_ID');
  });

  it('links when one side drops the packaging code', () => {
    const result = run(
      [external({ externalProductId: 'iets-anders-genoemd-12345DS' })],
      [offer('jumbo:a', 'Heel andere naam', 300, 349)],
      { 'jumbo:a': '12345ZK' },
    );
    // The names disagree completely; the article number decides, as it should.
    expect(result.linked[0]?.matchedBy).toBe('EXACT_RETAILER_ID');
  });

  it('beats a name match when the two disagree', () => {
    const result = run(
      [external({ externalProductId: 'jumbo-rundergehakt-300-g-99999ZK' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349), offer('jumbo:b', 'Iets anders', 300, 199)],
      { 'jumbo:a': '11111ZK', 'jumbo:b': '99999ZK' },
    );
    expect(result.linked[0]?.offer.productId).toBe('jumbo:b');
  });
});

describe('tier 2 and 3', () => {
  it('links on a GTIN both sides carry', () => {
    const result = run(
      [external({ gtin: '08712345678901', productName: 'Anders geschreven' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
      {},
      { 'jumbo:a': '8712345678901' },
    );
    expect(result.linked[0]?.matchedBy).toBe('EXACT_GTIN');
  });

  it('links on name and package together', () => {
    const result = run([external()], [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)]);
    expect(result.linked[0]?.matchedBy).toBe('NAME_PACKAGE');
  });

  it('does not put a 300 g promotion on the 500 g pack', () => {
    const result = run([external()], [offer('jumbo:b', 'Jumbo Rundergehakt', 500, 549)]);
    expect(result.linked).toHaveLength(0);
    expect(result.review[0]?.matchedBy).toBe('NEEDS_REVIEW');
    expect(result.review[0]?.promotion).toBeUndefined();
  });

  it('sends a name match with no readable pack to review', () => {
    const result = run(
      [external({ packageText: '', productName: 'Jumbo Rundergehakt' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    expect(result.review).toHaveLength(1);
    expect(result.linked).toHaveLength(0);
  });

  it('refuses when two of our products fit equally well', () => {
    const result = run(
      [external()],
      [
        offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349),
        offer('jumbo:b', 'Jumbo Rundergehakt', 300, 329),
      ],
    );
    expect(result.linked).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('AMBIGUOUS_PRODUCT');
    expect(result.rejected[0]?.nearest).toHaveLength(2);
  });

  it('reports a promotion for a product we do not stock', () => {
    const result = run(
      [external({ productName: 'Jumbo Zeewiersnacks' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    expect(result.rejected[0]?.reason).toBe('NO_CANDIDATE_PRODUCT');
  });
});

describe('what never becomes a priced promotion', () => {
  it('keeps an unreadable promotion but does not price it', () => {
    const result = run(
      [external({ promotionText: 'feestweek voordeel', promotionalPriceCents: undefined })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    expect(result.linked).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('UNSUPPORTED_PROMOTION');
    // Fail closed, but keep the evidence: the text survives for a human.
    expect(result.rejected[0]?.candidate.originalText).toBe('feestweek voordeel');
    expect(result.metrics.unsupportedType).toBe(1);
  });

  it('refuses a promotion with no validity window at all', () => {
    const result = run(
      [external({ validFrom: undefined, validUntil: undefined })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    // An open-ended promotion would apply to every week the planner ever runs.
    expect(result.rejected[0]?.reason).toBe('INVALID_VALIDITY');
  });

  it('refuses a window that runs backwards', () => {
    const result = run(
      [external({ validFrom: '2026-09-20', validUntil: '2026-09-14' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    expect(result.rejected[0]?.reason).toBe('INVALID_VALIDITY');
  });

  it('never attaches a promotion to a review-tier link', () => {
    const result = run([external()], [offer('jumbo:b', 'Jumbo Rundergehakt', 500, 549)]);
    for (const entry of result.review) expect(entry.promotion).toBeUndefined();
  });
});

describe('the metrics the phase asks for', () => {
  it('counts identity coverage and type support separately from linking', () => {
    const result = run(
      [
        external({ externalPromotionId: 'a', externalProductId: 'x-12345ZK' }),
        external({ externalPromotionId: 'b', gtin: '8712345678901' }),
        external({
          externalPromotionId: 'c',
          promotionText: 'onleesbaar',
          promotionalPriceCents: undefined,
        }),
        external({
          externalPromotionId: 'd',
          packageText: '',
          productName: 'Naamloos zonder maat',
        }),
      ],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
      { 'jumbo:a': '12345ZK' },
    );
    expect(result.metrics.fetched).toBe(4);
    expect(result.metrics.withRetailerId).toBe(1);
    expect(result.metrics.withGtin).toBe(1);
    expect(result.metrics.supportedType).toBe(3);
    expect(result.metrics.unsupportedType).toBe(1);
  });

  it('ignores promotions belonging to another chain', () => {
    const result = run(
      [external({ chainId: 'ah' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    expect(result.metrics.fetched).toBe(0);
    expect(result.linked).toHaveLength(0);
  });
});

describe('the promotion the optimizer ends up with', () => {
  it('carries the source, the window and the original text', () => {
    const result = run([external()], [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)]);
    const promotion = result.linked[0]!.promotion!;
    expect(promotion.id).toBe('TestBron:p1');
    expect(promotion.productId).toBe('jumbo:a');
    expect(promotion.validFrom).toBe('2026-09-14');
    expect(promotion.validUntil).toBe('2026-09-20');
    expect(promotion.label).toBe('1 + 1 gratis');
    expect(promotion.scope).toEqual({ kind: 'chain', chainId: 'jumbo' });
  });

  it('sets a minimum quantity that matches the offer', () => {
    const min = (text: string): number => {
      const result = run(
        [external({ promotionText: text })],
        [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
      );
      return result.linked[0]!.promotion!.minUnits;
    };
    // A bundle of three does nothing at two packs; a percentage works at one.
    expect(min('1 + 1 gratis')).toBe(2);
    expect(min('3 voor € 5')).toBe(3);
    expect(min('2e halve prijs')).toBe(2);
    expect(min('25% korting')).toBe(1);
    expect(min('nu € 2,49')).toBe(1);
  });
});

/**
 * The correctness bugs earlier phases found, checked from the promotion side.
 *
 * Each of these was a real defect with a real cost — 186 peppers, six bulbs of
 * garlic, a jar of infant purée bought as a vegetable. Promotions are a new
 * route to the same products, so each one gets checked again from this
 * direction. A discount that only lands correctly when nobody is looking at the
 * pack size is the same bug wearing a different hat.
 */
describe('promotions do not reopen an old wound', () => {
  it('does not put a piece-priced promotion on a gram-priced pack', () => {
    // "6 stuks" and "300 g" are not the same pack, whatever the name says.
    const result = run(
      [external({ packageText: '6 stuks', productName: 'Jumbo Rundergehakt' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    expect(result.linked).toHaveLength(0);
    expect(result.review[0]?.matchedBy).toBe('NEEDS_REVIEW');
  });

  it('requires the pack size to match exactly, not approximately', () => {
    // 330 g is not 300 g. A promotion that lands one pack size over is the
    // same class of mistake as pricing grams as pieces.
    const result = run(
      [external({ packageText: '330 g' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    expect(result.linked).toHaveLength(0);
  });

  it('keeps whole packs whole', () => {
    // A promotion never changes how many packs a week needs; it changes what
    // they cost. Nothing in the linking layer may produce a fractional count.
    const result = run([external()], [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)]);
    const promotion = result.linked[0]!.promotion!;
    expect(Number.isInteger(promotion.minUnits)).toBe(true);
    expect(promotion.minUnits).toBeGreaterThanOrEqual(1);
  });

  it('does not let a promotion smuggle infant food onto the list', () => {
    // The offer set never contains it, so a promotion for it has nothing to
    // land on — which is the property worth pinning.
    const result = run(
      [external({ productName: 'Olvarit Rundergehakt 4m+', packageText: '125 g' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    expect(result.linked).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('NO_CANDIDATE_PRODUCT');
  });

  it('leaves the price in whole cents', () => {
    const result = run(
      [external({ promotionText: '33% korting' })],
      [offer('jumbo:a', 'Jumbo Rundergehakt', 300, 349)],
    );
    const params = result.linked[0]!.promotion!.params;
    expect(params.type).toBe('PERCENT_OFF');
    if (params.type === 'PERCENT_OFF') expect(Number.isInteger(params.percent)).toBe(true);
  });
});
