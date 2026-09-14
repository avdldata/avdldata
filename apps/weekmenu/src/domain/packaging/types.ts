import type { Cents } from '../units';
import type { BaseUnit } from '../units';
import type { IngredientId } from '../ingredients/types';
import type { ProductOffer } from '../stores/types';

export interface PackagingLine {
  readonly offer: ProductOffer;
  readonly units: number;
  readonly lineTotalCents: Cents;
  readonly promotionApplied: boolean;
  /**
   * Everything this line is cheaper than usual: the reference price (the median
   * of recent observations) minus what you pay. Includes an ordinary price drop.
   */
  readonly savingsCents: Cents;
  /**
   * The part of `savingsCents` a promotion is responsible for: today's shelf
   * price times the units, minus what the register actually charges.
   *
   * Kept apart because calling a price dip an "aanbieding" overstates what the
   * offer does — the UI may only use this number under that word.
   */
  readonly promotionSavingsCents: Cents;
  /** Energy this line contributes, when the offer carries nutrition data. */
  readonly kcalContribution?: number;
}

export interface PackagingSolution {
  readonly ingredientId: IngredientId;
  readonly unit: BaseUnit;
  readonly requiredAmount: number;
  readonly purchasedAmount: number;
  readonly leftoverAmount: number;
  readonly totalCents: Cents;
  readonly lines: readonly PackagingLine[];
  /** The weighted objective this solution won on, for debugging and tests. */
  readonly objectiveCents: number;
}

export type PackagingUnavailableReason =
  'NO_PRODUCTS' | 'NO_MATCHING_UNIT' | 'NO_VALID_COMBINATION';

export type PackagingResult =
  | { readonly status: 'OK'; readonly solution: PackagingSolution }
  | {
      readonly status: 'UNAVAILABLE';
      readonly ingredientId: IngredientId;
      readonly reason: PackagingUnavailableReason;
    };

/**
 * What "best product" means.
 *
 * Price dominates in V1, but the trade-off is explicit and configurable rather
 * than baked in, so a household that would rather waste less — or pick the
 * product with more protein per euro — is a settings change and not a rewrite.
 */
export interface ProductSelectionWeights {
  /** Multiplier on the actual checkout price. */
  readonly price: number;
  /** What a kilo of leftover is treated as costing. */
  readonly wastePerKiloCents: number;
  /**
   * Weight on nutritional quality. Zero in V1: the demo dataset only carries
   * declared values for part of the catalogue, and scoring on a half-filled
   * column would quietly favour whichever products happen to have data.
   */
  readonly nutrition: number;
}

export const DEFAULT_PRODUCT_SELECTION_WEIGHTS: ProductSelectionWeights = {
  price: 1,
  wastePerKiloCents: 150,
  nutrition: 0,
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
  readonly selection: ProductSelectionWeights;
}

export const DEFAULT_PACKAGING_CONFIG: PackagingConfig = {
  promotionSlackUnits: 2,
  maxUnitsPerVariant: 200,
  maxVariants: 6,
  maxSearchNodes: 20_000,
  selection: DEFAULT_PRODUCT_SELECTION_WEIGHTS,
};
