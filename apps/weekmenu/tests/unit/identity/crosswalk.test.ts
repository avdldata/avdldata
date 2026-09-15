import { describe, expect, it } from 'vitest';
import { buildCrosswalk, eanIndex, stableIdIndex } from '@/services/identity/crosswalk';
import { toIdentityRecords } from '@/services/identity/prijsprofeet-identities';
import { prijsProfeetRecordSchema } from '@/services/promotions/snapshot-schema';
import { cents } from '@/domain/units';
import type { ProductOffer } from '@/domain/stores/types';
import type { ExternalIdentityRecord } from '@/services/identity/types';

/**
 * The identity crosswalk.
 *
 * An identity link is a durable claim: a wrong barcode written into the
 * crosswalk misdirects every future promotion that quotes it, for as long as
 * the mapping lives. So most of what follows is about what the builder
 * *refuses* — ambiguity, disagreement, and above all the Jumbo article number
 * without its packaging code.
 */

const offer = (
  over: Partial<ProductOffer> & { productId: string; chainId: string },
): ProductOffer => ({
  locationId: `${over.chainId}-1`,
  ingredientId: 'melk',
  name: 'Campina Halfvolle Melk',
  brandName: 'Campina',
  isPrivateLabel: false,
  packageAmount: { amount: 2400, unit: 'ml' },
  normalUnitPriceCents: cents(269),
  unitPriceCents: cents(269),
  pricePerBaseUnitCents: 269 / 2400,
  nutritionOrigin: 'none',
  ...over,
});

const record = (over: Partial<ExternalIdentityRecord> = {}): ExternalIdentityRecord => ({
  retailer: 'jumbo',
  name: 'Campina Halfvolle Melk',
  recordKind: 'shelf',
  ...over,
});

const build = (offers: readonly ProductOffer[], records: readonly ExternalIdentityRecord[]) =>
  buildCrosswalk({
    chainId: offers[0]!.chainId,
    offers,
    records,
    source: 'PRIJSPROFEET',
    importedAt: '2026-09-15T08:00:00.000Z',
  });

describe('koppelen op het winkelartikelnummer', () => {
  it('koppelt exact, met de volledige verpakkingscode', () => {
    const result = build(
      [offer({ productId: 'jumbo:campina-melk-2,4-l-74004PAK', chainId: 'jumbo' })],
      [
        record({
          url: 'https://www.jumbo.com/producten/campina-melk-2,4-l-74004PAK',
          ean: '8712800001201',
          baseProductId: 'jumbo_74004PAK',
          productId: 'jumbo_74004PAK',
        }),
      ],
    );
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({
      matchMethod: 'RETAILER_ARTICLE_ID',
      confidence: 1,
      retailerArticleId: '74004pak',
      ean: '8712800001201',
      prijsprofeetBaseProductId: 'jumbo_74004PAK',
    });
  });

  it('koppelt NIET wanneer alleen de verpakkingscode verschilt', () => {
    // De fout die de eerste echte promotiemomentopname opleverde, hier op de
    // plek waar hij duurder zou zijn: een verkeerde EAN in de crosswalk stuurt
    // vanaf dat moment elke promotie die hem noemt verkeerd.
    //
    //   74004PAK  pak van 2,4 liter        € 2,69
    //   74004DSL  doos van vier            € 10,76
    const result = build(
      [offer({ productId: 'jumbo:campina-melk-2,4-l-74004PAK', chainId: 'jumbo' })],
      [
        record({
          name: 'Campina Halfvolle Melk Voordeelpack 4 x 2.4 L',
          url: 'https://www.jumbo.com/producten/campina-halfvolle-melk-voordeelpack-4-x-24-l-74004DSL',
          ean: '9999999999999',
          baseProductId: 'jumbo_74004DSL',
        }),
      ],
    );
    expect(result.links).toHaveLength(0);
    expect(result.metrics.externalUnused).toBe(1);
  });

  it('weigert wanneer twee van onze producten hetzelfde nummer dragen', () => {
    const result = build(
      [
        offer({ productId: 'jumbo:a-74004PAK', chainId: 'jumbo' }),
        offer({ productId: 'jumbo:b-74004PAK', chainId: 'jumbo' }),
      ],
      [record({ url: 'https://www.jumbo.com/producten/x-74004PAK', ean: '111' })],
    );
    expect(result.links).toHaveLength(0);
    expect(result.metrics.ambiguous).toBe(1);
  });
});

