import type { BaseUnit } from '../units';

/**
 * Turn a supermarket's size label into an amount the optimizer can buy.
 *
 * This is the single most load-bearing piece of the ingestion layer. The
 * packaging optimizer decides how many packs to buy and what that costs; if a
 * pack size is wrong, every number downstream is wrong while looking perfectly
 * reasonable. So this parser refuses far more than it guesses.
 *
 * Every pattern here was taken from the real dataset rather than imagined —
 * see CHECKJEBON_VALIDATION.md for the measured distribution. The awkward ones
 * are the ones that matter:
 *
 *   "500 g"          the easy case, and the most common
 *   "0,75 l"         Dutch decimal comma
 *   "1.5 l"          and the same feed also uses a decimal point
 *   "4 x 250 ml"     a multipack: four units, one thousand millilitres
 *   "per 145 g"      PLUS writes every label this way, and means a 145 g bag
 *   "33 cl"          centilitres still exist on drinks
 *   "ca. 500 g"      approximate weight — a real amount, but not an exact one
 *   "per stuk"       no amount at all
 *   "per kilo"       a price per kilo, NOT a pack of one kilo
 *   "205 wasbeurten" a unit the food domain has no meaning for
 *
 * The last three are why this returns a reason rather than a number: a parser
 * that quietly turns "per kilo" into "1000 g" would have the optimizer buy one
 * kilo of detergent at the per-kilo price and be confidently wrong.
 */

export type PackageParseFailure =
  /** Nothing to parse: the source left the field empty. */
  | 'EMPTY'
  /** A price per unit of measure, not a package. "per kilo", "per 100 g" on meat. */
  | 'PRICE_PER_MEASURE'
  /** A countable pack with no stated content: "per stuk", "per pakket". */
  | 'NO_AMOUNT'
  /** A unit that means nothing for food: wash loads, sheets, metres. */
  | 'NON_FOOD_UNIT'
  /** Recognisably a size, but in a shape this parser does not handle. */
  | 'UNRECOGNISED';

export interface PackageInfo {
  /** How many sub-packs the article contains. 1 for a plain pack. */
  readonly packageCount: number;
  /** Content of one sub-pack, in `baseUnit`. */
  readonly amountPerPackage: number;
  readonly baseUnit: BaseUnit;
  /** `packageCount × amountPerPackage` — what the optimizer actually buys. */
  readonly totalAmount: number;
  /**
   * The source said "about" this much: fresh meat and cheese sold by weight.
   * The amount is usable; the exactness is not guaranteed, and a caller that
   * cares (a strict shopping list, say) can see that here.
   */
  readonly approximate: boolean;
  /** The label this came from, kept verbatim for traceability. */
  readonly raw: string;
}

export type PackageParseResult =
  | { readonly status: 'OK'; readonly info: PackageInfo }
  | { readonly status: 'FAILED'; readonly reason: PackageParseFailure; readonly raw: string };

/** Multipliers into the three base units the domain understands. */
const UNIT_FACTORS: Readonly<Record<string, { factor: number; unit: BaseUnit }>> = {
  g: { factor: 1, unit: 'g' },
  gr: { factor: 1, unit: 'g' },
  gram: { factor: 1, unit: 'g' },
  grams: { factor: 1, unit: 'g' },
  grm: { factor: 1, unit: 'g' },
  kg: { factor: 1000, unit: 'g' },
  kilo: { factor: 1000, unit: 'g' },
  kilogram: { factor: 1000, unit: 'g' },
  mg: { factor: 0.001, unit: 'g' },
  ml: { factor: 1, unit: 'ml' },
  milliliter: { factor: 1, unit: 'ml' },
  milliliters: { factor: 1, unit: 'ml' },
  // Yes, with one 'l'. The feed contains both spellings.
  mililiter: { factor: 1, unit: 'ml' },
  mililiters: { factor: 1, unit: 'ml' },
  cl: { factor: 10, unit: 'ml' },
  centiliter: { factor: 10, unit: 'ml' },
  centiliters: { factor: 10, unit: 'ml' },
  dl: { factor: 100, unit: 'ml' },
  l: { factor: 1000, unit: 'ml' },
  lt: { factor: 1000, unit: 'ml' },
  liter: { factor: 1000, unit: 'ml' },
  litre: { factor: 1000, unit: 'ml' },
  st: { factor: 1, unit: 'piece' },
  stuk: { factor: 1, unit: 'piece' },
  stuks: { factor: 1, unit: 'piece' },
  stk: { factor: 1, unit: 'piece' },
  x: { factor: 1, unit: 'piece' },
};

/**
 * Units that are perfectly valid on a label and meaningless to a meal planner.
 * Recognised explicitly so they fail as "not food" rather than as "unparseable",
 * which keeps the data-quality report honest about what it is rejecting.
 */
