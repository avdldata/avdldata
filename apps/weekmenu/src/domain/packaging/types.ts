import type { Cents } from '../units';
import type { BaseUnit } from '../units';
import type { IngredientId } from '../ingredients/types';
import type { ProductOffer } from '../stores/types';

export interface PackagingLine {
  readonly offer: ProductOffer;
  readonly units: number;
  readonly lineTotalCents: Cents;
  readonly promotionApplied: boolean;
  readonly savingsCents: Cents;
}

export interface PackagingSolution {
  readonly ingredientId: IngredientId;
  readonly unit: BaseUnit;
  readonly requiredAmount: number;
  readonly purchasedAmount: number;
  readonly leftoverAmount: number;
  readonly totalCents: Cents;
  readonly lines: readonly PackagingLine[];
}

export type PackagingUnavailableReason =
  | 'NO_PRODUCTS'
  | 'NO_MATCHING_UNIT'
  | 'NO_VALID_COMBINATION';

export type PackagingResult =
  | { readonly status: 'OK'; readonly solution: PackagingSolution }
  | {
      readonly status: 'UNAVAILABLE';
      readonly ingredientId: IngredientId;
      readonly reason: PackagingUnavailableReason;
    };

export interface PackagingConfig {
  /**
   * How many packs above the strict minimum we are willing to consider.
   * Needed because "1+1 gratis" can make two packs cost the same as one.
   */
  readonly promotionSlackUnits: number;
  /**
   * Absolute safety ceiling on packs of a single variant. It exists to stop a
   * degenerate catalogue from building a huge cost table — it is never the
   * reason a requirement cannot be met at a normal quantity.
   */
  readonly maxUnitsPerVariant: number;
  /** Only the N cheapest variants per (ingredient, store) are considered. */
  readonly maxVariants: number;
  /** Search-node budget; the bounded DFS gives up gracefully beyond this. */
  readonly maxSearchNodes: number;
}

export const DEFAULT_PACKAGING_CONFIG: PackagingConfig = {
  promotionSlackUnits: 2,
  maxUnitsPerVariant: 200,
  maxVariants: 6,
  maxSearchNodes: 20_000,
};
