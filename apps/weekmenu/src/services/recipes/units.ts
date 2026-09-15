/**
 * Recipe units, converted only where the conversion is a fact.
 *
 * The whole planner runs on grams, millilitres and pieces, because that is what
 * a package holds and what a nutrition table describes. A recipe corpus does
 * not: it says "2 Tbsp", "1 cup", "1 can", "a bunch".
 *
 * The rule here is the same one that governs every other conversion in this
 * project. **A conversion happens when it is arithmetic, and does not happen
 * when it is a guess.**
 *
 *   arithmetic   1 kg = 1000 g. 1 lb = 453,59 g. 1 cup = 236,6 ml. These are
 *                definitions and they are exact regardless of what is measured.
 *
 *   a guess      1 cup of *flour* is about 120 g and 1 cup of *sugar* is about
 *                200 g. Turning a volume into a mass needs a density, so it is
 *                only done where the canonical ingredient states one.
 *
 *   worse        "1 can", "1 package", "1 bunch". These depend on a package
 *                size the recipe never states. No number is produced at all;
 *                the line keeps its original unit and the recipe is scored down
 *                for it. An earlier phase of this project learned what happens
 *                when grams are read as pieces — € 146,94 of peppers — and the
 *                lesson generalises.
 */
import type { BaseUnit } from '@/domain/units';

/** What a unit means once we recognise it. */
export type UnitKind = 'mass' | 'volume' | 'count' | 'unknown';

export interface NormalisedAmount {
  readonly kind: UnitKind;
  /** Grams for mass, millilitres for volume, items for count. */
  readonly value?: number;
  readonly baseUnit?: BaseUnit;
  /** The unit as written, always kept. */
  readonly originalUnit?: string;
  /**
   * Why no number came out. Present exactly when `value` is absent, so a caller
   * can report the reason instead of treating the line as zero.
   */
  readonly refusal?: 'NO_QUANTITY' | 'UNKNOWN_UNIT' | 'PACKAGE_DEPENDENT' | 'VOLUME_NEEDS_DENSITY';
}

/** Exact definitions. Nothing here depends on what is being measured. */
const MASS_TO_GRAM: Readonly<Record<string, number>> = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  gramme: 1,
  grammes: 1,
  kg: 1000,
  kilo: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
};

const VOLUME_TO_ML: Readonly<Record<string, number>> = {
  ml: 1,
  milliliter: 1,
  millilitre: 1,
  milliliters: 1,
  millilitres: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  liter: 1000,
  litre: 1000,
  liters: 1000,
  litres: 1000,
  // US measures, since two of the three corpora are American.
  tsp: 4.92892159375,
  teaspoon: 4.92892159375,
  teaspoons: 4.92892159375,
  teaspoonful: 4.92892159375,
  teaspoonfuls: 4.92892159375,
  tbsp: 14.78676478125,
  tbsps: 14.78676478125,
  tablespoon: 14.78676478125,
  tablespoons: 14.78676478125,
  tablespoonful: 14.78676478125,
  tablespoonfuls: 14.78676478125,
  cup: 236.5882365,
  cups: 236.5882365,
  cupful: 236.5882365,
  cupfuls: 236.5882365,
  pint: 473.176473,
  pints: 473.176473,
  quart: 946.352946,
  quarts: 946.352946,
  'fl oz': 29.5735295625,
  floz: 29.5735295625,
};

/** Words that count things rather than measure them. */
const COUNT_UNITS = new Set([
  'piece',
  'pieces',
  'stuk',
  'stuks',
  'clove',
  'cloves',
  'leaf',
  'leaves',
  'slice',
  'slices',
  'egg',
  'eggs',
  'sprig',
  'sprigs',
  'stalk',
  'stalks',
  'fillet',
  'fillets',
]);

/**
 * Units whose size lives on a package the recipe never names.
 *
 * Refused deliberately and by name, so the census can count them instead of
 * lumping them in with "unrecognised".
 */
const PACKAGE_UNITS = new Set([
  'can',
  'cans',
  'tin',
  'tins',
  'jar',
  'jars',
  'package',
  'packages',
  'packet',
  'packets',
  'pack',
  'packs',
  'bunch',
  'bunches',
  'head',
  'heads',
  'bag',
  'bags',
  'box',
  'boxes',
  'bottle',
  'bottles',
  'container',
  'containers',
  'block',
  'blocks',
  'sheet',
  'sheets',
  'pinch',
  'pinches',
  'dash',
  'handful',
  'handfuls',
  'spoonful',
  'spoonfuls',
  'gill',
  'gills',
  'dram',
  'drams',
]);

export function canonicalUnit(unit: string | undefined): string | undefined {
  if (!unit) return undefined;
  return unit.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

/**
 * A quantity and a unit, turned into something the planner can add up.
 *
 * `density` is the canonical ingredient's, in g/ml, and is the only thing that
 * licenses a volume-to-mass conversion. Without it a volume stays a volume.
 */
export function normaliseAmount(
  quantity: number | undefined,
  unit: string | undefined,
  density?: number,
): NormalisedAmount {
  const key = canonicalUnit(unit);
  if (quantity === undefined || !Number.isFinite(quantity) || quantity <= 0) {
    return { kind: 'unknown', ...(key ? { originalUnit: key } : {}), refusal: 'NO_QUANTITY' };
  }

  if (key === undefined || key === '') {
    // A bare number with no unit is a count: "2 onions", "4 eggs".
    return { kind: 'count', value: quantity, baseUnit: 'piece' };
  }
  if (key in MASS_TO_GRAM) {
    return { kind: 'mass', value: quantity * MASS_TO_GRAM[key]!, baseUnit: 'g', originalUnit: key };
  }
  if (key in VOLUME_TO_ML) {
    const ml = quantity * VOLUME_TO_ML[key]!;
    if (density !== undefined && density > 0) {
      return { kind: 'mass', value: ml * density, baseUnit: 'g', originalUnit: key };
    }
    return { kind: 'volume', value: ml, baseUnit: 'ml', originalUnit: key };
  }
  if (COUNT_UNITS.has(key)) {
    return { kind: 'count', value: quantity, baseUnit: 'piece', originalUnit: key };
  }
  if (PACKAGE_UNITS.has(key)) {
    return { kind: 'unknown', originalUnit: key, refusal: 'PACKAGE_DEPENDENT' };
  }
  return { kind: 'unknown', originalUnit: key, refusal: 'UNKNOWN_UNIT' };
}

/** Every unit spelling the normaliser turns into a number. For the census. */
export const KNOWN_UNITS: readonly string[] = [
  ...Object.keys(MASS_TO_GRAM),
  ...Object.keys(VOLUME_TO_ML),
  ...COUNT_UNITS,
];

/**
 * Every unit spelling a *parser* should recognise, refusals included.
 *
 * Wider than `KNOWN_UNITS` on purpose. A line parser that does not know the
 * word "can" leaves it attached to the food — "1 can chicken thighs" becomes
 * one piece of a thing called "can chicken thighs" — and the refusal that
 * should have happened never does. Knowing the word is what lets
 * `normaliseAmount` say `PACKAGE_DEPENDENT` out loud.
 */
export const PARSEABLE_UNITS: readonly string[] = [...KNOWN_UNITS, ...PACKAGE_UNITS];
