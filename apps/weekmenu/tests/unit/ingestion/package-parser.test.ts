import { describe, expect, it } from 'vitest';
import { parsePackage } from '@/domain/ingestion/package-parser';

/**
 * Every label in here was taken from the real dataset. That matters more than
 * the count: a parser tested against labels someone imagined will pass its
 * tests and fail on the shelf.
 */
describe('reading a package size off a real label', () => {
  const ok: [string, number, string, number][] = [
    // label, totalAmount, baseUnit, packageCount
    ['500 g', 500, 'g', 1],
    ['1 kg', 1000, 'g', 1],
    ['750 ml', 750, 'ml', 1],
    ['0,75 l', 750, 'ml', 1], // AH writes the Dutch decimal comma
    ['1.5 l', 1500, 'ml', 1], // the same feed also writes a decimal point
    ['33 cl', 330, 'ml', 1],
    ['75 Centiliter', 750, 'ml', 1],
    ['185 GRM', 185, 'g', 1],
    ['500 gram', 500, 'g', 1],
    ['6 stuks', 6, 'piece', 1],
    ['Per 350 g', 350, 'g', 1], // PLUS prefixes every label this way
    ['Per 5 st', 5, 'piece', 1],
    ['4 x 250 ml', 1000, 'ml', 4],
    ['6 x 330 ml', 1980, 'ml', 6],
    ['2 x 125 g', 250, 'g', 2],
    ['12 x 1 liter', 12000, 'ml', 12],
    ['6 x 750 ml • Zonder doos', 4500, 'ml', 6],
    ['1 kg (ca. 5 stuks)', 1000, 'g', 1],
    ['per stuk', 1, 'piece', 1],
  ];

  for (const [label, total, unit, count] of ok) {
    it(`reads ${label}`, () => {
      const result = parsePackage(label);
      expect(result.status, `${label} should parse`).toBe('OK');
      if (result.status !== 'OK') return;
      expect(result.info.totalAmount).toBeCloseTo(total, 6);
      expect(result.info.baseUnit).toBe(unit);
      expect(result.info.packageCount).toBe(count);
      expect(result.info.raw).toBe(label);
    });
  }

  it('keeps an approximate weight, and says that it is one', () => {
    const result = parsePackage('ca. 500 g');
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.info.totalAmount).toBe(500);
    expect(result.info.approximate).toBe(true);
  });

  it('does not mistake a price per kilo for a one-kilo pack', () => {
    // The single most dangerous label in the set: read as a package it would
    // have the optimizer buy a kilo at the per-kilo price and be confidently
    // wrong about the whole week.
    const result = parsePackage('per kilo');
    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') return;
    expect(result.reason).toBe('PRICE_PER_MEASURE');
  });

  const refused: [string, string][] = [
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['205 wasbeurten', 'NON_FOOD_UNIT'],
    ['per pakket', 'NO_AMOUNT'],
    ['4 pers | 25 min', 'UNRECOGNISED'], // a recipe card leaking into the feed
  ];
  for (const [label, reason] of refused) {
    it(`refuses ${label || '(empty)'} as ${reason}`, () => {
      const result = parsePackage(label);
      expect(result.status).toBe('FAILED');
      if (result.status !== 'FAILED') return;
      expect(result.reason).toBe(reason);
    });
  }

  it('never invents an amount it was not given', () => {
    for (const label of ['', 'per stuk', 'per kilo', 'onzin', '205 wasbeurten']) {
      const result = parsePackage(label);
      if (result.status === 'OK') {
        // The one legitimate case is a countable single item.
        expect(result.info.baseUnit).toBe('piece');
        expect(result.info.totalAmount).toBe(1);
      }
    }
  });
});
