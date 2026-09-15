import type { CandidateIngredient } from './candidate-types';
import { canonicalUnit, PARSEABLE_UNITS } from './units';

/**
 * "2 Tbsp. finely chopped sage" → quantity 2, unit tbsp, name sage.
 *
 * One parser for the free-text corpora. It is deliberately conservative: where
 * it is unsure it returns fewer fields rather than wrong ones, because a
 * quantity guessed here becomes a quantity in a shopping list later.
 *
 * The shapes it handles are the ones real corpora contain:
 *
 *   2 Tbsp. finely chopped sage
 *   1 (3½–4-lb.) whole chicken            → parenthetical is not the amount
 *   2¾ tsp. kosher salt, divided          → vulgar fractions, trailing note
 *   ½ small red onion, thinly sliced
 *   1 1/2 cups milk                       → mixed number
 *   Kosher salt, freshly ground pepper    → no amount at all, and that is fine
 */

/** Unicode vulgar fractions, because recipe corpora are full of them. */
const VULGAR: Readonly<Record<string, number>> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅐': 1 / 7,
  '⅑': 1 / 9,
  '⅒': 0.1,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

const UNIT_PATTERN = PARSEABLE_UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length)
  .join('|');

/** "1", "1.5", "1/2", "½", "1½", "1 1/2" → a number. */
export function parseAmount(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;

  /*
   * A bare fraction, before anything else. "1/2 cup sugar" is half a cup, and
   * the mixed-number path below would read the 1 as the whole amount and
   * silently double it — the same failure mode as the parenthetical, and just
   * as invisible once it is on a shopping list.
   */
  const bareFraction = /^(\d+)\s*\/\s*(\d+)/.exec(trimmed);
  if (bareFraction) {
    const value = Number(bareFraction[1]) / Number(bareFraction[2]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  let total = 0;
  let matched = false;
  // A leading whole number, possibly followed by a fraction.
  const mixed = /^(\d+(?:[.,]\d+)?)\s*(?:([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])|(\d+)\/(\d+))?/.exec(trimmed);
  if (mixed) {
    total += Number(mixed[1]!.replace(',', '.'));
    if (mixed[2]) total += VULGAR[mixed[2]] ?? 0;
    else if (mixed[3] && mixed[4]) total += Number(mixed[3]) / Number(mixed[4]);
    matched = true;
  } else {
    const vulgar = /^([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/.exec(trimmed);
    if (vulgar) {
      total += VULGAR[vulgar[1]!] ?? 0;
      matched = true;
    }
  }
  if (!matched || !Number.isFinite(total) || total <= 0) return undefined;
  return total;
}

export function parseIngredientLine(line: string): CandidateIngredient {
  const rawText = line.trim();

  /*
   * Parentheses are removed before anything else. In "1 (3½–4-lb.) whole
   * chicken" the amount is one chicken; the parenthetical describes how big a
   * chicken. Reading the 3½ as the quantity would order three and a half.
   */
  const withoutParens = rawText
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const amountMatch = /^([\d¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞][\d\s./,¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞-]*)/.exec(withoutParens);
  if (!amountMatch) {
    return { rawText, rawName: cleanName(withoutParens) };
  }

  // A range ("2-3 onions") takes the lower bound: buying too little is
  // recoverable at the table, buying too much is money spent.
  const amountText = amountMatch[1]!.split(/\s*[-–—]\s*/)[0]!;
  const quantity = parseAmount(amountText);
  if (quantity === undefined) {
    return { rawText, rawName: cleanName(withoutParens) };
  }

  const rest = withoutParens.slice(amountMatch[1]!.length).trim();
  const unitMatch = new RegExp(`^(${UNIT_PATTERN})\\b\\.?\\s*(?:of\\s+)?`, 'i').exec(rest);
  const unit = unitMatch ? canonicalUnit(unitMatch[1]) : undefined;
  const remainder = unitMatch ? rest.slice(unitMatch[0].length) : rest;

  /*
   * A second unit can survive the first pass: the archive writes "1 2 liters
   * water" and "500 g sugar", where the amount parser consumes the digits and
   * leaves "liters water" behind. Left alone those become concepts of their
   * own — the first run of the census produced "l water" and "g sugar" as
   * missing ingredients, which is how this was found.
   */
  const trailing = new RegExp(`^(?:${UNIT_PATTERN})\\b\\.?\\s+(?:of\\s+)?`, 'i').exec(remainder);
  const withoutUnit = trailing ? remainder.slice(trailing[0].length) : remainder;

  const [head, ...tail] = withoutUnit.split(',');
  const preparation = tail.join(',').trim();

  return {
    rawText,
    rawName: cleanName(head ?? ''),
    quantity,
    ...(unit ? { unit } : {}),
    ...(preparation ? { preparation } : {}),
  };
}

/** Strip the adjectives that describe handling rather than identity. */
const NOISE =
  /\b(finely|freshly|coarsely|thinly|roughly|lightly|well|very|about|approximately|plus more|divided|to taste|optional|room temperature|melted|softened|chopped|minced|sliced|diced|grated|crushed|peeled|trimmed|drained|rinsed|cooked|uncooked|raw|fresh|frozen|dried|ground|whole|large|small|medium|extra)\b/gi;

export function cleanName(text: string): string {
  return text
    .replace(NOISE, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
