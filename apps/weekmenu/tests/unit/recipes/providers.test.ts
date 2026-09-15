import { describe, expect, it } from 'vitest';
import { estimateServings, parseDuration } from '@/services/recipes/providers/forkrecipe';
import { parseOraIngredient } from '@/services/recipes/providers/open-recipe-archive';

/**
 * The two adapter-level rules worth pinning.
 *
 * ForkRecipe states absolute weights and no serving count, so servings are
 * *inferred*; the Open Recipe Archive states neither amounts nor servings for
 * much of its corpus, so nothing is inferred at all. Both behaviours are easy
 * to "improve" into a default, and a default here is a number nobody wrote
 * that ends up on a shopping list.
 */
describe('parseDuration', () => {
  it('reads the shapes the corpus actually uses', () => {
    expect(parseDuration('25 min')).toBe(25);
    expect(parseDuration('45 mins')).toBe(45);
    expect(parseDuration('1 hr 30 min')).toBe(90);
    expect(parseDuration('2 hours')).toBe(120);
  });

  it('returns nothing for text with no duration in it', () => {
    expect(parseDuration(undefined)).toBeUndefined();
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('overnight')).toBeUndefined();
  });
});

describe('estimateServings', () => {
  it('estimates from total mass, at roughly 400 g per adult', () => {
    expect(estimateServings(1600)).toBe(4);
    expect(estimateServings(800)).toBe(2);
  });

  it('refuses a batch that is not a family dinner', () => {
    // A component (150 g of sauce) or a banquet (6 kg) is neither.
    expect(estimateServings(150)).toBeUndefined();
    expect(estimateServings(6000)).toBeUndefined();
    expect(estimateServings(0)).toBeUndefined();
  });
});

describe('parseOraIngredient', () => {
  it('reads a leading word number the way 1874 wrote it', () => {
    expect(parseOraIngredient('- one water squash')).toMatchObject({
      quantity: 1,
      rawName: 'water squash',
    });
    expect(parseOraIngredient('- two pounds of beef')).toMatchObject({
      quantity: 2,
      unit: 'pounds',
      rawName: 'beef',
    });
  });

  it('records no quantity when the line states none', () => {
    const parsed = parseOraIngredient('- milk');
    expect(parsed.quantity).toBeUndefined();
    expect(parsed.unit).toBeUndefined();
    expect(parsed.rawText).toBe('milk');
  });

  it('keeps a package-dependent unit as written instead of resolving it', () => {
    expect(parseOraIngredient('- one spoonful of wheat flour')).toMatchObject({
      quantity: 1,
      unit: 'spoonful',
      rawName: 'wheat flour',
    });
  });

  it('always keeps the original line', () => {
    for (const line of ['- milk', '* salt', '- one water squash']) {
      expect(parseOraIngredient(line).rawText).toBe(line.replace(/^[-*]\s*/, ''));
    }
  });
});
