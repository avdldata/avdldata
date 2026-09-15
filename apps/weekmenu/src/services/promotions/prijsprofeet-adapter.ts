import {
  classifyRecord,
  isCurrentDeal,
  KNOWN_PROMOTION_TYPES,
  observedAt,
  productUrl,
  PROMOTION_STATUSES,
  promotionTexts,
  recordId,
  SUPPORTED_RETAILERS,
  validateSnapshot,
  type PrijsProfeetRecord,
  type PromotionStatus,
  type RecordUse,
  type SupportedRetailer,
} from './snapshot-schema';
import { extractRetailerProductId } from './retailer-id';
import type { ExternalPromotion, ExternalProductIdentity, ExternalShelfPrice } from './types';

/**
 * PrijsProfeet → our boundary types.
 *
 * The field names below are PrijsProfeet's own, verified against the official
 * documentation. The earlier version of this file could not do that — the
 * egress policy blocks the source and its documentation alike — so it carried a
 * table of `null`s rather than plausible-looking guesses. That table is gone;
 * what replaces it is a single explicit binding per field, written out so a
 * reader can check it against the spec line by line instead of inferring it
 * from the code that consumes it.
 *
 * ## What this module decides, and what it refuses to
 *
 * It decides **what a record is** (`classifyRecord`) and **which of its
 * identities to trust** (`identityOf`). It computes nothing else: no prices are
 * derived, no windows are widened, no status is second-guessed. Turning text
 * into priceable parameters is `toCandidate`'s job, and applying anything to a
 * basket is the engine's.
 *
 * ## The three rules that shape it
 *
 * **A shelf price is not a promotion.** Records with `promotion_status:
 * "shelf"` become `ExternalShelfPrice`, a different type that nothing
 * downstream of the promotion engine accepts. That makes "apply the shelf price
 * as a discount" impossible rather than merely discouraged.
 *
 * **`historical` never reaches checkout.** It is dropped at import, counted,
 * and reported. Keeping it as an expired promotion would work — the window
 * check would refuse it — but relying on a second check to undo a first mistake
 * is how the first mistake eventually gets through.
 *
 * **`unit_price` is never checkout arithmetic.** It is carried for display and
 * sanity checks only. A unit price published next to "2 voor € 3" describes the
 * bundle; multiplying it by a quantity prices a single pack at a discount that
 * does not exist.
 */

/**
 * Our contract field → PrijsProfeet's key for it.
 *
 * Verified, complete, and kept as data rather than scattered through the mapper
 * so that a rename in the feed is a one-line change here. Every name on the
 * right is the official one; nothing is inferred.
 */
export const FIELD_BINDINGS = {
  productId: 'product_id',
  baseProductId: 'base_product_id',
  retailer: 'retailer',
  name: 'name',
  ean: 'ean',
  quantity: 'quantity',
  price: 'price',
  originalPrice: 'original_price',
  unitPrice: 'unit_price',
  isCurrentDeal: 'is_current_deal',
  promotionStatus: 'promotion_status',
  promotionType: 'promotion_type',
  promotionText: 'promotion_text',
  validFrom: 'valid_from',
  validUntil: 'valid_until',
  url: 'url',
  priceChangedAt: 'price_changed_at',
} as const satisfies Readonly<Record<string, keyof PrijsProfeetRecord>>;

export type FieldBindings = typeof FIELD_BINDINGS;

/** The provider name that goes into every identity and every promotion id. */
export const PROVIDER_NAME = 'PRIJSPROFEET';

/**
 * How the feed spells a chain → how we spell it.
 *
 * **This table is ours, not the spec's.** The documentation names the field but
 * not its vocabulary, so rather than assume one spelling, the plausible ones are
 * all accepted and anything unrecognised is *counted and skipped*, never
 * silently dropped. `pnpm promo:import` prints the unrecognised values verbatim,
 * which turns a one-line addition here into the whole fix.
 */
const RETAILER_ALIASES: Readonly<Record<string, SupportedRetailer>> = {
  ah: 'ah',
  'albert heijn': 'ah',
  albert_heijn: 'ah',
  'albert-heijn': 'ah',
  albertheijn: 'ah',
  jumbo: 'jumbo',
};

/** The chain in our spelling, or `undefined` when we do not cover it. */
export function normaliseRetailer(retailer: string): SupportedRetailer | undefined {
  return RETAILER_ALIASES[retailer.trim().toLowerCase()];
}

