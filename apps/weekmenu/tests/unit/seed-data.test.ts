import { describe, expect, it } from 'vitest';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { isPromotionActive } from '@/domain/pricing/promotions';
import { optimisePackaging } from '@/domain/packaging/optimise';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { SEED_CHAINS, SEED_LOCATIONS } from '@/data/seed/stores';
import { SEED_CATALOGUE, SEED_PROMOTIONS } from '@/data/seed/catalogue';
import { buildSeedProducts, buildSeedPromotions } from '@/data/seed/products';
import { storeCandidates, TEST_DATE } from '../support/fixtures';

const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);
const { products, prices } = buildSeedProducts();
const promotions = buildSeedPromotions(TEST_DATE);

describe('seed data integrity', () => {
  it('meets the demo dataset targets from the brief', () => {
    expect(SEED_INGREDIENTS.length).toBeGreaterThanOrEqual(80);
    expect(recipes.length).toBeGreaterThanOrEqual(40);
    expect(SEED_CHAINS.length).toBeGreaterThanOrEqual(4);
    expect(SEED_LOCATIONS.length).toBeGreaterThanOrEqual(4);
    expect(promotions.filter((p) => isPromotionActive(p, TEST_DATE)).length).toBeGreaterThanOrEqual(25);
  });

  it('has no duplicate ids anywhere', () => {
    const unique = <T>(items: readonly T[]) => new Set(items).size === items.length;
    expect(unique(SEED_INGREDIENTS.map((i) => i.id))).toBe(true);
    expect(unique(recipes.map((r) => r.id))).toBe(true);
    expect(unique(products.map((p) => p.id))).toBe(true);
    expect(unique(SEED_LOCATIONS.map((l) => l.id))).toBe(true);
    expect(unique(promotions.map((p) => p.id))).toBe(true);
  });

  it('normalises every recipe without a single unresolved ingredient', () => {
    // normaliseRecipes throws on an unknown id, so reaching here is the assertion.
    expect(recipes).toHaveLength(SEED_RECIPES.length);
    for (const recipe of recipes) {
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.nutritionPerServing.kcal).toBeGreaterThan(100);
      expect(recipe.steps.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('sells every purchasable ingredient somewhere', () => {
    const sold = new Set(products.map((p) => p.canonicalIngredientId));
    const missing = SEED_INGREDIENTS.filter((i) => !i.pantryStaple && !sold.has(i.id)).map(
      (i) => i.id,
    );
    expect(missing).toEqual([]);
  });

  it('prices every product', () => {
    const priced = new Set(prices.map((p) => p.productId));
    expect(products.filter((p) => !priced.has(p.id))).toHaveLength(0);
  });

  it('points every promotion at a product that exists', () => {
    const productIds = new Set(products.map((p) => p.id));
    for (const promotion of promotions) {
      expect(productIds.has(promotion.productId)).toBe(true);
    }
  });

  it('includes an expired and a future promotion so validity is exercised', () => {
    const active = promotions.filter((p) => isPromotionActive(p, TEST_DATE));
    expect(active.length).toBeLessThan(promotions.length);
    expect(SEED_PROMOTIONS.filter((p) => p.window === 'expired').length).toBeGreaterThan(0);
    expect(SEED_PROMOTIONS.filter((p) => p.window === 'future').length).toBeGreaterThan(0);
  });

  it('covers all four promotion types', () => {
    const types = new Set(SEED_PROMOTIONS.map((p) => p.type));
    expect([...types].sort()).toEqual(['FIXED_PRICE', 'N_FOR_X', 'ONE_PLUS_ONE', 'PERCENT_OFF']);
  });

  it('offers several pack sizes for the ingredients that matter', () => {
    const multiPack = SEED_CATALOGUE.filter((c) => c.packs.length > 1);
    expect(multiPack.length).toBeGreaterThanOrEqual(15);
    expect(SEED_CATALOGUE.find((c) => c.ingredientId === 'kipfilet')!.packs.length).toBe(4);
  });

  it('has at least one chain that does not stock everything', () => {
    expect(SEED_CATALOGUE.filter((c) => c.notAtChains && c.notAtChains.length > 0).length)
      .toBeGreaterThan(3);
  });
});

describe('seed data produces the scenarios the optimizer needs to be tested against', () => {
  const [lidl, jumbo, ah] = ['lidl-paterswoldseweg', 'jumbo-korreweg', 'ah-hoogkerk'].map(
    (id) => storeCandidates([id])[0]!,
  );

  const costAt = (store: typeof lidl, ingredientId: string, amount: number): number => {
    const result = optimisePackaging(ingredientId, amount, store!.offers);
    return result.status === 'OK' ? result.solution.totalCents : Number.POSITIVE_INFINITY;
  };

  it('makes one chain genuinely cheaper on produce and another on meat', () => {
    expect(costAt(lidl!, 'broccoli', 1000)).toBeLessThan(costAt(ah!, 'broccoli', 1000));
    expect(costAt(jumbo!, 'kipfilet', 1000)).toBeLessThan(costAt(lidl!, 'kipfilet', 1000));
  });

  it('has a promotion that is still not the cheapest option', () => {
    // AH runs a loud Bonus on 600 g chicken; Jumbo's 1 + 1 is quietly cheaper.
    const ahPromo = costAt(ah!, 'kipfilet', 1000);
    const jumboPromo = costAt(jumbo!, 'kipfilet', 1000);
    expect(ahPromo).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(jumboPromo).toBeLessThan(ahPromo);
  });

  it('has a case where a bigger pack is cheaper per kilo but worse in total', () => {
    const small = costAt(lidl!, 'witte-rijst', 300);
    const bulkOnly = optimisePackaging(
      'witte-rijst',
      300,
      lidl!.offers.filter((o) => o.packageAmount.amount >= 1000),
    );
    expect(bulkOnly.status).toBe('OK');
    if (bulkOnly.status === 'OK') expect(small).toBeLessThan(bulkOnly.solution.totalCents);
  });

  it('has a promotion where buying two packs costs the same as one', () => {
    const onePack = costAt(jumbo!, 'kipfilet', 500);
    const twoPacks = costAt(jumbo!, 'kipfilet', 1000);
    expect(twoPacks).toBe(onePack);
  });

  it('puts a store just outside the default ten kilometre radius', () => {
    const nearby = SEED_LOCATIONS.map((l) => l.id);
    expect(nearby).toContain('plus-zuidhorn');
    // Verified through the locator in the store-service tests; here we only
    // assert the fixture exists so that radius handling has something to find.
    expect(SEED_LOCATIONS.filter((l) => l.chainId === 'plus').length).toBeGreaterThan(1);
  });
});
