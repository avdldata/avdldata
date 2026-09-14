import type { BaseUnit } from '../units';
import type { PackageSource } from './package-parser';
import type { MatchReason, MatchStatus } from './match-ingredient';

/**
 * Where a line on the shopping list came from.
 *
 * A price is a claim about the world, and every claim on the list should be
 * traceable back to the thing that made it. Without this the list is a number
 * you either believe or you do not; with it, each line names the shop, the
 * product page, the snapshot it was read from and the day that snapshot was
 * taken — so a wrong price can be looked up rather than argued about.
 *
 * Deliberately narrow. This records how the *data* reached us. It is not a
 * place for anything about the household, and nothing here ever leaves the
 * device: it is read out of a public price snapshot and displayed back.
 */
export interface OfferProvenance {
  /** Which retailer sells it. Two chains selling the same tin are two offers. */
  readonly chainId: string;
  /** Human-readable shop name, as the source itself spells it. */
  readonly chainName: string;
  /** The shop's own product page, when the source gives enough to build one. */
  readonly productUrl?: string;
  /** The dataset the price was read from. */
  readonly source: string;
  /**
   * The day that dataset was published, ISO date.
   *
   * Checkjebon carries no per-product timestamp, so this is the snapshot's
   * date and not the moment the shelf price was set. Stated as one field so
   * nobody can mistake it for the second thing.
   */
  readonly observedOn: string;
  /** How far out of date the snapshot may be, in days, if known. */
  readonly maxAgeDays?: number;
  /** The price exactly as the source stated it, before any rounding. */
  readonly rawPrice: string;
  /** The pack size exactly as the source stated it. */
  readonly rawPackage: string;
  /** Whether the quantity came from a size field or was read off the name. */
  readonly packageSource: PackageSource;
  /** True when the source hedged the amount itself ("ca. 500 g"). */
  readonly packageApproximate: boolean;
  readonly packageAmount: number;
  readonly packageUnit: BaseUnit;
  /**
   * The same pack expressed in the unit the recipes use.
   *
   * These differ whenever a shop sells by the piece and a recipe measures in
   * grams. Both are kept: the first is what the label says, the second is what
   * was priced, and a line where they disagree should be checkable without
   * re-deriving the conversion.
   */
  readonly convertedAmount: number;
  readonly convertedUnit: BaseUnit;
  /** Why the matcher believes this product is that ingredient. */
  readonly matchStatus: MatchStatus;
  readonly matchReasons: readonly MatchReason[];
  /** Where the nutrition figures behind this line came from. */
  readonly nutritionOrigin: 'product' | 'ingredient' | 'none';
}

/**
 * One line of the shopping list, with everything needed to check it.
 *
 * Quantity and price are kept apart from the offer on purpose: the offer is
 * what the shop sells, these are what this week buys.
 */
export interface ProvenancedLine {
  readonly ingredientId: string;
  readonly ingredientName: string;
  readonly productId: string;
  readonly productName: string;
  readonly units: number;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
  readonly provenance: OfferProvenance;
}

/** A one-line summary a person can read without knowing the field names. */
export function describeProvenance(provenance: OfferProvenance): string {
  const label = `${provenance.packageAmount}${provenance.packageUnit}`;
  const size =
    provenance.convertedUnit === provenance.packageUnit &&
    provenance.convertedAmount === provenance.packageAmount
      ? label
      : `${label} = ${round(provenance.convertedAmount)}${provenance.convertedUnit}`;
  const hedge = provenance.packageApproximate ? ' (bij benadering)' : '';
  const from = provenance.packageSource === 'SIZE_FIELD' ? 'maatveld' : 'productnaam';
  return (
    `${provenance.chainName}, ${provenance.rawPrice} voor ${size}${hedge} ` +
    `— verpakking uit ${from}, prijs uit ${provenance.source} van ${provenance.observedOn}`
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
