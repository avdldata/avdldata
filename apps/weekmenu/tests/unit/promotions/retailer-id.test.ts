import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  extractAhProductId,
  extractJumboProductId,
  extractRetailerProductId,
  sameRetailerProduct,
} from '@/services/promotions/retailer-id';

/**
 * Every fixture here is a real slug out of the Checkjebon snapshot.
 *
 * A parser tested against identifiers somebody imagined passes its tests and
 * fails on the shelf, which is the same rule the package parser follows.
 */
describe('the shop’s own product number', () => {
  it('reads an Albert Heijn slug', () => {
    expect(extractAhProductId('wi415202/100-coconut-grove')).toEqual({
      id: 'wi415202',
      numeric: '415202',
    });
    expect(extractAhProductId('wi104081/bonduelle-kikkererwten')?.id).toBe('wi104081');
  });

  it('reads an Albert Heijn full URL', () => {
    expect(
      extractAhProductId('https://www.ah.nl/producten/product/wi473073/1000-stories')?.id,
    ).toBe('wi473073');
  });

  it('reads a Jumbo slug, article number and packaging code apart', () => {
    expect(extractJumboProductId('11er-spek-rosti-350-g-128692ZK')).toEqual({
      id: '128692ZK',
      numeric: '128692',
    });
    expect(extractJumboProductId('-to-go-koffiemok-707266STK')).toEqual({
      id: '707266STK',
      numeric: '707266',
    });
  });

  it('reads a Jumbo full URL', () => {
    expect(
      extractJumboProductId('https://www.jumbo.com/producten/jumbo-kikkererwten-400-g-81319ZK')?.id,
    ).toBe('81319ZK');
  });

  it('returns nothing rather than guessing', () => {
    expect(extractAhProductId('')).toBeUndefined();
    expect(extractAhProductId(undefined)).toBeUndefined();
    expect(extractAhProductId('bonduelle-kikkererwten')).toBeUndefined();
    expect(extractJumboProductId('jumbo-kikkererwten-400-g')).toBeUndefined();
    // An AH slug is not a Jumbo slug and must not be read as one.
    expect(extractJumboProductId('wi415202/100-coconut-grove')).toBeUndefined();
    expect(extractRetailerProductId('lidl', 'whatever-12345AB')).toBeUndefined();
  });

  it('matches on the full id or on the article number, never on nothing', () => {
    const full = { id: '128692ZK', numeric: '128692' };
    expect(sameRetailerProduct(full, { id: '128692ZK', numeric: '128692' })).toBe(true);
    // A feed that quotes only the article number still names the same article.
    expect(sameRetailerProduct(full, { id: '128692' })).toBe(false);
    expect(sameRetailerProduct(full, { id: '128692', numeric: '128692' })).toBe(true);
    expect(sameRetailerProduct(full, { id: '128692DS', numeric: '128692' })).toBe(true);
    expect(sameRetailerProduct(full, { id: '999999ZK', numeric: '999999' })).toBe(false);
    // Two unknowns are not a match.
    expect(sameRetailerProduct(undefined, undefined)).toBe(false);
    expect(sameRetailerProduct({ id: 'x' }, { id: 'y' })).toBe(false);
  });
});

/**
 * The whole catalogue, not a handful of examples.
 *
 * The claim in the module comment — that both formats are universal — is worth
 * exactly as much as the check behind it, so here is the check.
 */
const SNAPSHOT = 'data/external/checkjebon-snapshot.json';
const haveSnapshot = (() => {
  try {
    readFileSync(SNAPSHOT, 'utf8');
    return true;
  } catch {
    return false;
  }
})();

(haveSnapshot ? describe : describe.skip)('against every product in the snapshot', () => {
  const chains = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as {
    n?: string;
    d?: { l?: string }[];
  }[];

  it('reads an identifier for every Albert Heijn product', () => {
    const products = chains.find((c) => c.n === 'ah')?.d ?? [];
    expect(products.length).toBeGreaterThan(10_000);
    const missing = products.filter((p) => extractAhProductId(p.l) === undefined);
    expect(missing.map((p) => p.l).slice(0, 5)).toEqual([]);
  });

  it('reads an identifier for every Jumbo product', () => {
    const products = chains.find((c) => c.n === 'jumbo')?.d ?? [];
    expect(products.length).toBeGreaterThan(10_000);
    const missing = products.filter((p) => extractJumboProductId(p.l) === undefined);
    expect(missing.map((p) => p.l).slice(0, 5)).toEqual([]);
  });

  it('gives every product a distinct identifier within its chain', () => {
    // Two products sharing an id would silently let one promotion land on both.
    for (const chainId of ['ah', 'jumbo'] as const) {
      const products = chains.find((c) => c.n === chainId)?.d ?? [];
      const ids = products.map((p) => extractRetailerProductId(chainId, p.l)?.id);
      const seen = new Set<string>();
      const duplicates = ids.filter((id) => id !== undefined && !seen.add(id));
      expect(duplicates.slice(0, 5), chainId).toEqual([]);
    }
  });
});
