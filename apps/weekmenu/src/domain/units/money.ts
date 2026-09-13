/**
 * Money is always an integer number of eurocents.
 *
 * There is no floating point euro anywhere in this codebase: prices, promotions,
 * budgets, travel costs and penalties are all `Cents`. Formatting to "€ 12,34"
 * happens once, in the presentation layer (`src/lib/format.ts`).
 */
export type Cents = number & { readonly __brand: 'Cents' };

/** Round half away from zero, immune to the usual binary-float surprises. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot round a non-finite number: ${value}`);
  }
  const scaled = value * (1 + Number.EPSILON);
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/** Construct Cents from an integer amount of cents. */
export function cents(value: number): Cents {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cents must be finite, received ${value}`);
  }
  return roundHalfUp(value) as Cents;
}

/** Construct Cents from an amount in euros (only used for config and seed data). */
export function euros(value: number): Cents {
  return cents(value * 100);
}

export const ZERO_CENTS: Cents = 0 as Cents;

export function addCents(...values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) total += value;
  return total as Cents;
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return (a - b) as Cents;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const value of values) total += value;
  return total as Cents;
}

/** Multiply a price by a dimensionless factor and round back to whole cents. */
export function scaleCents(value: Cents, factor: number): Cents {
  return cents(value * factor);
}

/** Split a total across n parts, rounded to whole cents (used for price-per-person). */
export function divideCents(value: Cents, divisor: number): Cents {
  if (divisor === 0) throw new RangeError('Cannot divide cents by zero');
  return cents(value / divisor);
}

export function minCents(a: Cents, b: Cents): Cents {
  return a <= b ? a : b;
}

export function maxCents(a: Cents, b: Cents): Cents {
  return a >= b ? a : b;
}
