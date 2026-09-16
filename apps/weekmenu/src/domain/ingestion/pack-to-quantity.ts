import type { PackageInfo } from './package-parser';
import type { CanonicalIngredient } from '../ingredients/types';
import { quantity, toBaseQuantity, UnitConversionError, type Quantity } from '../units';

/**
 * A shop's pack, expressed in the unit the recipes are written in.
 *
 * This is the conversion that cost €146,94 of peppers once, so it lives in one
 * place and both the app and the measurement harness call it. The packaging
 * solver compares numbers without knowing their unit: it takes the unit of the
 * first offer it sees and assumes the requirement is in that unit, so "186 g of
 * red pepper" met by a pack of "1 stuk" quietly becomes 186 peppers, on a list
 * that otherwise looks perfectly ordinary.
 *
 * Where the catalogue gives no honest way to convert, the answer is a refusal
 * and not a number. That shows up as coverage lost, which is where it belongs.
 */

/**
 * Ingredients where a shop's "stuk" is not a recipe's "stuk".
 *
 * A recipe asks for two cloves of garlic, so the catalogue records a garlic
 * piece as five grams. A shop sells garlic by the bulb — "AH Knoflook, 2
 * stuks", about a hundred grams. Converting the shop's two pieces through the
 * recipe's piece weight gives ten grams, so a week needing thirty grams buys
 * six bulbs. Same story for spring onions and chillies, sold by the bunch and
 * cooked by the stalk.
 *
 * There is no way to tell these apart from the data — both say "stuks" — so
 * they are named here and their piece-labelled packs are dropped. Both chains
 * also sell these by weight, so the ingredient stays available.
 */
export const RETAIL_PIECE_IS_NOT_RECIPE_PIECE: ReadonlySet<string> = new Set([
  'knoflook',
  'bosui',
  'rode-peper',
]);

export type PackConversion =
  | { readonly ok: true; readonly quantity: Quantity }
  | {
      readonly ok: false;
      readonly reason: 'PIECE_MISMATCH' | 'UNCONVERTIBLE' | 'NOT_POSITIVE' | 'FRACTIONAL_PIECES';
    };

export function packToQuantity(pack: PackageInfo, ingredient: CanonicalIngredient): PackConversion {
  if (pack.baseUnit === 'piece' && RETAIL_PIECE_IS_NOT_RECIPE_PIECE.has(ingredient.id)) {
    return { ok: false, reason: 'PIECE_MISMATCH' };
  }

  // A label that states a count outranks one that states a weight, but only for
  // an ingredient a recipe counts. "8 Stuks 320 g" is eight wraps; via the
  // average wrap weight it would be 5,16 wraps, and nobody buys 5,16.
  const counted =
    ingredient.baseUnit === 'piece' && pack.pieceCount !== undefined ? pack.pieceCount : undefined;

  let converted: Quantity;
  try {
    converted =
      counted !== undefined
        ? quantity(counted, 'piece')
        : toBaseQuantity(pack.totalAmount, pack.baseUnit, {
            baseUnit: ingredient.baseUnit,
            density: ingredient.density,
            pieceWeightGrams: ingredient.pieceWeightGrams,
          });
  } catch (error) {
    if (!(error instanceof UnitConversionError)) throw error;
    return { ok: false, reason: 'UNCONVERTIBLE' };
  }
  if (converted.amount <= 0) return { ok: false, reason: 'NOT_POSITIVE' };
  /*
   * A pack counted in pieces must contain a whole number of them.
   *
   * Found by auditing a real shopping list: "Wraps naturel" arrived as a pack
   * of 5,161290322580645 pieces, because the label stated only a weight and the
   * conversion divided it by an average wrap. Nobody sells 5,16 wraps, and a
   * requirement of 4,3 wraps met by a pack of 5,16 is arithmetic about a
   * quantity that does not exist. Refused, which drops the offer rather than
   * printing a number no shelf can honour.
   */
  if (converted.unit === 'piece' && !Number.isInteger(converted.amount)) {
    return { ok: false, reason: 'FRACTIONAL_PIECES' };
  }
  return { ok: true, quantity: converted };
}
