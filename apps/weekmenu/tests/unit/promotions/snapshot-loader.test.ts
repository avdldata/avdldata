import { describe, expect, it } from 'vitest';
import {
  identityCoverage,
  loadPrijsProfeetSnapshot,
  shelfCoverage,
  type LoadOptions,
} from '@/services/promotions/load-snapshot';
import {
  SnapshotSchemaError,
  classifyRecord,
  prijsProfeetRecordSchema,
  type PrijsProfeetRecord,
} from '@/services/promotions/snapshot-schema';
import {
  dedupeRecords,
  FIELD_BINDINGS,
  identityKey,
  identityOf,
  mapResponse,
  normaliseRetailer,
  retailerProductIdOf,
} from '@/services/promotions/prijsprofeet-adapter';
import { linkPromotions, toCandidate } from '@/services/promotions/link-promotions';
import { parseTypedPromotion } from '@/services/promotions/parse-promotion-text';
import { cents } from '@/domain/units';
import type { ProductOffer } from '@/domain/stores/types';

/**
 * Reading a snapshot in PrijsProfeet's own field names.
 *
 * The failure this suite exists to prevent is not a crash. It is the quiet
 * one: a renamed field, zero promotions parsed, every week planned at full
 * price, and nothing anywhere saying so. So a good part of what follows checks
 * that bad input produces a loud, specific error instead of an empty list.
 *
 * The other part is the four kinds of record the feed actually publishes.
 * Three of them are not promotions, and the tests below pin down that they are
 * separated by kind rather than by a downstream check that could be forgotten:
 * a shelf price is a different *type*, and a historical price point never
 * leaves the importer.
 */

/** A promotion record, in the source's spelling. */
const promo = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  product_id: 'pp-4471',
  base_product_id: 'bp-77120',
  retailer: 'jumbo',
  name: 'Jumbo Rundergehakt',
  quantity: '300 g',
  price: 2.49,
  original_price: 3.49,
  is_current_deal: true,
  promotion_status: 'active',
  promotion_type: 'one_plus_one',
  promotion_text: '1 + 1 gratis',
  valid_from: '2026-09-14',
  valid_until: '2026-09-20',
  ...over,
});

const options = (files: Record<string, string>): LoadOptions => ({
  readFile: (path) => files[path]!,
  exists: (path) => path in files,
  now: () => new Date('2026-09-15T08:00:00.000Z'),
});

/**
 * One record through the real schema.
 *
 * The adapter works on validated records — prices already in cents — so the
 * tests that call it directly go through the parser rather than hand-building
 * the output shape. Skipping it would test a shape the loader never produces.
 */
const parsed = (over: Record<string, unknown> = {}): PrijsProfeetRecord =>
  prijsProfeetRecordSchema.parse(promo(over));

const load = (records: unknown, path = 'snap.json') =>
  loadPrijsProfeetSnapshot(path, options({ [path]: JSON.stringify(records) }));

const loaded = (records: unknown) => {
  const outcome = load(records);
  if (outcome.status !== 'LOADED') throw new Error('verwacht LOADED');
  return outcome;
};

