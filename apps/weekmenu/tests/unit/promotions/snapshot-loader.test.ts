import { describe, expect, it } from 'vitest';
import {
  identityCoverage,
  loadPrijsProfeetSnapshot,
  type LoadOptions,
} from '@/services/promotions/load-snapshot';
import { SnapshotSchemaError } from '@/services/promotions/snapshot-schema';
import {
  bindRecord,
  FIELD_BINDINGS,
  isConfigured,
  mapResponse,
  PromotionSourceNotConfiguredError,
  unboundRequiredFields,
} from '@/services/promotions/prijsprofeet-adapter';
import { parseTypedPromotion } from '@/services/promotions/parse-promotion-text';

/**
 * Reading a snapshot, and refusing to read one that has drifted.
 *
 * The failure this suite exists to prevent is not a crash. It is the quiet
 * one: a renamed field, zero promotions parsed, every week planned at full
 * price, and nothing anywhere saying so. So most of what follows checks that
 * bad input produces a loud, specific error instead of an empty list.
 */

const record = (over: Record<string, unknown> = {}) => ({
  external_promotion_id: 'p-1',
  retailer: 'jumbo',
  product_name: 'Jumbo Rundergehakt',
  package_text: '300 g',
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

describe('loading a promotion snapshot', () => {
  it('reads a wrapped snapshot with its provenance', () => {
    const file = JSON.stringify({
      source: 'PRIJSPROFEET',
      fetched_at: '2026-09-14T05:30:00.000Z',
      promotions: [record()],
    });
    const outcome = loadPrijsProfeetSnapshot('snap.json', options({ 'snap.json': file }));

    expect(outcome.status).toBe('LOADED');
    if (outcome.status !== 'LOADED') return;
    expect(outcome.promotions).toHaveLength(1);
    expect(outcome.source).toBe('PRIJSPROFEET');
    expect(outcome.sourceFile).toBe('snap.json');
    // Two different facts, kept apart: when they built it, when we read it.
    expect(outcome.fetchedAt).toBe('2026-09-14T05:30:00.000Z');
    expect(outcome.importedAt).toBe('2026-09-15T08:00:00.000Z');
  });

  it('reads a bare array too, because that is what a first export looks like', () => {
    const outcome = loadPrijsProfeetSnapshot(
      'snap.json',
      options({ 'snap.json': JSON.stringify([record()]) }),
    );
    expect(outcome.status).toBe('LOADED');
    if (outcome.status === 'LOADED') expect(outcome.promotions).toHaveLength(1);
  });

  it('keeps AH and Jumbo and counts the rest as skipped', () => {
    const file = JSON.stringify([
      record({ external_promotion_id: 'a', retailer: 'ah' }),
      record({ external_promotion_id: 'b', retailer: 'jumbo' }),
    ]);
    const outcome = loadPrijsProfeetSnapshot('snap.json', options({ 'snap.json': file }));
    expect(outcome.status).toBe('LOADED');
    if (outcome.status !== 'LOADED') return;
    expect(outcome.promotions.map((p) => p.chainId).sort()).toEqual(['ah', 'jumbo']);
  });

  it('converts euros to integer cents at the boundary', () => {
    const file = JSON.stringify([
      record({ current_price: 2.49, regular_price: '€ 3,99', unit_price: '8,30' }),
    ]);
    const outcome = loadPrijsProfeetSnapshot('snap.json', options({ 'snap.json': file }));
    if (outcome.status !== 'LOADED') throw new Error('verwacht LOADED');
    const promotion = outcome.promotions[0]!;
    expect(promotion.promotionalPriceCents).toBe(249);
    expect(promotion.regularPriceCents).toBe(399);
    expect(promotion.unitPriceCents).toBe(830);
  });

  it('carries the stable identity through untouched', () => {
    const file = JSON.stringify([
      record({
        base_product_id: 'bp-778899',
        retailer_product_id: '128692ZK',
        gtin: '8712345678901',
      }),
    ]);
    const outcome = loadPrijsProfeetSnapshot('snap.json', options({ 'snap.json': file }));
    if (outcome.status !== 'LOADED') throw new Error('verwacht LOADED');
    expect(outcome.promotions[0]!.baseProductId).toBe('bp-778899');
    expect(outcome.promotions[0]!.retailerProductId).toBe('128692ZK');
  });
});

describe('what a drifted snapshot does', () => {
  const load = (file: string) =>
    loadPrijsProfeetSnapshot('snap.json', options({ 'snap.json': file }));

  it('names the record and the field when one is missing', () => {
    const file = JSON.stringify([record(), { ...record(), product_name: undefined }]);
    expect(() => load(file)).toThrow(SnapshotSchemaError);
    try {
      load(file);
    } catch (error) {
      const message = (error as Error).message;
      // The index and the field, so the export can be fixed without guessing.
      expect(message).toContain('1.product_name');
      expect(message).toContain('snap.json');
    }
  });

  it('refuses an unknown field rather than ignoring it', () => {
    // An extra key usually means a renamed one is missing next to it.
    const file = JSON.stringify([{ ...record(), prijs_nu: 2.49 }]);
    expect(() => load(file)).toThrow(SnapshotSchemaError);
  });

  it('refuses a date that is not a date', () => {
    const file = JSON.stringify([record({ valid_until: '20-09-2026' })]);
    expect(() => load(file)).toThrow(/valid_until/);
  });

  it('refuses a price that is not a price, instead of treating it as free', () => {
    const file = JSON.stringify([record({ current_price: 'op aanvraag' })]);
    expect(() => load(file)).toThrow(/current_price/);
  });

  it('refuses an unknown retailer value rather than silently dropping it', () => {
    // A skipped *record* for a chain we do not cover is fine; an unrecognised
    // spelling of a chain we do cover is drift, and must be seen.
    const file = JSON.stringify([record({ retailer: 'albert_heijn' })]);
    expect(() => load(file)).toThrow(SnapshotSchemaError);
  });

  it('says so plainly when the file is not JSON', () => {
    expect(() => load('<html>404</html>')).toThrow(/geen geldige JSON/);
  });

  it('never returns an empty list where it should have thrown', () => {
    // The whole point of the suite in one assertion.
    for (const bad of [
      JSON.stringify([{ ...record(), retailer: undefined }]),
      JSON.stringify([{ ...record(), valid_from: '' }]),
      JSON.stringify({ promoties: [record()] }),
    ]) {
      expect(() => load(bad), bad.slice(0, 40)).toThrow();
    }
  });
});

describe('no snapshot at all', () => {
  it('is a state, not a failure', () => {
    const outcome = loadPrijsProfeetSnapshot('missing.json', options({}));
    expect(outcome.status).toBe('ABSENT');
    if (outcome.status === 'ABSENT') {
      expect(outcome.message).toContain('PrijsProfeet snapshot unavailable');
      expect(outcome.message).toContain('continuing without promotions');
    }
  });
});

describe('the field binding, while it is still empty', () => {
  it('reports itself as unconfigured instead of returning nothing', () => {
    expect(isConfigured()).toBe(false);
    // Every required field is named, so nobody has to guess what is missing.
    expect(unboundRequiredFields()).toContain('external_promotion_id');
    expect(unboundRequiredFields()).toContain('product_name');
    expect(() => mapResponse([{ anything: 1 }])).toThrow(PromotionSourceNotConfiguredError);
  });

  it('accepts the one spelling the brief supplied', () => {
    // base_product_id is bound because the brief names it; everything else is
    // deliberately null until a real response has been read.
    expect(FIELD_BINDINGS.base_product_id).toBe('base_product_id');
    expect(bindRecord({ base_product_id: 'bp-1', iets_anders: 2 })).toEqual({
      base_product_id: 'bp-1',
    });
  });

  it('follows a dotted path once one is bound', () => {
    const bindings = FIELD_BINDINGS as {
      -readonly [K in keyof typeof FIELD_BINDINGS]: string | null;
    };
    const original = bindings.current_price;
    bindings.current_price = 'price.current';
    try {
      expect(bindRecord({ price: { current: 2.49 } })).toMatchObject({ current_price: 2.49 });
    } finally {
      bindings.current_price = original;
    }
  });
});

describe('the source’s own promotion type code', () => {
  const params = (code: string, text?: string, promo?: number, regular?: number) => {
    const result = parseTypedPromotion(code, text, promo, regular);
    return result.status === 'OK' ? result.params : `FAILED:${result.reason}`;
  };

  it('reads one_plus_one without needing any text', () => {
    expect(params('one_plus_one', '')).toEqual({ type: 'ONE_PLUS_ONE' });
  });

  it('takes the numbers for multi_buy from the text', () => {
    expect(params('multi_buy', '2 voor € 5')).toEqual({
      type: 'N_FOR_X',
      bundleSize: 2,
      bundlePriceCents: 500,
    });
  });

  it('refuses a multi_buy whose text does not say how many', () => {
    // "Bundle" without a size is not priceable, and defaulting to two would be
    // a guess that costs money.
    expect(params('multi_buy', 'voordeelbundel')).toBe('FAILED:UNSUPPORTED_PROMOTION');
  });

  it('computes a percentage from two stated prices, and only from those', () => {
    expect(params('percentage', '', 300, 400)).toEqual({ type: 'PERCENT_OFF', percent: 25 });
    expect(params('percentage', 'korting!')).toBe('FAILED:UNSUPPORTED_PROMOTION');
  });

  it('prefers the text when it is more specific than the code', () => {
    // "percentage" plus "2e halve prijs" is an nth-item offer, not 50% off
    // everything — and the difference is the price of a whole pack.
    expect(params('nth_discount', '2e halve prijs')).toEqual({
      type: 'BUY_NTH_DISCOUNT',
      nth: 2,
      percent: 50,
    });
  });

  it('falls back to the text for a code it does not know', () => {
    expect(params('kerstactie', '1 + 1 gratis')).toEqual({ type: 'ONE_PLUS_ONE' });
  });
});

describe('what a snapshot carries, counted', () => {
  it('reports identity and status coverage per chain', () => {
    const file = JSON.stringify([
      record({
        external_promotion_id: 'a',
        retailer: 'ah',
        base_product_id: 'bp-1',
        gtin: '871' + '2345678901',
      }),
      record({
        external_promotion_id: 'b',
        retailer: 'ah',
        valid_from: '2026-09-20',
        valid_until: '2026-09-26',
      }),
      record({
        external_promotion_id: 'c',
        retailer: 'jumbo',
        valid_from: '2026-09-01',
        valid_until: '2026-09-07',
      }),
    ]);
    const outcome = loadPrijsProfeetSnapshot('snap.json', options({ 'snap.json': file }));
    if (outcome.status !== 'LOADED') throw new Error('verwacht LOADED');

    const coverage = identityCoverage(outcome.promotions, '2026-09-16');
    const ah = coverage.find((c) => c.retailer === 'ah')!;
    expect(ah.records).toBe(2);
    expect(ah.withStableId).toBe(1);
    expect(ah.withGtin).toBe(1);
    // Status comes from the window against the shopping date, not from a flag
    // that was true when the export was built.
    expect(ah.active).toBe(1);
    expect(ah.upcoming).toBe(1);
    expect(coverage.find((c) => c.retailer === 'jumbo')!.expired).toBe(1);
  });
});
