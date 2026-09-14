import { describe, expect, it } from 'vitest';
import { scoreReviewItem } from '@/domain/ingestion/review-priority';

/**
 * The queue's job is to be short, not complete. These tests pin the judgements
 * that make it short: popularity is not the same as usefulness, and an
 * ingredient that already has enough good products is finished no matter how
 * many recipes use it.
 */
const ctx = (over: Partial<Parameters<typeof scoreReviewItem>[0]> = {}) => ({
  ingredientId: 'x',
  recipeCount: 5,
  approvedCount: 0,
  packageSizeCount: 0,
  ...over,
});

describe('what deserves a human decision', () => {
  it('puts an uncovered, widely used ingredient at the top', () => {
    const busy = scoreReviewItem(ctx({ recipeCount: 11, approvedCount: 0 }), { usable: true });
    const rare = scoreReviewItem(ctx({ recipeCount: 1, approvedCount: 0 }), { usable: true });
    expect(busy.band).toBe('HIGH');
    expect(busy.score).toBeGreaterThan(rare.score);
  });

  it('stops asking about an ingredient that already has enough options', () => {
    // Garlic is in 31 recipes and has four usable products in several sizes.
    // A fifth changes nothing, and popularity must not override that.
    const covered = scoreReviewItem(
      ctx({ recipeCount: 31, approvedCount: 4, packageSizeCount: 3 }),
      { usable: true },
    );
    expect(covered.band).toBe('OPTIONAL');
    expect(covered.sufficientlyCovered).toBe(true);
  });

  it('separates "already done" from "nobody cooks with it"', () => {
    const done = scoreReviewItem(ctx({ recipeCount: 9, approvedCount: 5, packageSizeCount: 3 }), {
      usable: true,
    });
    const unused = scoreReviewItem(ctx({ recipeCount: 0 }), { usable: true });
    expect(done.band).toBe('OPTIONAL');
    expect(unused.band).toBe('IRRELEVANT');
  });

  it('deprioritises a product approval that could not help anyway', () => {
    // No price or no readable package means the product cannot reach the
    // optimizer even once approved, so the decision buys nothing.
    const usable = scoreReviewItem(ctx({ recipeCount: 8 }), { usable: true });
    const unusable = scoreReviewItem(ctx({ recipeCount: 8 }), { usable: false });
    expect(unusable.score).toBeLessThan(usable.score);
  });

  it('explains itself in one line', () => {
    const result = scoreReviewItem(ctx({ recipeCount: 9, approvedCount: 0 }), { usable: true });
    expect(result.reason).toContain('9 recepten');
    expect(result.reason).toContain('nog geen enkel bruikbaar product');
  });

  it('one alternative is not enough alternatives', () => {
    const single = scoreReviewItem(ctx({ recipeCount: 6, approvedCount: 1, packageSizeCount: 1 }), {
      usable: true,
    });
    expect(single.sufficientlyCovered).toBe(false);
    expect(single.band).not.toBe('OPTIONAL');
  });
});