describe('de vier soorten records die de bron publiceert', () => {
  it('neemt een actieve promotie op als promotie', () => {
    const outcome = loaded([promo()]);
    expect(outcome.promotions).toHaveLength(1);
    expect(outcome.byUse.PROMOTION).toBe(1);

    const promotion = outcome.promotions[0]!;
    expect(promotion.chainId).toBe('jumbo');
    expect(promotion.promotionStatus).toBe('active');
    expect(promotion.validFrom).toBe('2026-09-14');
    expect(promotion.validUntil).toBe('2026-09-20');
    // `price` is de actieprijs, `original_price` de prijs ervoor. Nooit omgedraaid.
    expect(promotion.promotionalPriceCents).toBe(249);
    expect(promotion.regularPriceCents).toBe(349);
  });

  it('neemt een komende promotie óók op, want de week wordt vooruit gepland', () => {
    const outcome = loaded([
      promo({
        promotion_status: 'upcoming',
        is_current_deal: false,
        valid_from: '2026-09-21',
        valid_until: '2026-09-27',
      }),
    ]);
    expect(outcome.promotions).toHaveLength(1);
    expect(outcome.promotions[0]!.promotionStatus).toBe('upcoming');
    // is_current_deal is bronsignaal, geen geldigheidsregel: het staat op false
    // en de promotie wordt tóch geïmporteerd. De winkeldatum beslist later.
    expect(outcome.promotions[0]!.isActive).toBe(false);
  });

  it('houdt een historische prijs volledig buiten de checkout', () => {
    const outcome = loaded([
      promo({
        promotion_status: 'historical',
        is_current_deal: false,
        valid_from: '2026-08-01',
        valid_until: '2026-08-07',
      }),
    ]);
    // Niet als verlopen promotie meegegeven maar helemaal niet meegegeven. Op een
    // tweede controle vertrouwen om de eerste fout ongedaan te maken is precies
    // hoe die eerste fout er ooit doorheen komt.
    expect(outcome.promotions).toHaveLength(0);
    expect(outcome.shelfPrices).toHaveLength(0);
    expect(outcome.byUse.HISTORICAL).toBe(1);
  });

  it('maakt van een schapprijs een ander type, geen korting', () => {
    const outcome = loaded([
      {
        product_id: 'pp-9001',
        base_product_id: 'bp-9001',
        retailer: 'ah',
        name: 'AH Halfvolle melk',
        quantity: '1 l',
        price: 1.19,
        unit_price: 1.19,
        promotion_status: 'shelf',
        url: 'https://www.ah.nl/producten/product/wi104081/ah-halfvolle-melk',
      },
    ]);
    expect(outcome.promotions).toHaveLength(0);
    expect(outcome.shelfPrices).toHaveLength(1);
    expect(outcome.byUse.SHELF_PRICE).toBe(1);
    expect(outcome.shelfPrices[0]!.priceCents).toBe(119);
    expect(outcome.shelfPrices[0]!.chainId).toBe('ah');
  });

  it('houdt een schapprijs zonder product_id gewoon vast', () => {
    // product_id == null betekent niet "ongeldig record": een schaprecord met
    // alleen een EAN draagt nog steeds een prijs, en dat is precies het record
    // dat prijsvalidatie nodig heeft.
    const outcome = loaded([
      {
        product_id: null,
        retailer: 'ah',
        name: 'AH Volle yoghurt',
        quantity: '1 l',
        price: 1.35,
        ean: '8718906123456',
        promotion_status: 'shelf',
      },
    ]);
    expect(outcome.shelfPrices).toHaveLength(1);
    expect(outcome.byUse.NO_IDENTITY).toBe(0);
    const identity = outcome.shelfPrices[0]!.identity;
    expect(identity.productId).toBeUndefined();
    expect(identity.ean).toBe('8718906123456');
  });

  it('weigert pas wanneer er echt geen enkele identiteit is', () => {
    const outcome = loaded([
      { retailer: 'ah', name: 'Onbekend artikel', price: 1.0, promotion_status: 'shelf' },
    ]);
    expect(outcome.byUse.NO_IDENTITY).toBe(1);
    expect(outcome.shelfPrices).toHaveLength(0);
  });

  it('past een promotie zonder venster niet toe', () => {
    const outcome = loaded([promo({ valid_from: null, valid_until: null })]);
    expect(outcome.promotions).toHaveLength(0);
    expect(outcome.byUse.PROMOTION_WITHOUT_WINDOW).toBe(1);
  });
});

