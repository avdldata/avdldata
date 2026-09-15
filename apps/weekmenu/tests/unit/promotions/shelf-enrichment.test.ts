import { describe, expect, it } from 'vitest';
import {
  comparePrices,
  eanIndexFromShelf,
  linkShelfPrices,
} from '@/services/promotions/shelf-enrichment';
import { linkPromotions, toCandidate } from '@/services/promotions/link-promotions';
import { cents } from '@/domain/units';
import type { ProductOffer } from '@/domain/stores/types';
import type { ExternalPromotion, ExternalShelfPrice } from '@/services/promotions/types';

/**
 * What a shelf record is allowed to do.
 *
 * Two things: hand us an EAN our own catalogue does not have, and disagree with
 * our price loudly enough that someone goes and looks. Not a third — and the
 * first test here is the one that matters, because it is the mistake with no
 * symptom: a shelf price applied as a discount makes the plan cheaper than the
 * till and nothing anywhere says so.
 */

const offer = (
  over: Partial<ProductOffer> & { productId: string; chainId: string },
): ProductOffer => ({
  locationId: `${over.chainId}-1`,
  ingredientId: 'kikkererwten',
  name: 'Bonduelle Kikkererwten',
  brandName: 'Bonduelle',
  isPrivateLabel: false,
  packageAmount: { amount: 400, unit: 'g' },
  normalUnitPriceCents: cents(129),
  unitPriceCents: cents(129),
  pricePerBaseUnitCents: 129 / 400,
  nutritionOrigin: 'none',
  ...over,
});

const shelf = (over: Partial<ExternalShelfPrice> & { chainId: string }): ExternalShelfPrice => ({
  source: 'PRIJSPROFEET',
  productName: 'Bonduelle Kikkererwten',
  identity: { provider: 'PRIJSPROFEET', retailer: over.chainId },
  observedAt: '2026-09-15T08:00:00.000Z',
  ...over,
});

const AH_URL = 'https://www.ah.nl/producten/product/wi104081/bonduelle-kikkererwten';

describe('een schapprijs koppelen', () => {
  const offers = [offer({ productId: 'ah:wi104081/bonduelle-kikkererwten', chainId: 'ah' })];
  const retailerIdByProduct = new Map([['ah:wi104081/bonduelle-kikkererwten', 'wi104081']]);

  it('koppelt op het winkelartikelnummer uit de URL', () => {
    const links = linkShelfPrices(
      [shelf({ chainId: 'ah', url: AH_URL, priceCents: 135 })],
      offers,
      retailerIdByProduct,
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.offer.productId).toBe('ah:wi104081/bonduelle-kikkererwten');
  });

  it('koppelt niet op naam, ook niet wanneer die exact gelijk is', () => {
    // Een schapprijs op het verkeerde product is een verkeerde prijs zonder
    // symptoom. Zonder artikelnummer dus geen koppeling, punt.
    const links = linkShelfPrices(
      [shelf({ chainId: 'ah', priceCents: 135 })],
      offers,
      retailerIdByProduct,
    );
    expect(links).toHaveLength(0);
  });

  it('slaat over wanneer twee producten hetzelfde nummer dragen', () => {
    const ambiguous = [
      offer({ productId: 'ah:a', chainId: 'ah' }),
      offer({ productId: 'ah:b', chainId: 'ah' }),
    ];
    const links = linkShelfPrices(
      [shelf({ chainId: 'ah', url: AH_URL, priceCents: 135 })],
      ambiguous,
      new Map([
        ['ah:a', 'wi104081'],
        ['ah:b', 'wi104081'],
      ]),
    );
    expect(links).toHaveLength(0);
  });
});

describe('EAN oogsten uit schaprecords', () => {
  const offers = [offer({ productId: 'ah:p1', chainId: 'ah' })];
  const retailerIdByProduct = new Map([['ah:p1', 'wi104081']]);

  it('maakt de GTIN-tier bruikbaar die onze eigen catalogus niet kan vullen', () => {
    const links = linkShelfPrices(
      [
        shelf({
          chainId: 'ah',
          url: AH_URL,
          priceCents: 129,
          identity: { provider: 'PRIJSPROFEET', retailer: 'ah', ean: '8712345678901' },
        }),
      ],
      offers,
      retailerIdByProduct,
    );
    const gtinByProduct = eanIndexFromShelf(links);
    expect(gtinByProduct.get('ah:p1')).toBe('8712345678901');

    // En dan koppelt een promotie die alleen een barcode noemt alsnog exact.
    const promotion: ExternalPromotion = {
      externalPromotionId: 'x',
      source: 'PRIJSPROFEET',
      chainId: 'ah',
      productName: 'Iets heel anders gespeld',
      gtin: '8712345678901',
      promotionText: '1 + 1 gratis',
      validFrom: '2026-09-14',
      validUntil: '2026-09-20',
      fetchedAt: '2026-09-15T08:00:00.000Z',
    };
    const result = linkPromotions({
      chainId: 'ah',
      candidates: [toCandidate(promotion)],
      offers,
      retailerIdByProduct,
      gtinByProduct,
    });
    expect(result.metrics.byTier.EXACT_GTIN).toBe(1);
  });

  it('laat een product weg waarover twee schaprecords het oneens zijn', () => {
    // Twee EANs op één artikelnummer betekent dat er één fout is, en er is geen
    // manier om te bepalen welke.
    const links = linkShelfPrices(
      [
        shelf({
          chainId: 'ah',
          url: AH_URL,
          identity: { provider: 'PRIJSPROFEET', retailer: 'ah', ean: '1111111111111' },
        }),
        shelf({
          chainId: 'ah',
          url: AH_URL,
          identity: { provider: 'PRIJSPROFEET', retailer: 'ah', ean: '2222222222222' },
        }),
      ],
      offers,
      retailerIdByProduct,
    );
    expect(eanIndexFromShelf(links).has('ah:p1')).toBe(false);
  });
});

describe('prijzen vergelijken', () => {
  it('rapporteert het verschil en verandert niets', () => {
    const ours = offer({ productId: 'ah:p1', chainId: 'ah', unitPriceCents: cents(129) });
    const links = linkShelfPrices(
      [shelf({ chainId: 'ah', url: AH_URL, priceCents: 149 })],
      [ours],
      new Map([['ah:p1', 'wi104081']]),
    );
    const [row] = comparePrices(links);
    expect(row).toMatchObject({
      chainId: 'ah',
      compared: 1,
      identical: 0,
      differsOverFivePercent: 1,
      medianAbsDiffCents: 20,
    });
    // Onze eigen prijs blijft staan: welke van de twee bronnen gelijk heeft is
    // hiervandaan niet te bepalen.
    expect(ours.unitPriceCents).toBe(129);
  });

  it('telt een schaprecord zonder prijs niet mee', () => {
    const links = linkShelfPrices(
      [shelf({ chainId: 'ah', url: AH_URL })],
      [offer({ productId: 'ah:p1', chainId: 'ah' })],
      new Map([['ah:p1', 'wi104081']]),
    );
    // De keten staat er wel, met nul vergeleken producten. Een lege rij zeggen
    // dat er niets te vergelijken viel is iets anders dan hem verzwijgen.
    expect(comparePrices(links)).toMatchObject([{ chainId: 'ah', compared: 0 }]);
  });
});
