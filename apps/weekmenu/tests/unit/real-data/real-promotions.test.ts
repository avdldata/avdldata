import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { loadRealPromotions } from '@/providers/real-promotions';
import { buildRealCatalogue } from '@/providers/real-data-provider';

/**
 * Real promotions, and the two things that must hold whatever the folder says:
 * a promotion never attaches to a product it cannot prove it belongs to, and a
 * missing folder never stops a week from being planned.
 */
const available = existsSync('data/external/checkjebon-snapshot.json');
const describeSnapshot = available ? describe : describe.skip;

describe('a missing or unreadable folder', () => {
  it('yields no promotions and a reason, rather than an exception', () => {
    const result = loadRealPromotions({
      onDate: '2026-09-16',
      retailerIdByProduct: new Map(),
      path: 'data/external/bestaat-niet.json',
    });
    expect(result.promotions).toEqual([]);
    expect(result.unavailableReason).toMatch(/geen aanbiedingenmomentopname/);
  });

  it('never substitutes a demo promotion for a missing real one', () => {
    const result = loadRealPromotions({
      onDate: '2026-09-16',
      retailerIdByProduct: new Map(),
      path: 'data/external/bestaat-niet.json',
    });
    expect(result.promotions).toHaveLength(0);
  });
});

describeSnapshot('real promotions against the real catalogue', () => {
  const catalogue = buildRealCatalogue();
  const onDate = '2026-09-16';
  const result = loadRealPromotions({ onDate, retailerIdByProduct: catalogue.retailerIdByProduct });
  const productById = new Map(catalogue.products.map((p) => [p.id, p]));

  it('reads the folder at all', () => {
    expect(result.considered).toBeGreaterThan(1000);
    expect(result.unavailableReason).toBeUndefined();
  });

  /**
   * Without this, every assertion below would pass over an empty list and prove
   * nothing at all — which is exactly how a broken join hides.
   */
  it('actually links promotions, from both chains that can be linked', () => {
    expect(result.promotions.length).toBeGreaterThan(20);
    const chains = new Set(
      result.promotions.map((p) => p.productId.slice(0, p.productId.indexOf(':'))),
    );
    expect(chains).toContain('ah');
    expect(chains).toContain('jumbo');
  });

  it('reports what it could not use, instead of dropping it quietly', () => {
    expect(result.unsupported).toBeGreaterThan(0);
    expect(result.unlinked).toBeGreaterThan(0);
    expect(result.unsupported + result.unlinked).toBeLessThan(result.considered);
  });

  it('attaches every promotion to a product in our own catalogue', () => {
    for (const promotion of result.promotions) {
      expect(productById.has(promotion.productId), promotion.productId).toBe(true);
    }
  });

  it('never crosses chains', () => {
    for (const promotion of result.promotions) {
      const product = productById.get(promotion.productId)!;
      expect(promotion.scope).toEqual({ kind: 'chain', chainId: product.chainId });
    }
  });

  it('only applies promotions whose window contains the shopping date', () => {
    for (const promotion of result.promotions) {
      expect(promotion.validFrom <= onDate).toBe(true);
      expect(promotion.validUntil >= onDate).toBe(true);
    }
  });

  it('never applies two promotions to one product', () => {
    const ids = result.promotions.map((p) => p.productId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('demands at least two packs for a mechanic that needs two', () => {
    for (const promotion of result.promotions) {
      if (promotion.params.type === 'ONE_PLUS_ONE') expect(promotion.minUnits).toBe(2);
      if (promotion.params.type === 'N_FOR_X') {
        expect(promotion.minUnits).toBe(promotion.params.bundleSize);
      }
    }
  });

  it('carries its source, so a line can be traced back to the folder', () => {
    for (const promotion of result.promotions) {
      expect(promotion.source).toBe('folder');
      expect(promotion.id).toMatch(/:/);
    }
  });
});