describe('welke identiteit telt', () => {
  it('gebruikt base_product_id boven product_id', () => {
    const record = parsed();
    expect(identityKey(record)).toContain(':base:bp-77120');
    const identity = identityOf(record);
    expect(identity).toMatchObject({
      provider: 'PRIJSPROFEET',
      retailer: 'jumbo',
      productId: 'pp-4471',
      baseProductId: 'bp-77120',
    });
  });

  it('ziet twee product_ids met hetzelfde base_product_id als één product', () => {
    // Het geval waarvoor base_product_id bestaat: de bron hernummert per
    // folderweek en de koppeling zou stilletjes wegrotten.
    const week1 = parsed({ product_id: 'pp-4471' });
    const week2 = parsed({
      product_id: 'pp-9988',
      valid_from: '2026-09-21',
      valid_until: '2026-09-27',
    });
    expect(identityKey(week1)).toBe(identityKey(week2));

    const outcome = loaded([week1, week2]);
    // Twee vensters, dus twee aanbiedingen — de identiteit is gelijk, de
    // aanbieding niet. Ontdubbelen op identiteit alléén zou de tweede week
    // weggooien, en dat is dataverlies dat zich voordoet als "promoties leveren
    // weinig op".
    expect(outcome.promotions).toHaveLength(2);
    expect(outcome.duplicatesDropped).toBe(0);
    expect(new Set(outcome.promotions.map((p) => p.baseProductId))).toEqual(new Set(['bp-77120']));
  });

  it('ontdubbelt hetzelfde aanbod dat twee keer in het bestand staat', () => {
    const outcome = loaded([promo(), promo({ product_id: 'pp-anders' })]);
    expect(outcome.promotions).toHaveLength(1);
    expect(outcome.duplicatesDropped).toBe(1);
  });

  it('valt bij ontbrekend base_product_id terug op het winkelartikelnummer', () => {
    const record = parsed({
      base_product_id: null,
      retailer: 'ah',
      url: 'https://www.ah.nl/producten/product/wi415202/100-coconut-grove',
    });
    expect(retailerProductIdOf(record)).toBe('wi415202');
    expect(identityKey(record)).toBe('ah:sku:wi415202');
  });

  it('daarna op EAN, en pas als laatste op product_id', () => {
    const withEan = parsed({ base_product_id: null, url: null, ean: '08712345678901' });
    // Voorloopnullen zijn opmaak, geen getal.
    expect(identityKey(withEan)).toBe('jumbo:ean:8712345678901');

    const bare = parsed({ base_product_id: null, url: null, ean: null });
    expect(identityKey(bare)).toBe('jumbo:pid:pp-4471');
  });

  it('leest een winkelartikelnummer alleen wanneer het die vorm ook heeft', () => {
    // "545398 betekent vast wi545398" is een gok, en een verkeerd artikelnummer
    // koppelt een promotie aan het verkeerde product.
    const numeric = parsed({
      retailer: 'ah',
      base_product_id: null,
      url: null,
      product_id: '545398',
    });
    expect(retailerProductIdOf(numeric)).toBeUndefined();

    const shaped = parsed({
      retailer: 'jumbo',
      base_product_id: null,
      url: null,
      product_id: '128692ZK',
    });
    expect(retailerProductIdOf(shaped)).toBe('128692ZK');
  });

  it('houdt identiteiten per keten gescheiden', () => {
    const ah = parsed({ retailer: 'ah', base_product_id: 'bp-1' });
    const jumbo = parsed({ retailer: 'jumbo', base_product_id: 'bp-1' });
    expect(identityKey(ah)).not.toBe(identityKey(jumbo));
  });
});