/**
 * Every identity the record carries, with the retailer it belongs to.
 *
 * No priority is applied here; the record is described, not judged. Choosing
 * between the identities is `identityKey` (for de-duplication) and the linker's
 * tier order (for matching), and keeping those two decisions out of the
 * description is what lets the importer report how often each one is available.
 */
export function identityOf(
  record: PrijsProfeetRecord,
  retailer = normaliseRetailer(record.retailer) ?? record.retailer,
): ExternalProductIdentity {
  return {
    provider: PROVIDER_NAME,
    retailer,
    ...(record.product_id ? { productId: record.product_id } : {}),
    ...(record.base_product_id ? { baseProductId: record.base_product_id } : {}),
    ...(record.ean ? { ean: normaliseEan(record.ean) } : {}),
  };
}

/** Digits only: feeds differ on leading zeros and separators, not on the number. */
function normaliseEan(ean: string): string {
  return ean.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * The identity to de-duplicate on, inside one retailer.
 *
 * The priority is the brief's, and each step down is a step away from
 * permanence:
 *
 *   1. `base_product_id`  the chain's stable key
 *   2. the retailer's own article number, read out of the product URL
 *   3. `ean`              identifies the product; scoped by retailer here, so it
 *                         still identifies one chain's offer
 *   4. `product_id`       last, because it may be reissued per promotion period
 *
 * `undefined` when the record carries none of them, which is a record that
 * cannot be de-duplicated and cannot be linked either.
 */
export function identityKey(record: PrijsProfeetRecord): string | undefined {
  const retailer = normaliseRetailer(record.retailer) ?? record.retailer.toLowerCase();
  if (record.base_product_id) return `${retailer}:base:${record.base_product_id.toLowerCase()}`;
  const retailerId = retailerProductIdOf(record);
  if (retailerId) return `${retailer}:sku:${retailerId.toLowerCase()}`;
  if (record.ean) return `${retailer}:ean:${normaliseEan(record.ean)}`;
  if (record.product_id) return `${retailer}:pid:${record.product_id.toLowerCase()}`;
  return undefined;
}

/**
 * The retailer's own article number, read out of the record.
 *
 * Two places are tried, in order of how certain they are:
 *
 *   - the product URL, which provably carries it — that is exactly how our own
 *     catalogue derives the article number for all 33.390 products;
 *   - `product_id`, but only when it *already has the retailer's shape*
 *     (`wi415202`, `128692ZK`). That is a test, not a conversion: a bare number
 *     is left alone rather than being decorated into an AH id, because "545398
 *     probably means wi545398" is a guess, and a wrong article number links a
 *     promotion to the wrong product.
 */
export function retailerProductIdOf(record: PrijsProfeetRecord): string | undefined {
  const chainId = normaliseRetailer(record.retailer);
  if (!chainId) return undefined;
  const fromUrl = extractRetailerProductId(chainId, productUrl(record));
  if (fromUrl) return fromUrl.id;
  const fromProductId = extractRetailerProductId(chainId, record.product_id);
  if (fromProductId) return fromProductId.id;
  const fromBaseId = extractRetailerProductId(chainId, record.base_product_id);
  return fromBaseId?.id;
}

/**
 * The neutral status, from the feed's four values.
 *
 * `historical` becomes `expired` because downstream has no use for the
 * distinction: both mean the offer is over. `shelf` has no promotion status at
 * all, and a shelf record never becomes an `ExternalPromotion` anyway.
 */
function neutralStatus(
  status: PromotionStatus | null | undefined,
): ExternalPromotion['promotionStatus'] {
  if (status === 'active') return 'active';
  if (status === 'upcoming') return 'upcoming';
  if (status === 'historical') return 'expired';
  return undefined;
}

/**
 * One promotion record as our boundary type.
 *
 * Nothing is computed. The only judgement calls are the two documented above:
 * which retailer spelling this is, and which identities the record carries.
 *
 * Note what happens to prices. `price` is the price *in this record*, which for
 * a promotion is the action price, and `original_price` is what it was before.
 * They map to `promotionalPriceCents` and `regularPriceCents` in that order and
 * are never swapped to make a discount look sensible: a record whose action
 * price exceeds its original price is a source problem, and quietly reordering
 * the two would hide it.
 */
export function toExternalPromotion(
  record: PrijsProfeetRecord,
  source: string,
  fetchedAt: string,
): ExternalPromotion {
  const chainId = normaliseRetailer(record.retailer) ?? record.retailer;
  const retailerProductId = retailerProductIdOf(record);
  const texts = promotionTexts(record);
  return {
    externalPromotionId: recordId(record),
    source,
    chainId,
    identity: identityOf(record, chainId),
    ...(record.base_product_id ? { baseProductId: record.base_product_id } : {}),
    ...(retailerProductId ? { retailerProductId } : {}),
    // The source's own per-record id. Record identity, never product identity —
    // see `identityKey` for why it sits last in every ordering here.
    ...(record.product_id ? { externalProductId: record.product_id } : {}),
    ...(record.ean ? { gtin: normaliseEan(record.ean) } : {}),
    productName: record.name,
    ...(record.quantity ? { packageText: record.quantity } : {}),
    ...(record.original_price != null ? { regularPriceCents: record.original_price } : {}),
    ...(record.price != null ? { promotionalPriceCents: record.price } : {}),
    ...(record.unit_price != null ? { unitPriceCents: record.unit_price } : {}),
    ...(record.brand ? { brand: record.brand } : {}),
    ...(record.promotion_type ? { promotionTypeCode: record.promotion_type } : {}),
    ...(texts.length > 0 ? { promotionText: texts[0], promotionTexts: texts } : {}),
    ...(neutralStatus(record.promotion_status)
      ? { promotionStatus: neutralStatus(record.promotion_status) }
      : {}),
    // Recorded, never obeyed: `is_current_deal` was true at the moment the feed
    // was built, and the week being planned is not that moment. The shopping
    // date against the window decides.
    ...(isCurrentDeal(record) != null ? { isActive: isCurrentDeal(record) } : {}),
    ...(record.valid_from ? { validFrom: record.valid_from } : {}),
    ...(record.valid_until ? { validUntil: record.valid_until } : {}),
    ...(productUrl(record) ? { url: productUrl(record) } : {}),
    ...(observedAt(record) ? { priceChangedAt: observedAt(record) } : {}),
    fetchedAt,
  };
}

/**
 * One shelf record as our boundary type.
 *
 * Deliberately not an `ExternalPromotion`: this is what a product costs when
 * nothing is on offer. Two honest uses — checking our catalogue price against a
 * second source, and picking up an EAN or a pack size we lacked — and no third.
 */
export function toShelfPrice(
  record: PrijsProfeetRecord,
  source: string,
  readAt: string,
): ExternalShelfPrice {
  const chainId = normaliseRetailer(record.retailer) ?? record.retailer;
  return {
    source,
    chainId,
    identity: identityOf(record, chainId),
    productName: record.name,
    ...(record.quantity ? { packageText: record.quantity } : {}),
    ...(record.price != null ? { priceCents: record.price } : {}),
    ...(record.unit_price != null ? { unitPriceCents: record.unit_price } : {}),
    ...(productUrl(record) ? { url: productUrl(record) } : {}),
    ...(observedAt(record) ? { priceChangedAt: observedAt(record) } : {}),
    observedAt: readAt,
  };
}

export interface DedupeResult {
  readonly kept: readonly PrijsProfeetRecord[];
  readonly dropped: number;
  /** The keys that appeared more than once, for reporting. */
  readonly duplicatedKeys: readonly string[];
}

/**
 * Collapse records that describe the same offer.
 *
 * The key is `retailer + baseProductId` where the base id exists, falling back
 * through the priority in `identityKey` where it does not — **plus the validity
 * window**. The window belongs in the key: a promotion running this week and
 * another starting next week are two offers on one product, and a key without
 * the window would throw the second one away. That is not de-duplication, it is
 * data loss, and it would show up as "promotions have little value" rather than
 * as an error.
 *
 * Shelf and historical records have no window, so for those the key is the
 * identity alone — which is what makes a chain's shelf price one row per
 * product, as it should be.
 *
 * Later records win. A feed that lists a product twice has usually appended the
 * correction.
 */
export function dedupeRecords(records: readonly PrijsProfeetRecord[]): DedupeResult {
  const byKey = new Map<string, PrijsProfeetRecord>();
  const unkeyed: PrijsProfeetRecord[] = [];
  const duplicated = new Set<string>();

  for (const record of records) {
    const identity = identityKey(record);
    if (identity === undefined) {
      // No identity at all: nothing to compare it to, so it is kept as it is
      // and refused later by classification, where it can be counted.
      unkeyed.push(record);
      continue;
    }
    const window = record.valid_from ? `${record.valid_from}..${record.valid_until ?? ''}` : '';
    const key = `${identity}|${window}`;
    if (byKey.has(key)) duplicated.add(key);
    byKey.set(key, record);
  }

  return {
    kept: [...byKey.values(), ...unkeyed],
    dropped: records.length - byKey.size - unkeyed.length,
    duplicatedKeys: [...duplicated].sort(),
  };
}

/** What one import produced, per category. Counts, never conclusions. */
export interface ImportedSnapshot {
  readonly source: string;
  readonly promotions: readonly ExternalPromotion[];
  readonly shelfPrices: readonly ExternalShelfPrice[];
  /** Records by what they are, before anything was filtered out. */
  readonly byUse: Readonly<Record<RecordUse, number>>;
  /** Retailer values we do not cover, verbatim, with how often each appeared. */
  readonly skippedRetailers: Readonly<Record<string, number>>;
  readonly duplicatesDropped: number;
  readonly total: number;
}

export interface ImportOptions {
  readonly source?: string;
  readonly fetchedAt: string;
  /** Which chains to keep. Defaults to the two this phase covers. */
  readonly retailers?: readonly string[];
}

/**
 * Records → boundary types, sorted by what each record is.
 *
 * The single place where classification is turned into an outcome, so that the
 * loader, the importer and any future live transport all split the feed the
 * same way and report the same counts.
 */
export function importRecords(
  records: readonly PrijsProfeetRecord[],
  options: ImportOptions,
): ImportedSnapshot {
  const source = options.source ?? PROVIDER_NAME;
  const wanted = new Set(options.retailers ?? SUPPORTED_RETAILERS);
  const deduped = dedupeRecords(records);

  const promotions: ExternalPromotion[] = [];
  const shelfPrices: ExternalShelfPrice[] = [];
  const byUse: Record<RecordUse, number> = {
    PROMOTION: 0,
    SHELF_PRICE: 0,
    HISTORICAL: 0,
    PROMOTION_WITHOUT_WINDOW: 0,
    NO_IDENTITY: 0,
  };
  const skippedRetailers: Record<string, number> = {};

  for (const record of deduped.kept) {
    const chainId = normaliseRetailer(record.retailer);
    if (chainId === undefined || !wanted.has(chainId)) {
      const label = chainId ?? record.retailer;
      skippedRetailers[label] = (skippedRetailers[label] ?? 0) + 1;
      continue;
    }
    const use = classifyRecord(record);
    byUse[use] += 1;
    if (use === 'PROMOTION') {
      promotions.push(toExternalPromotion(record, source, options.fetchedAt));
    } else if (use === 'SHELF_PRICE') {
      shelfPrices.push(toShelfPrice(record, source, options.fetchedAt));
    }
    // HISTORICAL, PROMOTION_WITHOUT_WINDOW and NO_IDENTITY are counted and
    // nothing more. A promotion with no window cannot be dated, and something
    // that cannot be dated must not be priced.
  }

  return {
    source,
    promotions,
    shelfPrices,
    byUse,
    skippedRetailers,
    duplicatesDropped: deduped.dropped,
    total: records.length,
  };
}

/**
 * A whole raw response, validated and imported.
 *
 * For a live transport. It goes through exactly the same validation and the
 * same classification as a file does, so what a future API client returns
 * cannot differ from what the snapshot path produces.
 */
export function mapResponse(
  raw: unknown,
  options?: Partial<ImportOptions> & { readonly path?: string },
): ImportedSnapshot {
  const validated = validateSnapshot(raw, options?.path ?? '(respons)');
  return importRecords(validated.records, {
    source: options?.source ?? validated.source,
    fetchedAt: options?.fetchedAt ?? validated.fetchedAt ?? new Date().toISOString(),
    ...(options?.retailers ? { retailers: options.retailers } : {}),
  });
}

export {
  classifyRecord,
  KNOWN_PROMOTION_TYPES,
  PROMOTION_STATUSES,
  promotionTexts,
  productUrl,
  recordId,
  SUPPORTED_RETAILERS,
};
export type { PrijsProfeetRecord, PromotionStatus, RecordUse, SupportedRetailer };
