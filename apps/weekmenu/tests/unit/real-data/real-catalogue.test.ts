import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import {
  buildRealCatalogue,
  REAL_CHAIN_IDS,
  RealDataProvider,
} from '@/providers/real-data-provider';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';

/**
 * The catalogue the app actually prices with.
 *
 * These assertions are about the gate rather than the numbers: a product that
 * reaches the optimizer must have an identity, a positive price and a pack size
 * expressed in the unit its recipe is written in. A product that fails any of
 * those is absent, never zero-priced and never guessed at.
 */
const available = existsSync('data/external/checkjebon-snapshot.json');
const describeSnapshot = available ? describe : describe.skip;

describeSnapshot('the real catalogue', () => {
  const catalogue = buildRealCatalogue();
  const ingredientIds = new Set(SEED_INGREDIENTS.map((i) => i.id));

  it('carries all three chains', () => {
    const chains = new Set(catalogue.products.map((p) => p.chainId));
    for (const chainId of REAL_CHAIN_IDS) expect(chains, chainId).toContain(chainId);
  });

  it('prices every product it admits, and none at zero', () => {
    expect(catalogue.observations.length).toBe(catalogue.products.length);
    for (const observation of catalogue.observations) {
      expect(observation.priceCents).toBeGreaterThan(0);
      expect(observation.source).toBe('prijs-snapshot');
    }
  });

  it('gives every product a usable pack size', () => {
    for (const product of catalogue.products) {
      expect(product.packageAmount.amount, product.productName).toBeGreaterThan(0);
      expect(['g', 'ml', 'piece']).toContain(product.packageAmount.unit);
    }
  });

  it('maps every product to an ingredient we actually model', () => {
    for (const product of catalogue.products) {
      expect(ingredientIds, product.productName).toContain(product.canonicalIngredientId);
    }
  });

  it('contains no demo product: every id is a real article from its chain', () => {
    for (const product of catalogue.products) {
      expect(product.id.startsWith(`${product.chainId}:`), product.id).toBe(true);
      expect(product.id.length).toBeGreaterThan(product.chainId.length + 1);
      expect(product.productName.trim()).not.toBe('');
    }
  });

  it('records when the snapshot was captured, so freshness is never invented', () => {
    expect(catalogue.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /**
   * Provenance, and a measured limitation rather than a rounded-off one.
   *
   * Albert Heijn and Jumbo identify a product by a path the extractor knows how
   * to read, so every one of their products resolves to an article number.
   * Lidl identifies a product by a bare number ("lidl:175183"), which that
   * extractor deliberately refuses — a numeric fallback is what once linked a
   * 2,4 litre pack to a case of four. The Lidl product id *is* the article
   * number, so nothing is lost for pricing; what is lost is promotion linking,
   * and our snapshot carries no Lidl promotions to link.
   */
  it('resolves an article number for every AH and Jumbo product', () => {
    for (const chainId of ['ah', 'jumbo'] as const) {
      const products = catalogue.products.filter((p) => p.chainId === chainId);
      const resolved = products.filter((p) => catalogue.retailerIdByProduct.has(p.id));
      expect(resolved.length, chainId).toBe(products.length);
    }
  });

  it('keeps the Lidl article number in the product id itself', () => {
    const lidl = catalogue.products.filter((p) => p.chainId === 'lidl');
    expect(lidl.length).toBeGreaterThan(0);
    for (const product of lidl) {
      expect(product.id.slice('lidl:'.length)).toMatch(/^\S+$/);
    }
  });

  it('serves only the chains a query asks for', async () => {
    const provider = new RealDataProvider();
    const onlyLidl = await provider.searchProducts({ chainIds: ['lidl'] });
    expect(onlyLidl.length).toBeGreaterThan(0);
    expect(new Set(onlyLidl.map((p) => p.chainId))).toEqual(new Set(['lidl']));
  });

  it('works with no promotions at all', async () => {
    const provider = new RealDataProvider();
    await expect(
      provider.getPromotions({ onDate: '2026-09-15', chainIds: ['ah'] }),
    ).resolves.toEqual([]);
  });
});
