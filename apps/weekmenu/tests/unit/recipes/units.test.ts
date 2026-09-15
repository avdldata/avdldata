import { describe, expect, it } from 'vitest';
import { canonicalUnit, normaliseAmount } from '@/services/recipes/units';

/**
 * The line between a conversion and a guess.
 *
 * Every number in this file is either a definition (1 lb = 453,59237 g) or a
 * refusal. There is deliberately no third category, because the third category
 * is where "1 bunch of parsley = 60 g" lives, and a planner that invents that
 * number puts it on a shopping list as if someone had measured it.
 */
describe('normaliseAmount', () => {
  it('converts mass exactly, because a kilogram is a kilogram', () => {
    expect(normaliseAmount(2, 'kg')).toMatchObject({ kind: 'mass', value: 2000, baseUnit: 'g' });
    expect(normaliseAmount(1, 'lb').value).toBeCloseTo(453.59237, 5);
    expect(normaliseAmount(8, 'oz').value).toBeCloseTo(226.796185, 5);
  });

  it('converts volume exactly and keeps it a volume', () => {
    expect(normaliseAmount(2, 'l')).toMatchObject({ kind: 'volume', value: 2000, baseUnit: 'ml' });
    expect(normaliseAmount(1, 'cup').value).toBeCloseTo(236.5882365, 5);
    expect(normaliseAmount(3, 'tbsp').value).toBeCloseTo(44.36029434, 5);
  });

  it('turns volume into mass only when the ingredient states a density', () => {
    const withoutDensity = normaliseAmount(1, 'cup');
    expect(withoutDensity.kind).toBe('volume');
    expect(withoutDensity.baseUnit).toBe('ml');

    const withDensity = normaliseAmount(1, 'cup', 1.03);
    expect(withDensity.kind).toBe('mass');
    expect(withDensity.value).toBeCloseTo(236.5882365 * 1.03, 5);
  });

  it('refuses package units by name instead of inventing a pack size', () => {
    for (const unit of ['can', 'jar', 'bunch', 'package', 'pinch', 'handful']) {
      const result = normaliseAmount(1, unit);
      expect(result.value, unit).toBeUndefined();
      expect(result.refusal, unit).toBe('PACKAGE_DEPENDENT');
      expect(result.originalUnit, unit).toBe(unit);
    }
  });

  it('treats a bare number as a count and a count word as a count', () => {
    expect(normaliseAmount(2, undefined)).toMatchObject({ kind: 'count', value: 2 });
    expect(normaliseAmount(3, 'cloves')).toMatchObject({ kind: 'count', value: 3 });
  });

  it('refuses an unknown unit rather than dropping it', () => {
    const result = normaliseAmount(1, 'schepje');
    expect(result.refusal).toBe('UNKNOWN_UNIT');
    expect(result.originalUnit).toBe('schepje');
  });

  it('refuses a missing, zero or negative quantity', () => {
    expect(normaliseAmount(undefined, 'g').refusal).toBe('NO_QUANTITY');
    expect(normaliseAmount(0, 'g').refusal).toBe('NO_QUANTITY');
    expect(normaliseAmount(-1, 'g').refusal).toBe('NO_QUANTITY');
    expect(normaliseAmount(Number.NaN, 'g').refusal).toBe('NO_QUANTITY');
  });

  it('never returns a value together with a refusal', () => {
    const cases = [
      normaliseAmount(1, 'can'),
      normaliseAmount(1, 'schepje'),
      normaliseAmount(undefined, 'g'),
      normaliseAmount(1, 'kg'),
      normaliseAmount(1, 'cup'),
    ];
    for (const result of cases) {
      expect(result.value === undefined).toBe(result.refusal !== undefined);
    }
  });

  it('normalises unit spelling before looking it up', () => {
    expect(canonicalUnit(' Tbsp. ')).toBe('tbsp');
    expect(normaliseAmount(1, 'Tbsp.').value).toBeCloseTo(14.78676478125, 5);
    expect(normaliseAmount(1, 'FL OZ').value).toBeCloseTo(29.5735295625, 5);
  });
});