describe('EAN koppelt aan een product, niet aan een aanbieding', () => {
  const offer = (chainId: string, productId: string, priceCents: number): ProductOffer => ({
    productId,
    chainId,
    locationId: `${chainId}-1`,
    ingredientId: 'rundergehakt',
    name: 'Rundergehakt',
    brandName: 'Huismerk',
    isPrivateLabel: true,
    packageAmount: { amount: 300, unit: 'g' },
    normalUnitPriceCents: cents(priceCents),
    unitPriceCents: cents(priceCents),
    pricePerBaseUnitCents: priceCents / 300,
    nutritionOrigin: 'none',
  });

  const offers = [offer('ah', 'ah:gehakt', 349), offer('jumbo', 'jumbo:gehakt', 329)];
  const gtinByProduct = new Map([
    ['ah:gehakt', '8712345678901'],
    ['jumbo:gehakt', '8712345678901'],
  ]);

  it('koppelt exact op EAN wanneer er geen sterkere identiteit is', () => {
    const outcome = loaded([
      promo({ retailer: 'jumbo', base_product_id: null, url: null, ean: '8712345678901' }),
    ]);
    const result = linkPromotions({
      chainId: 'jumbo',
      candidates: outcome.promotions.map(toCandidate),
      offers,
      retailerIdByProduct: new Map(),
      gtinByProduct,
    });
    expect(result.metrics.byTier.EXACT_GTIN).toBe(1);
    expect(result.linked[0]!.offer.productId).toBe('jumbo:gehakt');
  });

  it('laat dezelfde EAN bij twee ketens twee aparte aanbiedingen blijven', () => {
    // Eén product, twee winkels, twee prijzen. Een EAN die over ketens heen
    // koppelt mag nooit de aanbiedingen samentrekken: dan zou een Jumbo-korting
    // in een AH-mandje terechtkomen.
    const outcome = loaded([
      promo({
        retailer: 'jumbo',
        base_product_id: null,
        url: null,
        ean: '8712345678901',
        product_id: 'pp-j',
      }),
      promo({
        retailer: 'ah',
        base_product_id: null,
        url: null,
        ean: '8712345678901',
        product_id: 'pp-a',
      }),
    ]);
    expect(outcome.promotions).toHaveLength(2);

    const candidates = outcome.promotions.map(toCandidate);
    for (const chainId of ['ah', 'jumbo']) {
      const result = linkPromotions({
        chainId,
        candidates,
        offers,
        retailerIdByProduct: new Map(),
        gtinByProduct,
      });
      // Precies één promotie per keten, gekoppeld aan de aanbieding van díé keten.
      expect(result.linked).toHaveLength(1);
      expect(result.linked[0]!.offer.chainId).toBe(chainId);
      expect(result.linked[0]!.promotion!.scope).toEqual({ kind: 'chain', chainId });
    }
  });
});

describe('wat een gedrifte momentopname doet', () => {
  it('noemt het record en het veld wanneer er een ontbreekt', () => {
    const file = [promo(), { ...promo(), name: undefined }];
    expect(() => load(file)).toThrow(SnapshotSchemaError);
    try {
      load(file);
    } catch (error) {
      const message = (error as Error).message;
      // De index en het veld, zodat de export te repareren is zonder gokken.
      expect(message).toContain('1.name');
      expect(message).toContain('snap.json');
    }
  });

  it('weigert een onbekend veld in plaats van het te negeren', () => {
    // Een extra sleutel betekent meestal dat er een hernoemde naast ontbreekt.
    expect(() => load([{ ...promo(), prijs_nu: 2.49 }])).toThrow(SnapshotSchemaError);
  });

  it('weigert een datum die geen datum is', () => {
    expect(() => load([promo({ valid_until: '20-09-2026' })])).toThrow(/valid_until/);
  });

  it('weigert een prijs die geen prijs is, in plaats van hem gratis te maken', () => {
    expect(() => load([promo({ price: 'op aanvraag' })])).toThrow(/price/);
  });

  it('weigert een onbekende promotiestatus', () => {
    expect(() => load([promo({ promotion_status: 'binnenkort' })])).toThrow(SnapshotSchemaError);
  });

  it('zegt het gewoon wanneer het bestand geen JSON is', () => {
    expect(() =>
      loadPrijsProfeetSnapshot('snap.json', options({ 'snap.json': '<html>404</html>' })),
    ).toThrow(/geen geldige JSON/);
  });

  it('geeft nooit een lege lijst terug waar hij had moeten struikelen', () => {
    // Het hele punt van deze suite in één assertie.
    for (const bad of [
      [{ ...promo(), retailer: undefined }],
      [{ ...promo(), name: '' }],
      { promoties: [promo()] },
    ]) {
      expect(() => load(bad), JSON.stringify(bad).slice(0, 40)).toThrow();
    }
  });
});

