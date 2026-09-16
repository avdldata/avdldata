import { describe, expect, it } from 'vitest';
import { packToQuantity } from '@/domain/ingestion/pack-to-quantity';
import type { PackageInfo } from '@/domain/ingestion/package-parser';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';

/**
 * Two defects the manual audit of a real shopping list turned up, pinned so
 * they cannot come back.
 */
const ingredient = (id: string) => SEED_INGREDIENTS.find((i) => i.id === id)!;
const pack = (info: Partial<PackageInfo>): PackageInfo =>
  ({
    packageCount: 1,
    amountPerPackage: 0,
    totalAmount: 0,
    baseUnit: 'g',
    source: 'size-field',
    approximate: false,
    ...info,
  }) as PackageInfo;

describe('a pack counted in pieces', () => {
  /**
   * "Wraps naturel" arrived as a pack of 5,161290322580645 pieces: the label
   * stated only a weight, and the conversion divided it by an average wrap.
   * A requirement of 4,3 wraps met by a pack of 5,16 is arithmetic about a
   * quantity that does not exist on any shelf.
   */
  it('is refused when the conversion produces a fraction of one', () => {
    const wraps = ingredient('wraps');
    const result = packToQuantity(pack({ totalAmount: 320, baseUnit: 'g' }), wraps);
    if (result.ok) {
      expect(Number.isInteger(result.quantity.amount)).toBe(true);
    } else {
      expect(result.reason).toBe('FRACTIONAL_PIECES');
    }
  });

  it('is accepted when the label states a whole count', () => {
    const result = packToQuantity(
      pack({ totalAmount: 320, baseUnit: 'g', pieceCount: 8 }),
      ingredient('wraps'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quantity).toEqual({ amount: 8, unit: 'piece' });
  });
});

describe('a shop piece that is not a recipe piece', () => {
  it('stays refused, so a bulb of garlic is never two cloves', () => {
    const result = packToQuantity(
      pack({ totalAmount: 2, baseUnit: 'piece', pieceCount: 2 }),
      ingredient('knoflook'),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('PIECE_MISMATCH');
  });
});
