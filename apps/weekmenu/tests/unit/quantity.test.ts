import { describe, expect, it } from 'vitest';
import {
  addQuantity,
  ML_PER_TBSP,
  subtractQuantity,
  toBaseQuantity,
  UnitConversionError,
} from '@/domain/units/quantity';

describe('unit conversion', () => {
  it('converts mass units to grams', () => {
    expect(toBaseQuantity(1.5, 'kg', { baseUnit: 'g' })).toEqual({ amount: 1500, unit: 'g' });
    expect(toBaseQuantity(250, 'g', { baseUnit: 'g' })).toEqual({ amount: 250, unit: 'g' });
  });

  it('converts volume units to millilitres', () => {
    expect(toBaseQuantity(2, 'l', { baseUnit: 'ml' })).toEqual({ amount: 2000, unit: 'ml' });
    expect(toBaseQuantity(3, 'tbsp', { baseUnit: 'ml' })).toEqual({
      amount: 3 * ML_PER_TBSP,
      unit: 'ml',
    });
  });

  it('uses the piece weight to turn pieces into grams', () => {
    expect(toBaseQuantity(2, 'piece', { baseUnit: 'g', pieceWeightGrams: 110 })).toEqual({
      amount: 220,
      unit: 'g',
    });
  });

  it('uses density to turn spoons of oil into grams', () => {
    const result = toBaseQuantity(2, 'tbsp', { baseUnit: 'g', density: 0.92 });
    expect(result.amount).toBeCloseTo(27.6, 5);
  });

  it('refuses a conversion it cannot make instead of guessing', () => {
    expect(() => toBaseQuantity(1, 'piece', { baseUnit: 'g' })).toThrow(UnitConversionError);
    expect(() => toBaseQuantity(1, 'tbsp', { baseUnit: 'g' })).toThrow(UnitConversionError);
  });

  it('will not mix units when combining quantities', () => {
    expect(addQuantity({ amount: 1, unit: 'g' }, { amount: 2, unit: 'g' })).toEqual({
      amount: 3,
      unit: 'g',
    });
    expect(() => addQuantity({ amount: 1, unit: 'g' }, { amount: 2, unit: 'ml' })).toThrow(
      TypeError,
    );
  });

  it('never lets a subtraction go negative', () => {
    expect(subtractQuantity({ amount: 100, unit: 'g' }, { amount: 250, unit: 'g' })).toEqual({
      amount: 0,
      unit: 'g',
    });
  });
});