describe('ketens die deze fase niet dekt', () => {
  it('telt ze en slaat ze over, in plaats van te struikelen', () => {
    const outcome = loaded([promo(), promo({ retailer: 'lidl', base_product_id: 'bp-l' })]);
    expect(outcome.promotions).toHaveLength(1);
    expect(outcome.skippedRetailers).toEqual({ lidl: 1 });
  });

  it('herkent de spellingen die we wél dekken', () => {
    expect(normaliseRetailer('Albert Heijn')).toBe('ah');
    expect(normaliseRetailer('AH')).toBe('ah');
    expect(normaliseRetailer('Jumbo')).toBe('jumbo');
    expect(normaliseRetailer('Plus')).toBeUndefined();
  });
});

describe('geen momentopname', () => {
  it('is een toestand, geen fout', () => {
    const outcome = loadPrijsProfeetSnapshot('missing.json', options({}));
    expect(outcome.status).toBe('ABSENT');
    if (outcome.status === 'ABSENT') {
      expect(outcome.message).toContain('PrijsProfeet snapshot unavailable');
      expect(outcome.message).toContain('continuing without promotions');
    }
  });
});

describe('de veldbinding', () => {
  it('is ingevuld met de officiële namen', () => {
    expect(FIELD_BINDINGS).toMatchObject({
      productId: 'product_id',
      baseProductId: 'base_product_id',
      retailer: 'retailer',
      name: 'name',
      ean: 'ean',
      quantity: 'quantity',
      price: 'price',
      originalPrice: 'original_price',
      unitPrice: 'unit_price',
      promotionStatus: 'promotion_status',
      validFrom: 'valid_from',
      validUntil: 'valid_until',
      promotionType: 'promotion_type',
      url: 'url',
    });
  });

  it('leest een omhulde respons net zo als een bestand', () => {
    const imported = mapResponse(
      { source: 'PRIJSPROFEET', fetched_at: '2026-09-14T05:30:00.000Z', results: [promo()] },
      { fetchedAt: '2026-09-14T05:30:00.000Z' },
    );
    expect(imported.promotions).toHaveLength(1);
    expect(imported.byUse.PROMOTION).toBe(1);
  });
});

describe('classificatie los van validatie', () => {
  const record = (over: Record<string, unknown>) => ({ retailer: 'ah', name: 'x', ...over });

  it('leidt de soort af uit het venster wanneer de status ontbreekt', () => {
    expect(
      classifyRecord(
        record({ base_product_id: 'b', valid_from: '2026-09-14', valid_until: '2026-09-20' }),
      ),
    ).toBe('PROMOTION');
    // Geen status en geen venster: als schapprijs lezen is de behoudende keuze,
    // want een ongedateerd record als korting behandelen laat hem eeuwig gelden.
    expect(classifyRecord(record({ base_product_id: 'b' }))).toBe('SHELF_PRICE');
  });
});