const NON_FOOD_UNITS = new Set([
  'wasbeurten',
  'wasbeurt',
  'stuks/wasbeurten',
  'm',
  'meter',
  'cm',
  'rollen',
  'rol',
  'vellen',
  'tabletten',
  'capsules',
  'doekjes',
  'zakjes',
  'strips',
  'sachets',
]);

export function parsePackage(raw: string | undefined | null): PackageParseResult {
  const original = (raw ?? '').trim();
  if (original === '') return { status: 'FAILED', reason: 'EMPTY', raw: original };

  let text = original.toLowerCase().replace(/\s+/g, ' ').trim();

  // Some labels carry a marketing suffix after a bullet: "6 x 750 ml • Met doos".
  // The part before the bullet is the size; the rest is packaging blurb.
  const bullet = text.indexOf('•');
  if (bullet > 0) text = text.slice(0, bullet).trim();

  // "1 kg (ca. 5 stuks)" — the parenthetical is a helpful aside, not the size.
  text = text.replace(/\s*\([^)]*\)\s*$/, '').trim();

  // PLUS writes every label as "Per 350 g", and it means a 350 gram bag — the
  // product links confirm it ("...-zakje-350-g-675541"), so the prefix carries
  // no meaning when a number follows. It does when one does not: "per kilo" is
  // a price per kilo and says nothing about what a pack contains. Stripping the
  // word here and handling the bare-unit case below keeps those apart.
  text = text.replace(/^per\s+/, '').trim();

  // "ca. 500 g" — a real weight, sold by approximate weight.
  let approximate = false;
  if (/^(ca\.?|ongeveer|circa|±|~)\s*/.test(text)) {
    approximate = true;
    text = text.replace(/^(ca\.?|ongeveer|circa|±|~)\s*/, '').trim();
  }

  // A bare unit with no number. "per stuk" is a pack of one; "per kilo" is a
  // price per kilo and tells us nothing about what a pack contains.
  const bare = UNIT_FACTORS[text];
  if (bare) {
    if (bare.unit === 'piece') {
      return {
        status: 'OK',
        info: {
          packageCount: 1,
          amountPerPackage: 1,
          baseUnit: 'piece',
          totalAmount: 1,
          approximate,
          raw: original,
        },
      };
    }
    return { status: 'FAILED', reason: 'PRICE_PER_MEASURE', raw: original };
  }
  if (NON_FOOD_UNITS.has(text)) {
    return { status: 'FAILED', reason: 'NON_FOOD_UNIT', raw: original };
  }
  if (/^(pakket|verpakking|bundel|set)$/.test(text)) {
    return { status: 'FAILED', reason: 'NO_AMOUNT', raw: original };
  }

  // "4 x 250 ml", "6 x 1,5 l", "2 x 125 g"
  const multipack = /^(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*([a-z]+)\.?$/.exec(text);
  if (multipack) {
    const count = Number(multipack[1]);
    const amount = toNumber(multipack[2]!);
    const unit = UNIT_FACTORS[multipack[3]!];
    if (!unit) {
      return {
        status: 'FAILED',
        reason: NON_FOOD_UNITS.has(multipack[3]!) ? 'NON_FOOD_UNIT' : 'UNRECOGNISED',
        raw: original,
      };
    }
    if (count <= 0 || amount <= 0)
      return { status: 'FAILED', reason: 'UNRECOGNISED', raw: original };
    const per = amount * unit.factor;
    return {
      status: 'OK',
      info: {
        packageCount: count,
        amountPerPackage: per,
        baseUnit: unit.unit,
        totalAmount: count * per,
        approximate,
        raw: original,
      },
    };
  }

  // "500 g", "0,75 l", "1.5 kg", "6 stuks"
  const single = /^(\d+(?:[.,]\d+)?)\s*([a-z]+)\.?$/.exec(text);
  if (single) {
    const amount = toNumber(single[1]!);
    const token = single[2]!;
    const unit = UNIT_FACTORS[token];
    if (!unit) {
      return {
        status: 'FAILED',
        reason: NON_FOOD_UNITS.has(token) ? 'NON_FOOD_UNIT' : 'UNRECOGNISED',
        raw: original,
      };
    }
    if (amount <= 0) return { status: 'FAILED', reason: 'UNRECOGNISED', raw: original };

    return {
      status: 'OK',
      info: {
        packageCount: 1,
        amountPerPackage: amount * unit.factor,
        baseUnit: unit.unit,
        totalAmount: amount * unit.factor,
        approximate,
        raw: original,
      },
    };
  }

  return { status: 'FAILED', reason: 'UNRECOGNISED', raw: original };
}

/** Dutch labels use both "0,75" and "1.5"; the same feed contains both. */
function toNumber(value: string): number {
  return Number(value.replace(',', '.'));
}
