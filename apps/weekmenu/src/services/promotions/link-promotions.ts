import { cents, type Cents } from '@/domain/units';
import { normalise } from '@/domain/ingestion/match-ingredient';
import { resolvePackage } from '@/domain/ingestion/package-parser';
import type { ProductOffer, Promotion } from '@/domain/stores/types';
import { parsePromotionText } from './parse-promotion-text';
import { extractRetailerProductId, sameRetailerProduct } from './retailer-id';
import type {
  ExternalPromotion,
  LinkedPromotion,
  LinkingMetrics,
  PromotionCandidate,
  PromotionMatchTier,
  PromotionRejection,
  RejectedPromotion,
} from './types';

/**
 * Tying an offer from a promotion feed to a product we can actually buy.
 *
 * The rule is the one that governs the whole ingestion side: a wrong link is
 * worse than no link. A promotion attached to the wrong product makes the plan
 * cheaper than the till and changes what gets bought, and neither of those
 * announces itself. So the tiers below are evidence, not similarity, and only
 * the top three are ever applied without a human.
 *
 *   EXACT_RETAILER_ID  the shop's own article number, quoted by both sides
 *   EXACT_GTIN         a barcode both sides carry and agree on
 *   NAME_PACKAGE       identical normalised name AND identical pack size
 *   NEEDS_REVIEW       everything else, applied never
 *
 * Note what NAME_PACKAGE requires. Not a similar name — the same one, after
 * normalisation, with the same pack. "Jumbo Rundergehakt 300 g" links to
 * "Jumbo Rundergehakt" at 300 g and to nothing else. A name that matches two
 * products at different sizes is ambiguous and is refused rather than resolved,
 * because a promotion on the 300 g pack is not a promotion on the 500 g pack.
 */

/** Turn what a source said into something comparable, without inventing anything. */
export function toCandidate(external: ExternalPromotion): PromotionCandidate {
  const retailer = extractRetailerProductId(external.chainId, external.externalProductId);
  const parsed = parsePromotionText(external.promotionText, external.promotionalPriceCents);
  const pack = resolvePackage(external.packageText, external.productName);

  // A source that states no window is treated as stating nothing, not as
  // "valid forever": an open-ended promotion would be applied to every week
  // the planner ever computes.
  const validFrom = external.validFrom ?? '';
  const validUntil = external.validUntil ?? '';

  return {
    externalPromotionId: external.externalPromotionId,
    source: external.source,
    chainId: external.chainId,
    ...(retailer ? { retailerProductId: retailer.id } : {}),
    ...(retailer?.numeric ? { retailerArticleNumber: retailer.numeric } : {}),
    ...(external.gtin ? { gtin: normaliseGtin(external.gtin) } : {}),
    normalisedName: normalise(external.productName),
    productName: external.productName,
    ...(pack.status === 'OK'
      ? { packageAmount: pack.info.totalAmount, packageUnit: pack.info.baseUnit }
      : {}),
    ...(external.regularPriceCents !== undefined
      ? { regularPriceCents: external.regularPriceCents }
      : {}),
    ...(external.promotionalPriceCents !== undefined
      ? { promotionalPriceCents: external.promotionalPriceCents }
      : {}),
    originalText: external.promotionText ?? '',
    ...(parsed.status === 'OK' ? { params: parsed.params } : { unsupportedReason: parsed.reason }),
    validFrom,
    validUntil,
    fetchedAt: external.fetchedAt,
  };
}

/** Leading zeros and separators differ between feeds; the digits do not. */
function normaliseGtin(gtin: string): string {
  return gtin.replace(/\D/g, '').replace(/^0+/, '');
}

export interface LinkingResult {
  readonly linked: readonly LinkedPromotion[];
  readonly review: readonly LinkedPromotion[];
  readonly rejected: readonly RejectedPromotion[];
  readonly metrics: LinkingMetrics;
}

export interface LinkingInput {
  readonly chainId: string;
  readonly candidates: readonly PromotionCandidate[];
  readonly offers: readonly ProductOffer[];
  /**
   * The retailer id for each of our offers, keyed by `productId`.
   *
   * Passed in rather than derived here, because only the caller knows how its
   * product ids were built. The real-data fixture builds them from the
   * Checkjebon slug.
   */
  readonly retailerIdByProduct: ReadonlyMap<string, string>;
  /** GTIN per offer, when we have one. Checkjebon supplies none. */
  readonly gtinByProduct?: ReadonlyMap<string, string>;
}

