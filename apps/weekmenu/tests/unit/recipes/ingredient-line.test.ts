import { describe, expect, it } from 'vitest';
import { cleanName, parseAmount, parseIngredientLine } from '@/services/recipes/ingredient-line';

/**
 * Every line here is a real shape from one of the corpora.
 *
 * The parenthetical case is the expensive one: "1 (3½–4-lb.) whole chicken" is
 * one chicken, and a parser that reads the 3½ orders three and a half of them.
 * The same family of mistake — a number that means something other than how
 * many to buy — already cost this project € 146,94 of peppers once.
 */
describe('parseAmount', () => {
  it('reads plain, decimal, fraction, vulgar and mixed numbers', () => {
    expect(parseAmount('2')).toBe(2);
    expect(parseAmount('1.5')).toBe(1.5);
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount('1/2')).toBe(0.5);
    expect(parseAmount('½')).toBe(0.5);
    expect(parseAmount('2¾')).toBe(2.75);
    expect(parseAmount('1 1/2')).toBe(1.5);
  });

  it('returns nothing rather than zero for text without a number', () => {
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('a pinch')).toBeUndefined();
    expect(parseAmount('0')).toBeUndefined();
  });
});

describe('parseIngredientLine', () => {
  it('reads quantity, unit and name from an ordinary line', () => {
    expect(parseIngredientLine('2 Tbsp. finely chopped sage')).toMatchObject({
      quantity: 2,
      unit: 'tbsp',
      rawName: 'sage',
    });
  });

  it('does not mistake a parenthetical size for the amount', () => {
    const parsed = parseIngredientLine('1 (3½–4-lb.) whole chicken');
    expect(parsed.quantity).toBe(1);
    expect(parsed.rawName).toBe('chicken');
  });

  it('takes the lower bound of a range, because the excess is money spent', () => {
    expect(parseIngredientLine('2-3 onions').quantity).toBe(2);
    expect(parseIngredientLine('4–6 potatoes').quantity).toBe(4);
  });

  it('keeps the preparation separate from the identity', () => {
    const parsed = parseIngredientLine('2¾ tsp. kosher salt, divided');
    expect(parsed.quantity).toBe(2.75);
    expect(parsed.unit).toBe('tsp');
    expect(parsed.rawName).toBe('kosher salt');
    expect(parsed.preparation).toBe('divided');
  });

  it('accepts a line with no amount at all', () => {
    const parsed = parseIngredientLine('Kosher salt, freshly ground pepper');
    expect(parsed.quantity).toBeUndefined();
    expect(parsed.unit).toBeUndefined();
    expect(parsed.rawText).toBe('Kosher salt, freshly ground pepper');
  });

  it('always keeps the original line, whatever it did with it', () => {
    for (const line of ['2 Tbsp. sage', 'Kosher salt', '1 (3½-lb.) chicken', '½ small red onion']) {
      expect(parseIngredientLine(line).rawText).toBe(line);
    }
  });

  /**
   * Regression. The first census run produced "l water" and "g sugar" as
   * missing canonical ingredients, because the amount parser ate the digits of
   * "1 2 liters water" and left a unit word at the head of the name.
   */
  it('strips a unit word that survived the amount, so no "g sugar" concept appears', () => {
    expect(parseIngredientLine('500 g sugar').rawName).toBe('sugar');
    expect(parseIngredientLine('1 2 liters water').rawName).toBe('water');
    expect(parseIngredientLine('2 cups of milk').rawName).toBe('milk');
  });
});

describe('cleanName', () => {
  it('removes handling words and keeps the food', () => {
    expect(cleanName('finely chopped fresh flat-leaf parsley')).toBe('flat-leaf parsley');
    expect(cleanName('Large Free-Range Eggs')).toBe('free-range eggs');
  });

  it('is lowercase and punctuation-free, so lookups are a table hit', () => {
    expect(cleanName('Tomatoes, San Marzano!')).toBe('tomatoes san marzano');
  });
});
