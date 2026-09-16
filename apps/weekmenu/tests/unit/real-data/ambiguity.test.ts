import { describe, expect, it } from 'vitest';
import { buildIngredientPhrases, matchProduct } from '@/domain/ingestion/match-ingredient';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import { SEED_INGREDIENT_VARIANTS } from '@/data/seed/ingredient-taxonomy';

/**
 * The two products the manual audit could not classify, decided.
 *
 * An ambiguity that stays open is an ambiguity that ships. Both of these were
 * genuinely arguable, so both are now answered in code with the reasoning
 * written down, and neither can drift back.
 */
const phrases = buildIngredientPhrases(
  SEED_INGREDIENTS,
  SEED_INGREDIENT_ALIASES,
  SEED_INGREDIENT_VARIANTS,
);
const match = (productName: string) => matchProduct({ productId: 'x', productName }, phrases);

describe('half-fat butter is not butter', () => {
  /**
   * Roughly 40 % fat against 80 %. A week counted on it is wrong about the
   * energy by a factor of two, and it behaves differently in a pan. Refused.
   */
  it.each([
    'AH Roomboter halfvol',
    'Jumbo Halfvolle Roomboter 250 g',
    'AH Roomboter light',
    'Becel Margarine kuipje',
  ])('refuses %s for plain butter', (name) => {
    const result = match(name);
    expect(result?.status).not.toBe('AUTO_APPROVED');
  });

  it('still accepts ordinary butter, salted or not', () => {
    for (const name of ['AH Roomboter ongezouten', 'Jumbo Roomboter Gezouten 250 g']) {
      const result = match(name);
      expect(result?.canonicalIngredientId, name).toBe('roomboter');
      expect(result?.status, name).toBe('AUTO_APPROVED');
    }
  });

  /** The word is only dangerous on butter; milk is sold half-fat by default. */
  it('leaves half-fat milk alone', () => {
    const result = match('AH Houdbare halfvolle melk');
    expect(result?.canonicalIngredientId).toBe('melk');
    expect(result?.status).toBe('AUTO_APPROVED');
  });
});

describe('pre-cut peppers are peppers', () => {
  /**
   * Pepper and nothing else: no sauce, no seasoning, a stated weight that means
   * what it says. More expensive per kilo, which is the shopper's trade-off and
   * not a correctness problem.
   */
  it('accepts them deliberately', () => {
    const result = match('Jumbo Paprika Reepjes 450 g');
    expect(result?.canonicalIngredientId).toBe('paprika-rood');
    expect(result?.status).toBe('AUTO_APPROVED');
  });

  it('still refuses a pepper that has become a dish', () => {
    for (const name of ['AH Gevulde paprika met rijst', 'Jumbo Paprika roomsaus 300 g']) {
      expect(match(name)?.status, name).not.toBe('AUTO_APPROVED');
    }
  });
});