export function linkPromotions(input: LinkingInput): LinkingResult {
  const offers = input.offers.filter((o) => o.chainId === input.chainId);

  const byRetailerId = new Map<string, ProductOffer[]>();
  const byGtin = new Map<string, ProductOffer[]>();
  const byName = new Map<string, ProductOffer[]>();
  const push = (map: Map<string, ProductOffer[]>, key: string, offer: ProductOffer): void => {
    const list = map.get(key);
    if (list) list.push(offer);
    else map.set(key, [offer]);
  };

  for (const offer of offers) {
    const retailerId = input.retailerIdByProduct.get(offer.productId);
    if (retailerId) push(byRetailerId, retailerId.toLowerCase(), offer);
    const gtin = input.gtinByProduct?.get(offer.productId);
    if (gtin) push(byGtin, normaliseGtin(gtin), offer);
    push(byName, normalise(offer.name), offer);
  }

  const linked: LinkedPromotion[] = [];
  const review: LinkedPromotion[] = [];
  const rejected: RejectedPromotion[] = [];
  const byTier: Record<PromotionMatchTier, number> = {
    EXACT_RETAILER_ID: 0,
    EXACT_GTIN: 0,
    NAME_PACKAGE: 0,
    NEEDS_REVIEW: 0,
  };
  const rejectedCounts: Record<PromotionRejection, number> = {
    NO_CANDIDATE_PRODUCT: 0,
    UNSUPPORTED_PROMOTION: 0,
    INVALID_VALIDITY: 0,
    AMBIGUOUS_PRODUCT: 0,
  };
  let supportedType = 0;
  let withRetailerId = 0;
  let withGtin = 0;
  let withPackage = 0;

  for (const candidate of input.candidates) {
    if (candidate.chainId !== input.chainId) continue;
    if (candidate.retailerProductId) withRetailerId += 1;
    if (candidate.gtin) withGtin += 1;
    if (candidate.packageAmount !== undefined) withPackage += 1;
    if (candidate.params) supportedType += 1;

    const found = findProduct(candidate, { byRetailerId, byGtin, byName });
    if (found.tier === undefined) {
      rejectedCounts[found.reason] += 1;
      rejected.push({ candidate, reason: found.reason, nearest: found.nearest });
      continue;
    }
    byTier[found.tier] += 1;

    // Two independent reasons to withhold a promotion, both checked after the
    // link so the metrics still say what the source offered.
    if (!candidate.params) {
      rejectedCounts.UNSUPPORTED_PROMOTION += 1;
      rejected.push({ candidate, reason: 'UNSUPPORTED_PROMOTION', nearest: [found.offer.name] });
      continue;
    }
    if (!isUsableWindow(candidate)) {
      rejectedCounts.INVALID_VALIDITY += 1;
      rejected.push({ candidate, reason: 'INVALID_VALIDITY', nearest: [found.offer.name] });
      continue;
    }

    const entry: LinkedPromotion =
      found.tier === 'NEEDS_REVIEW'
        ? { candidate, offer: found.offer, matchedBy: found.tier }
        : {
            candidate,
            offer: found.offer,
            matchedBy: found.tier,
            promotion: toPromotion(candidate, found.offer),
          };
    if (found.tier === 'NEEDS_REVIEW') review.push(entry);
    else linked.push(entry);
  }

  return {
    linked,
    review,
    rejected,
    metrics: {
      chainId: input.chainId,
      fetched: input.candidates.filter((c) => c.chainId === input.chainId).length,
      byTier,
      rejected: rejectedCounts,
      supportedType,
      unsupportedType:
        input.candidates.filter((c) => c.chainId === input.chainId).length - supportedType,
      withRetailerId,
      withGtin,
      withPackage,
    },
  };
}

type FindResult =
  | { tier: PromotionMatchTier; offer: ProductOffer }
  | { tier: undefined; reason: PromotionRejection; nearest: string[] };

