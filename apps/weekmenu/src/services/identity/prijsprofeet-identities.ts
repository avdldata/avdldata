import {
  classifyRecord,
  normaliseRetailer,
  productUrl,
  observedAt,
  type PrijsProfeetRecord,
} from '@/services/promotions/prijsprofeet-adapter';
import type { ExternalIdentityRecord } from './types';

/**
 * PrijsProfeet records → identity candidates.
 *
 * Both kinds of record carry the same identity fields, so both are usable here
 * and which one it was is provenance rather than meaning. That is the whole
 * reason a `shelf` record is worth fetching: it is an ordinary product with a
 * barcode and a stable key, published whether or not anything is on offer, and
 * it is therefore the only way to learn a product's identity **before** it
 * appears in a folder.
 *
 * What does not change: a shelf record is still not a promotion. Nothing here
 * produces a discount, and `promotion_status` is carried only so that the
 * crosswalk can say where an identity came from.
 */

/** Which record kinds may be used as an identity source. */
export interface IdentityExtractionOptions {
  /** Default: both. A run may narrow this to audit one source at a time. */
  readonly kinds?: readonly ('shelf' | 'promotion')[];
  readonly retailers?: readonly string[];
}

export function toIdentityRecords(
  records: readonly PrijsProfeetRecord[],
  options: IdentityExtractionOptions = {},
): ExternalIdentityRecord[] {
  const kinds = new Set(options.kinds ?? ['shelf', 'promotion']);
  const retailers = options.retailers ? new Set(options.retailers) : undefined;
  const out: ExternalIdentityRecord[] = [];

  for (const record of records) {
    const retailer = normaliseRetailer(record.retailer);
    if (!retailer) continue;
    if (retailers && !retailers.has(retailer)) continue;

    const use = classifyRecord(record);
    const kind = recordKind(use);
    if (kind === 'unknown' || !kinds.has(kind)) continue;

    // No identity at all is nothing to bridge with. A name on its own can only
    // ever reach the review tier, and a review-tier identity is not applied, so
    // carrying it would add work without adding a link.
    if (!record.base_product_id && !record.ean && !productUrl(record) && !record.product_id) {
      continue;
    }

    out.push({
      retailer,
      ...(record.product_id ? { productId: record.product_id } : {}),
      ...(record.base_product_id ? { baseProductId: record.base_product_id } : {}),
      ...(record.ean ? { ean: record.ean } : {}),
      ...(productUrl(record) ? { url: productUrl(record)! } : {}),
      name: record.name,
      ...(record.quantity ? { packageText: record.quantity } : {}),
      // Present for the price comparison, and pointedly not for pricing: in
      // this feed `price` on a promotion record is the effective per-unit rate,
      // not what one pack costs. Only a shelf record's price is a shelf price.
      ...(kind === 'shelf' && record.price != null ? { priceCents: record.price } : {}),
      recordKind: kind,
      ...(observedAt(record) ? { observedAt: observedAt(record)! } : {}),
    });
  }
  return out;
}

function recordKind(use: ReturnType<typeof classifyRecord>): 'shelf' | 'promotion' | 'unknown' {
  if (use === 'SHELF_PRICE') return 'shelf';
  if (use === 'PROMOTION' || use === 'PROMOTION_WITHOUT_WINDOW') return 'promotion';
  // HISTORICAL is deliberately excluded. A price point from a folder three
  // months ago says nothing reliable about what the article is today, and an
  // identity written from it would outlive the evidence for it.
  return 'unknown';
}

/** Kept so a caller can report where identities came from without re-deriving. */
export function identitySourceBreakdown(
  records: readonly PrijsProfeetRecord[],
): Record<'shelf' | 'promotion' | 'unknown', number> {
  const counts = { shelf: 0, promotion: 0, unknown: 0 };
  for (const record of records) counts[recordKind(classifyRecord(record))] += 1;
  return counts;
}