describe('tegenstrijdige bronrecords', () => {
  it('laat een product vallen waarover twee records het oneens zijn', () => {
    // Twee EAN's op één artikelnummer betekent dat er één fout is, en er is
    // geen manier om te bepalen welke. Beide weggooien is het enige eerlijke.
    const result = build(
      [offer({ productId: 'jumbo:x-74004PAK', chainId: 'jumbo' })],
      [
        record({ url: 'https://www.jumbo.com/producten/x-74004PAK', ean: '1111111111111' }),
        record({ url: 'https://www.jumbo.com/producten/x-74004PAK', ean: '2222222222222' }),
      ],
    );
    expect(result.links).toHaveLength(0);
    expect(result.metrics.conflicting).toBe(1);
  });

  it('vindt het goed wanneer twee records hetzelfde zeggen', () => {
    const result = build(
      [offer({ productId: 'jumbo:x-74004PAK', chainId: 'jumbo' })],
      [
        record({
          url: 'https://www.jumbo.com/producten/x-74004PAK',
          ean: '1111111111111',
          recordKind: 'shelf',
        }),
        record({
          url: 'https://www.jumbo.com/producten/x-74004PAK',
          ean: '1111111111111',
          recordKind: 'promotion',
        }),
      ],
    );
    expect(result.links).toHaveLength(1);
    expect(result.metrics.conflicting).toBe(0);
  });
});

describe('naam en verpakking', () => {
  it('koppelt alleen wanneer allebei exact gelijk zijn', () => {
    const result = build(
      [offer({ productId: 'ah:melk-zonder-nummer', chainId: 'ah' })],
      [
        record({
          retailer: 'ah',
          name: 'Campina Halfvolle Melk',
          packageText: '2,4 l',
          ean: '8712800001201',
        }),
      ],
    );
    expect(result.links[0]?.matchMethod).toBe('NAME_PACKAGE');
    expect(result.links[0]?.confidence).toBe(0.9);
  });

  it('houdt een gelijke naam met een andere maat tegen', () => {
    const result = build(
      [offer({ productId: 'ah:melk-zonder-nummer', chainId: 'ah' })],
      [record({ retailer: 'ah', name: 'Campina Halfvolle Melk', packageText: '1 l', ean: '999' })],
    );
    // Niet gekoppeld en niet weggegooid: dit is precies het geval waar een mens
    // naar moet kijken.
    expect(result.links).toHaveLength(0);
    expect(result.review).toHaveLength(1);
    expect(result.review[0]?.matchMethod).toBe('NEEDS_REVIEW');
  });

  it('zet een onleesbare verpakking in review in plaats van hem te koppelen', () => {
    const result = build(
      [offer({ productId: 'ah:melk-zonder-nummer', chainId: 'ah' })],
      [record({ retailer: 'ah', name: 'Campina Halfvolle Melk', ean: '999' })],
    );
    expect(result.links).toHaveLength(0);
    expect(result.review).toHaveLength(1);
  });
});

describe('welke records identiteit mogen leveren', () => {
  const parse = (over: Record<string, unknown>) =>
    prijsProfeetRecordSchema.parse({ retailer: 'jumbo', name: 'X', ...over });

  it('neemt schap- en promotierecords, en geen historische', () => {
    const records = toIdentityRecords([
      parse({ base_product_id: 'a', promotion_status: 'shelf' }),
      parse({
        base_product_id: 'b',
        promotion_status: 'active',
        valid_from: '2026-09-14',
        valid_until: '2026-09-20',
      }),
      // Een prijspunt van drie maanden geleden zegt niets betrouwbaars over wat
      // het artikel vandaag is, en een identiteit eruit zou de onderbouwing
      // overleven.
      parse({ base_product_id: 'c', promotion_status: 'historical' }),
    ]);
    expect(records.map((r) => r.baseProductId)).toEqual(['a', 'b']);
    expect(records.map((r) => r.recordKind)).toEqual(['shelf', 'promotion']);
  });

  it('geeft alleen een schaprecord een prijs mee', () => {
    // De prijs op een promotierecord is de effectieve prijs per stuk, niet wat
    // één pak kost. Alleen de schapprijs is een schapprijs.
    const records = toIdentityRecords([
      parse({ base_product_id: 'a', promotion_status: 'shelf', price: 2.69 }),
      parse({
        base_product_id: 'b',
        promotion_status: 'active',
        price: 0.49,
        valid_from: '2026-09-14',
        valid_until: '2026-09-20',
      }),
    ]);
    expect(records[0]?.priceCents).toBe(269);
    expect(records[1]?.priceCents).toBeUndefined();
  });

  it('slaat een record zonder enige identiteit over', () => {
    expect(toIdentityRecords([parse({ promotion_status: 'shelf' })])).toHaveLength(0);
  });
});

describe('de crosswalk als index voor de promotielinker', () => {
  it('levert base_product_id en EAN per product', () => {
    const result = build(
      [offer({ productId: 'jumbo:x-74004PAK', chainId: 'jumbo' })],
      [
        record({
          url: 'https://www.jumbo.com/producten/x-74004PAK',
          ean: '08712800001201',
          baseProductId: 'jumbo_74004PAK',
        }),
      ],
    );
    // Voorloopnullen zijn opmaak, geen getal.
    expect(eanIndex([result]).get('jumbo:x-74004PAK')).toBe('8712800001201');
    expect(stableIdIndex([result]).get('jumbo:x-74004PAK')).toBe('jumbo_74004PAK');
  });
});
