/**
 * Units.
 *
 * Everything downstream of the seed loader speaks exactly three base units:
 * grams, millilitres and pieces. Recipes and products may be *authored* in
 * friendlier units (kg, l, tbsp, tsp), but those are converted exactly once —
 * in `toBaseQuantity` — using the canonical ingredient's density and piece
 * weight. After that, no conversion logic exists anywhere in the system.
 */

export const BASE_UNITS = ['g', 'ml', 'piece'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const AUTHORING_UNITS = ['g', 'kg', 'ml', 'l', 'piece', 'tbsp', 'tsp'] as const;
export type AuthoringUnit = (typeof AUTHORING_UNITS)[number];

export interface Quantity {
  readonly amount: number;
  readonly unit: BaseUnit;
}

/** Volume of one tablespoon / teaspoon in millilitres (Dutch convention). */
export const ML_PER_TBSP = 15;
export const ML_PER_TSP = 5;

export interface UnitConversionContext {
  /** Grams per millilitre. Required to convert volume -> mass. */
  readonly density?: number | undefined;
  /** Average weight of one piece in grams. Required to convert pieces -> mass. */
  readonly pieceWeightGrams?: number | undefined;
  /** The base unit this ingredient is measured in throughout the system. */
  readonly baseUnit: BaseUnit;
}

export class UnitConversionError extends Error {
  constructor(
    message: string,
    readonly detail: { from: AuthoringUnit; to: BaseUnit },
  ) {
    super(message);
    this.name = 'UnitConversionError';
  }
}

export function quantity(amount: number, unit: BaseUnit): Quantity {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Quantity amount must be finite, received ${amount}`);
  }
  if (amount < 0) {
    throw new RangeError(`Quantity amount must not be negative, received ${amount}`);
  }
  return { amount, unit };
}

export function zeroQuantity(unit: BaseUnit): Quantity {
  return { amount: 0, unit };
}

/** Convert an authored amount into the ingredient's base unit. */
export function toBaseQuantity(
  amount: number,
  unit: AuthoringUnit,
  context: UnitConversionContext,
): Quantity {
  const { baseUnit, density, pieceWeightGrams } = context;
  const millilitres = toMillilitres(amount, unit);

  if (baseUnit === 'piece') {
    if (unit === 'piece') return quantity(amount, 'piece');
    if (pieceWeightGrams && unit !== 'ml' && unit !== 'l') {
      const grams = unit === 'kg' ? amount * 1000 : amount;
      return quantity(grams / pieceWeightGrams, 'piece');
    }
    throw new UnitConversionError(
      `Cannot express ${amount} ${unit} in pieces without a piece weight`,
      { from: unit, to: baseUnit },
    );
  }

  if (baseUnit === 'ml') {
    if (millilitres !== undefined) return quantity(millilitres, 'ml');
    if (unit === 'g' || unit === 'kg') {
      const grams = unit === 'kg' ? amount * 1000 : amount;
      if (!density) {
        throw new UnitConversionError(`Cannot convert ${amount} ${unit} to ml without a density`, {
          from: unit,
          to: baseUnit,
        });
      }
      return quantity(grams / density, 'ml');
    }
    if (unit === 'piece') {
      if (!pieceWeightGrams || !density) {
        throw new UnitConversionError(
          `Cannot convert ${amount} pieces to ml without piece weight and density`,
          { from: unit, to: baseUnit },
        );
      }
      return quantity((amount * pieceWeightGrams) / density, 'ml');
    }
  }

  // baseUnit === 'g'
  if (unit === 'g') return quantity(amount, 'g');
  if (unit === 'kg') return quantity(amount * 1000, 'g');
  if (unit === 'piece') {
    if (!pieceWeightGrams) {
      throw new UnitConversionError(
        `Cannot convert ${amount} pieces to grams without a piece weight`,
        { from: unit, to: 'g' },
      );
    }
    return quantity(amount * pieceWeightGrams, 'g');
  }
  if (millilitres !== undefined) {
    if (!density) {
      throw new UnitConversionError(`Cannot convert ${amount} ${unit} to grams without a density`, {
        from: unit,
        to: 'g',
      });
    }
    return quantity(millilitres * density, 'g');
  }

  throw new UnitConversionError(`Unsupported conversion from ${unit} to ${baseUnit}`, {
    from: unit,
    to: baseUnit,
  });
}

function toMillilitres(amount: number, unit: AuthoringUnit): number | undefined {
  switch (unit) {
    case 'ml':
      return amount;
    case 'l':
      return amount * 1000;
    case 'tbsp':
      return amount * ML_PER_TBSP;
    case 'tsp':
      return amount * ML_PER_TSP;
    default:
      return undefined;
  }
}

export function addQuantity(a: Quantity, b: Quantity): Quantity {
  assertSameUnit(a, b);
  return { amount: a.amount + b.amount, unit: a.unit };
}

export function subtractQuantity(a: Quantity, b: Quantity): Quantity {
  assertSameUnit(a, b);
  return { amount: Math.max(0, a.amount - b.amount), unit: a.unit };
}

export function scaleQuantity(q: Quantity, factor: number): Quantity {
  return { amount: q.amount * factor, unit: q.unit };
}

function assertSameUnit(a: Quantity, b: Quantity): void {
  if (a.unit !== b.unit) {
    throw new TypeError(`Cannot combine quantities in ${a.unit} and ${b.unit}`);
  }
}

/**
 * Round a quantity to something a human would actually measure.
 * Grams/millilitres to whole units, pieces to a quarter.
 */
export function roundQuantityForHumans(q: Quantity): Quantity {
  if (q.unit === 'piece') return { amount: Math.round(q.amount * 4) / 4, unit: q.unit };
  return { amount: Math.round(q.amount), unit: q.unit };
}
