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

  it('serves real promotions for the chains that were asked for', async () => {
    const provider = new RealDataProvider();
    const ah = await provider.getPromotions({ onDate: '2026-09-16', chainIds: ['ah'] });
    expect(ah.length).toBeGreaterThan(0);
    for (const promotion of ah) {
      expect(promotion.scope).toEqual({ kind: 'chain', chainId: 'ah' });
      expect(promotion.source).toBe('folder');
    }
    // Asking for one chain never leaks another's folder.
    const jumbo = await provider.getPromotions({ onDate: '2026-09-16', chainIds: ['jumbo'] });
    expect(jumbo.every((p) => p.scope.kind === 'chain' && p.scope.chainId === 'jumbo')).toBe(true);
  });
});

/**
 * Provenance, end to end: what a shopping-list line can say about itself.
 *
 * The rule is that the running app knows at least as much as the measurement
 * harness does. Richer provenance in a test than in production would mean the
 * thing we audit is not the thing that ships.
 */
describeSnapshot('a real offer carries its own history', () => {
  it('names the retailer, the article, the price source and when it was seen', async () => {
    process.env.DATA_MODE = 'REAL';
    const { buildStoreCandidates } = await import('@/services/store-service');
    const { SEED_LOCATIONS } = await import('@/data/seed/stores');
    const locationIds = ['ah', 'jumbo', 'lidl'].map(
      (chainId) => SEED_LOCATIONS.find((l) => l.chainId === chainId)!.id,
    );
    const { candidates } = await buildStoreCandidates({ locationIds, onDate: '2026-09-16' });
    expect(candidates.length).toBe(3);

    for (const candidate of candidates) {
      expect(candidate.offers.length, candidate.chain.id).toBeGreaterThan(0);
      for (const offer of candidate.offers) {
        expect(offer.chainId).toBe(candidate.chain.id);
        // The article number is the second half of the id, and it is real.
        expect(offer.productId.startsWith(`${candidate.chain.id}:`)).toBe(true);
        expect(offer.name.trim()).not.toBe('');
        expect(offer.packageAmount.amount).toBeGreaterThan(0);
        expect(offer.unitPriceCents).toBeGreaterThan(0);
        expect(offer.priceSource).toBe('prijs-snapshot');
        expect(offer.priceObservedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    }
  }, 120_000);

  it('records the folder behind every promotion it applies', async () => {
    process.env.DATA_MODE = 'REAL';
    const { buildStoreCandidates } = await import('@/services/store-service');
    const { SEED_LOCATIONS } = await import('@/data/seed/stores');
    const locationIds = ['ah', 'jumbo'].map(
      (chainId) => SEED_LOCATIONS.find((l) => l.chainId === chainId)!.id,
    );
    const { candidates } = await buildStoreCandidates({ locationIds, onDate: '2026-09-16' });
    const promoted = candidates.flatMap((c) => c.offers.filter((o) => o.promotion));
    expect(promoted.length).toBeGreaterThan(0);
    for (const offer of promoted) {
      const promotion = offer.promotion!;
      expect(promotion.source).toBe('folder');
      expect(promotion.id).toMatch(/:/);
      expect(promotion.validFrom <= '2026-09-16').toBe(true);
      expect(promotion.validUntil >= '2026-09-16').toBe(true);
      expect(promotion.label.trim()).not.toBe('');
    }
  }, 120_000);
});

/**
 * A retail form no recipe asked for is not an offer.
 *
 * The audit found pre-cut potato wedges bought for plain potato and mini new
 * potatoes bought for a stamppot — both real potatoes, both at a
 * pre-preparation price, and neither what the recipe meant. The taxonomy
 * already said so; this is the gate that enforces it in the catalogue.
 */
describeSnapshot('retail forms', () => {
  it('admits no product whose variant carries a form a recipe has to opt into', async () => {
    const { SEED_INGREDIENT_VARIANTS } = await import('@/data/seed/ingredient-taxonomy');
    const { DEFAULT_ACCEPTED_FORMS } = await import('@/domain/ingredients/taxonomy');
    const gated = SEED_INGREDIENT_VARIANTS.filter(
      (v) => v.form && !DEFAULT_ACCEPTED_FORMS.includes(v.form),
    );
    expect(gated.length).toBeGreaterThan(0);

    const catalogue = buildRealCatalogue();
    const names = catalogue.products.map((p) => p.productName.toLowerCase());
    for (const variant of gated) {
      const needle = variant.name.toLowerCase();
      expect(
        names.some((n) => n.includes(needle)),
        `${variant.name} hoort geweerd te zijn`,
      ).toBe(false);
    }
  });

  it('never offers a pack of a fraction of a piece', () => {
    const catalogue = buildRealCatalogue();
    for (const product of catalogue.products) {
      if (product.packageAmount.unit !== 'piece') continue;
      expect(Number.isInteger(product.packageAmount.amount), product.productName).toBe(true);
    }
  });
});
