import { describe, expect, it } from 'vitest';
import { buildIngredientPhrases, matchProduct } from '@/domain/ingestion/match-ingredient';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import { SEED_INGREDIENT_VARIANTS } from '@/data/seed/ingredient-taxonomy';
import { TAXONOMY_GOLDEN } from '../../support/taxonomy-golden';

/**
 * The matcher, on the concepts this phase added.
 *
 * A wrong AUTO_APPROVED is the only matching error with no symptom: it never
 * reaches the review queue, so nobody looks at it, and the shopping list is
 * simply wrong. That is why the bar is precision rather than recall, and why
 * the whole verified corpus is pinned rather than a sample of it.
 */
const phrases = buildIngredientPhrases(
  SEED_INGREDIENTS,
  SEED_INGREDIENT_ALIASES,
  SEED_INGREDIENT_VARIANTS,
);

describe('the verified corpus', () => {
  it('still matches every row to the same ingredient, without a human', () => {
    const wrong: string[] = [];
    for (const row of TAXONOMY_GOLDEN) {
      const match = matchProduct(
        { productId: `${row.chainId}:${row.productName}`, productName: row.productName },
        phrases,
      );
      if (!match || match.status !== 'AUTO_APPROVED') {
        wrong.push(`${row.productName} → ${match?.status ?? 'GEEN MATCH'}`);
        continue;
      }
      if (match.canonicalIngredientId !== row.ingredientId) {
        wrong.push(
          `${row.productName} → ${match.canonicalIngredientId}, verwacht ${row.ingredientId}`,
        );
      }
      if ((match.variantId ?? undefined) !== row.variantId) {
        wrong.push(
          `${row.productName} → variant ${match.variantId ?? '-'}, verwacht ${row.variantId ?? '-'}`,
        );
      }
    }
    expect(wrong).toEqual([]);
    expect(TAXONOMY_GOLDEN.length).toBeGreaterThanOrEqual(81);
  });

  it('carries the variant through, so compatibility can decide afterwards', () => {
    const shapes = TAXONOMY_GOLDEN.filter((r) => r.ingredientId === 'pasta');
    expect(shapes.length).toBeGreaterThan(20);
    expect(shapes.every((r) => r.variantId !== undefined)).toBe(true);
  });
});

describe('the shelf names an ingredient never carries', () => {
  it.each([
    ['Grand Italia Fusilli 500 g', 'pasta', 'fusilli'],
    ['Jumbo Pandanrijst 1 kg', 'rijst', 'pandanrijst'],
    ['AH Geitenkaas naturel 50+', 'geitenkaas', undefined],
    ['Jumbo Hummus Naturel 200 g', 'hummus', undefined],
    ['AH Groene pesto', 'pesto', undefined],
  ])('%s is %s', (name, ingredientId, variantId) => {
    const match = matchProduct({ productId: 'x', productName: name }, phrases);
    expect(match?.status).toBe('AUTO_APPROVED');
    expect(match?.canonicalIngredientId).toBe(ingredientId);
    expect(match?.variantId).toBe(variantId);
  });

  /**
   * The composites, from the other side: a jar of pesto must not be read as
   * basil, and hummus must not be read as chickpeas. Both would be plausible
   * and both would put the wrong food, at the wrong price, on a list.
   */
  it.each([
    ['AH Groene pesto', 'verse-basilicum'],
    ['Jumbo Hummus Naturel 200 g', 'kikkererwten'],
    ['Jumbo Pastasaus Traditioneel 510 g', 'tomaat'],
    ['AH Satésaus', 'pindakaas'],
  ])('%s is never matched to %s', (name, forbidden) => {
    const match = matchProduct({ productId: 'x', productName: name }, phrases);
    expect(match?.canonicalIngredientId).not.toBe(forbidden);
  });
});