describe('de typecode van de bron', () => {
  const params = (code: string, text?: string, promoPrice?: number, regular?: number) => {
    const result = parseTypedPromotion(code, text, promoPrice, regular);
    return result.status === 'OK' ? result.params : `FAILED:${result.reason}`;
  };

  it('leest one_plus_one zonder tekst nodig te hebben', () => {
    expect(params('one_plus_one', '')).toEqual({ type: 'ONE_PLUS_ONE' });
  });

  it('haalt de getallen voor multi_buy uit de tekst', () => {
    expect(params('multi_buy', '2 voor € 5')).toEqual({
      type: 'N_FOR_X',
      bundleSize: 2,
      bundlePriceCents: 500,
    });
  });

  it('weigert een multi_buy waarvan de tekst niet zegt hoeveel', () => {
    expect(params('multi_buy', 'voordeelbundel')).toBe('FAILED:UNSUPPORTED_PROMOTION');
  });

  it('rekent een percentage uit twee genoemde prijzen, en alleen daaruit', () => {
    expect(params('percentage', '', 300, 400)).toEqual({ type: 'PERCENT_OFF', percent: 25 });
    expect(params('percentage', 'korting!')).toBe('FAILED:UNSUPPORTED_PROMOTION');
  });

  it('geeft de tekst voorrang wanneer die specifieker is dan de code', () => {
    expect(params('nth_discount', '2e halve prijs')).toEqual({
      type: 'BUY_NTH_DISCOUNT',
      nth: 2,
      percent: 50,
    });
  });

  it('valt terug op de tekst bij een code die we niet kennen', () => {
    expect(params('kerstactie', '1 + 1 gratis')).toEqual({ type: 'ONE_PLUS_ONE' });
  });
});

describe('wat een momentopname draagt, geteld', () => {
  it('rapporteert identiteits- en statusdekking per keten', () => {
    const outcome = loaded([
      promo({
        retailer: 'ah',
        base_product_id: 'bp-1',
        ean: '8712345678901',
        url: 'https://www.ah.nl/producten/product/wi104081/bonduelle-kikkererwten',
      }),
      promo({
        retailer: 'ah',
        base_product_id: 'bp-2',
        valid_from: '2026-09-20',
        valid_until: '2026-09-26',
        promotion_status: 'upcoming',
      }),
      promo({
        retailer: 'jumbo',
        base_product_id: 'bp-3',
        valid_from: '2026-09-01',
        valid_until: '2026-09-07',
      }),
    ]);

    const coverage = identityCoverage(outcome.promotions, '2026-09-16');
    const ah = coverage.find((c) => c.retailer === 'ah')!;
    expect(ah.records).toBe(2);
    expect(ah.withStableId).toBe(2);
    expect(ah.withGtin).toBe(1);
    expect(ah.withRetailerId).toBe(1);
    expect(ah.withProductId).toBe(2);
    // Status komt uit het venster tegen de winkeldatum, niet uit een vlag die
    // waar was toen de export werd gemaakt.
    expect(ah.active).toBe(1);
    expect(ah.upcoming).toBe(1);
    expect(coverage.find((c) => c.retailer === 'jumbo')!.expired).toBe(1);
  });

  it('telt schapprijzen in een eigen tabel', () => {
    const outcome = loaded([
      {
        retailer: 'ah',
        name: 'AH Melk',
        price: 1.19,
        ean: '8718906123456',
        promotion_status: 'shelf',
        url: 'https://www.ah.nl/producten/product/wi104081/ah-melk',
      },
    ]);
    const [row] = shelfCoverage(outcome.shelfPrices);
    expect(row).toMatchObject({ retailer: 'ah', records: 1, withEan: 1, withPrice: 1 });
    expect(row!.withRetailerId).toBe(1);
  });
});

describe('ontdubbelen als losse functie', () => {
  it('laat het laatste record winnen', () => {
    const result = dedupeRecords([parsed({ price: 2.49 }), parsed({ price: 1.99 })]);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]!.price).toBe(199);
    expect(result.duplicatedKeys).toHaveLength(1);
  });

  it('houdt records zonder enige identiteit apart in plaats van ze samen te voegen', () => {
    const anonymous = prijsProfeetRecordSchema.parse({ retailer: 'ah', name: 'A' });
    const other = prijsProfeetRecordSchema.parse({ retailer: 'ah', name: 'B' });
    const result = dedupeRecords([anonymous, other]);
    expect(result.kept).toHaveLength(2);
    expect(result.dropped).toBe(0);
  });
});
