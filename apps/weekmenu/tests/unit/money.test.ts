import { describe, expect, it } from 'vitest';
import {
  addCents,
  cents,
  divideCents,
  euros,
  roundHalfUp,
  scaleCents,
  subtractCents,
  sumCents,
} from '@/domain/units/money';

describe('money', () => {
  it('keeps everything in whole cents', () => {
    expect(cents(12.4)).toBe(12);
    expect(cents(12.5)).toBe(13);
    expect(euros(3.35)).toBe(335);
  });

  it('survives the classic floating point traps', () => {
    // 0.1 + 0.2 = 0.30000000000000004; 1.005 * 100 = 100.49999999999999
    expect(euros(0.1) + euros(0.2)).toBe(30);
    expect(euros(1.005)).toBe(101);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });

  it('adds, subtracts, scales and divides without drift', () => {
    expect(addCents(cents(199), cents(299), cents(1))).toBe(499);
    expect(subtractCents(cents(500), cents(199))).toBe(301);
    expect(sumCents([cents(10), cents(20), cents(30)])).toBe(60);
    expect(scaleCents(cents(333), 3)).toBe(999);
    expect(divideCents(cents(1000), 3)).toBe(333);
  });

  it('refuses nonsense input instead of producing NaN', () => {
    expect(() => cents(Number.NaN)).toThrow(RangeError);
    expect(() => divideCents(cents(100), 0)).toThrow(RangeError);
  });
});
