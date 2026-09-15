import type { BaseUnit } from '@/domain/units';
import type { Promotion, PromotionParams, ProductOffer } from '@/domain/stores/types';

/**
 * The boundary between a promotion source and everything downstream.
 *
 * Four shapes, and the whole point is that only the first one is allowed to
 * know where the data came from:
 *
 *   raw response        whatever the source sends. Lives in its adapter and
 *                       nowhere else.
 *   ExternalPromotion   one offer as a source describes it, in our field
 *                       names. Nothing computed, nothing invented — a field the
 *                       source does not provide is simply absent.
 *   PromotionCandidate  normalised: the type worked out from the text, the
 *                       validity as ISO dates, the identity split apart.
 *   LinkedPromotion     a candidate tied to a product we actually sell, with
 *                       the evidence for that link.
 *
 * `ExternalPromotion` is deliberately *not* shaped like any one provider. It is
 * the shape every promotion source has to be able to fill, so that a second
 * source costs an adapter and nothing else.
 */

/** How confident we are that a promotion belongs to a given product. */
export type PromotionMatchTier =
  /**
   * A stable product identity the source itself calls permanent.
   *
   * Ranked above the retailer id because PrijsProfeet product ids can change
   * per promotion period: a per-period id is a record identity, not a product
   * identity, and linking on it would silently rot between folder weeks.
   */
  | 'EXACT_STABLE_ID'
  /** The retailer's own product number, quoted identically by both sides. */
  | 'EXACT_RETAILER_ID'
  /** A GTIN both sides carry and agree on. */
  | 'EXACT_GTIN'
  /** Normalised name identical and package identical. */
  | 'NAME_PACKAGE'
  /** Anything weaker. Never applied automatically. */
  | 'NEEDS_REVIEW';

export type PromotionRejection =
  /** No product in our catalogue looks like this at all. */
  | 'NO_CANDIDATE_PRODUCT'
  /** The text could not be turned into something the engine can price. */
  | 'UNSUPPORTED_PROMOTION'
  /** Structured fine, but the validity window is missing or nonsensical. */
  | 'INVALID_VALIDITY'
  /** Several products fit equally well; picking one would be a coin toss. */
  | 'AMBIGUOUS_PRODUCT';

/**
 * One promotion, exactly as a source states it.
 *
 * Everything optional is optional because a source may not have it, and an
 * absent field must stay absent rather than becoming a default — a missing GTIN
 * is not an empty GTIN, and a missing regular price is not zero.
 */
export interface ExternalPromotion {
  /** The source's own id for this promotion, for provenance and de-duplication. */
  readonly externalPromotionId: string;
  /** Which source said so. */
  readonly source: string;
  /** Which chain the promotion is at. */
  readonly chainId: string;
  /**
   * A product identity the source states is stable across promotion periods.
   *
   * This is the one to link on when it exists. `externalProductId` may be
   * reissued every folder week, which makes it useful for de-duplicating
   * records and useless for recognising a product.
   */
  readonly baseProductId?: string;
  /** The retailer's own article number, when the source passes it through. */
  readonly retailerProductId?: string;
  /** The source's id for the product, if it has one. Per-period, so record identity. */
  readonly externalProductId?: string;
  readonly gtin?: string;
  readonly productName: string;
  readonly brand?: string;
  /** Pack size as the source states it, unparsed. */
  readonly packageText?: string;
  /**
   * What the source calls the normal price.
   *
   * Never used to overwrite our own regular price. Kept so the two can be
   * compared, which is a freshness signal about both sources.
   */
  readonly regularPriceCents?: number;
  readonly promotionalPriceCents?: number;
  /**
   * Price per kilo or litre as the source states it.
   *
   * Display and comparison only. Never multiplied by a quantity to price a
   * basket: a unit price alongside "2 voor € 3" describes the bundle, and
   * multiplying it prices a single pack at a discount that does not exist.
   */
  readonly unitPriceCents?: number;
  /** The source's own classification of the offer, when it has one. */
  readonly promotionTypeCode?: string;
  /** The shelf text: "1 + 1 gratis", "2e halve prijs". */
  readonly promotionText?: string;
  /** Where the source says the offer sits relative to its window. */
  readonly promotionStatus?: 'active' | 'upcoming' | 'expired';
  /**
   * The source's "this is live now" flag.
   *
   * Recorded, never obeyed. Whether an offer applies is decided by the shopping
   * date against the window, because a flag is true at the moment the feed was
   * built and the week being planned is not that moment.
   */
  readonly isActive?: boolean;
  readonly validFrom?: string;
  readonly validUntil?: string;
  /** When we fetched it, so a stale snapshot can be recognised as one. */
  readonly fetchedAt: string;
}

/** An external promotion after normalisation, before it is tied to a product. */
export interface PromotionCandidate {
  readonly externalPromotionId: string;
  readonly source: string;
  readonly chainId: string;
  readonly baseProductId?: string;
  readonly retailerProductId?: string;
  readonly retailerArticleNumber?: string;
  readonly gtin?: string;
  /** Lowercased, accent-free, single-spaced. */
  readonly normalisedName: string;
  readonly productName: string;
  /** Pack size in a base unit, when the source stated one we could read. */
  readonly packageAmount?: number;
  readonly packageUnit?: BaseUnit;
  readonly regularPriceCents?: number;
  readonly promotionalPriceCents?: number;
  readonly unitPriceCents?: number;
  readonly promotionTypeCode?: string;
  readonly promotionStatus?: 'active' | 'upcoming' | 'expired';
  readonly originalText: string;
  /** Which file this record came from, so a wrong line can be found again. */
  readonly sourceFile?: string;
  /** When we read the file. Distinct from when the source built it. */
  readonly importedAt?: string;
  /** Absent when the text could not be structured; the promotion is then unusable. */
  readonly params?: PromotionParams;
  readonly unsupportedReason?: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly fetchedAt: string;
}

/** A candidate tied to one of our offers, with the evidence for the link. */
export interface LinkedPromotion {
  readonly candidate: PromotionCandidate;
  readonly offer: ProductOffer;
  readonly matchedBy: PromotionMatchTier;
  /** Ready for the optimizer. Absent for a review-tier link. */
  readonly promotion?: Promotion;
}

export interface RejectedPromotion {
  readonly candidate: PromotionCandidate;
  readonly reason: PromotionRejection;
  /** The products that came close, so a reviewer can see the near miss. */
  readonly nearest: readonly string[];
}

/**
 * Everything a promotion source has to be able to do.
 *
 * Deliberately tiny, and deliberately not async-per-product: a promotion feed
 * is fetched whole, cached, and read from the cache. Nothing in the optimizer
 * ever calls this — see `snapshot-provider.ts` for the reason.
 */
export interface PromotionProvider {
  readonly name: string;
  /**
   * Every promotion the source knows about for these chains, current and
   * upcoming both. Filtering by date is the caller's job, because only the
   * caller knows which day the shopping happens.
   */
  fetchPromotions(chainIds: readonly string[]): Promise<readonly ExternalPromotion[]>;
}

/** What one linking run produced, in numbers. */
export interface LinkingMetrics {
  readonly chainId: string;
  readonly fetched: number;
  readonly byTier: Readonly<Record<PromotionMatchTier, number>>;
  readonly rejected: Readonly<Record<PromotionRejection, number>>;
  readonly supportedType: number;
  readonly unsupportedType: number;
  readonly withStableId: number;
  readonly withRetailerId: number;
  readonly withGtin: number;
  readonly withPackage: number;
}