function findProduct(
  candidate: PromotionCandidate,
  index: {
    byRetailerId: Map<string, ProductOffer[]>;
    byGtin: Map<string, ProductOffer[]>;
    byName: Map<string, ProductOffer[]>;
  },
): FindResult {
  // Tier 1: the shop's own number. Both the full id and the bare article
  // number are tried, because a feed may quote either.
  for (const key of [candidate.retailerProductId, candidate.retailerArticleNumber]) {
    if (!key) continue;
    const exact = index.byRetailerId.get(key.toLowerCase());
    if (exact?.length === 1) return { tier: 'EXACT_RETAILER_ID', offer: exact[0]! };
    if (exact && exact.length > 1) {
      return { tier: undefined, reason: 'AMBIGUOUS_PRODUCT', nearest: exact.map((o) => o.name) };
    }
    // Fall back to comparing article numbers when the full ids differ only in
    // their packaging code.
    for (const [storedKey, offers] of index.byRetailerId) {
      if (
        !sameRetailerProduct(
          { id: storedKey, numeric: numericOf(storedKey) },
          { id: key, numeric: numericOf(key) },
        )
      ) {
        continue;
      }
      if (offers.length === 1) return { tier: 'EXACT_RETAILER_ID', offer: offers[0]! };
      return { tier: undefined, reason: 'AMBIGUOUS_PRODUCT', nearest: offers.map((o) => o.name) };
    }
  }

  // Tier 2: a barcode both sides carry.
  if (candidate.gtin) {
    const exact = index.byGtin.get(candidate.gtin);
    if (exact?.length === 1) return { tier: 'EXACT_GTIN', offer: exact[0]! };
    if (exact && exact.length > 1) {
      return { tier: undefined, reason: 'AMBIGUOUS_PRODUCT', nearest: exact.map((o) => o.name) };
    }
  }

  // Tier 3: the same name AND the same pack. Both, or neither.
  const sameName = index.byName.get(candidate.normalisedName) ?? [];
  if (sameName.length > 0) {
    if (candidate.packageAmount === undefined || candidate.packageUnit === undefined) {
      // A name that matches but a pack we cannot read is exactly the case where
      // a promotion on the small pack lands on the large one.
      return { tier: 'NEEDS_REVIEW', offer: sameName[0]! };
    }
    const samePack = sameName.filter(
      (o) =>
        o.packageAmount.unit === candidate.packageUnit &&
        Math.abs(o.packageAmount.amount - candidate.packageAmount!) < 1e-6,
    );
    if (samePack.length === 1) return { tier: 'NAME_PACKAGE', offer: samePack[0]! };
    if (samePack.length > 1) {
      return { tier: undefined, reason: 'AMBIGUOUS_PRODUCT', nearest: samePack.map((o) => o.name) };
    }
    return { tier: 'NEEDS_REVIEW', offer: sameName[0]! };
  }

  return { tier: undefined, reason: 'NO_CANDIDATE_PRODUCT', nearest: [] };
}

function numericOf(id: string): string | undefined {
  const match = /(\d{1,10})/.exec(id);
  return match?.[1];
}

/** A window is usable when it exists, parses, and does not run backwards. */
export function isUsableWindow(candidate: {
  readonly validFrom: string;
  readonly validUntil: string;
}): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(candidate.validFrom) || !iso.test(candidate.validUntil)) return false;
  return candidate.validFrom <= candidate.validUntil;
}

/** The internal promotion the optimizer will see. Nothing source-specific left. */
export function toPromotion(candidate: PromotionCandidate, offer: ProductOffer): Promotion {
  return {
    id: `${candidate.source}:${candidate.externalPromotionId}`,
    productId: offer.productId,
    // A promotion feed states chain-wide offers; Checkjebon has no branch data
    // either, so anything narrower would be an invention.
    scope: { kind: 'chain', chainId: offer.chainId },
    params: candidate.params!,
    minUnits: minUnitsFor(candidate.params!),
    validFrom: candidate.validFrom,
    validUntil: candidate.validUntil,
    label: candidate.originalText || describeParams(candidate.params!),
    source: 'chain-api',
  };
}

/**
 * How many packs you must buy before the offer means anything.
 *
 * A bundle of three does nothing at two packs, and "2e halve prijs" does
 * nothing at one. Getting this wrong in the lenient direction would price a
 * single pack at the bundle rate.
 */
function minUnitsFor(params: Promotion['params']): number {
  switch (params.type) {
    case 'ONE_PLUS_ONE':
      return 2;
    case 'N_FOR_X':
      return params.bundleSize;
    case 'BUY_NTH_DISCOUNT':
      return params.nth;
    case 'FIXED_PRICE':
    case 'PERCENT_OFF':
      return 1;
  }
}

function describeParams(params: Promotion['params']): string {
  switch (params.type) {
    case 'ONE_PLUS_ONE':
      return '1 + 1 gratis';
    case 'N_FOR_X':
      return `${params.bundleSize} voor € ${(params.bundlePriceCents / 100).toFixed(2)}`;
    case 'BUY_NTH_DISCOUNT':
      return params.percent === 100
        ? `${params.nth}e gratis`
        : `${params.nth}e ${params.percent}% korting`;
    case 'FIXED_PRICE':
      return `nu € ${(params.unitPriceCents / 100).toFixed(2)}`;
    case 'PERCENT_OFF':
      return `${params.percent}% korting`;
  }
}

/** Convenience for callers that only want the euro figure. */
export function promotionalUnitPrice(candidate: PromotionCandidate): Cents | undefined {
  return candidate.promotionalPriceCents === undefined
    ? undefined
    : cents(candidate.promotionalPriceCents);
}
