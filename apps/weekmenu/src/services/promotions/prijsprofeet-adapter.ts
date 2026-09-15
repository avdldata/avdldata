import {
  PROMOTION_STATUSES,
  PROMOTION_TYPE_CODES,
  SUPPORTED_RETAILERS,
  validateSnapshot,
  type PromotionRecord,
  type SupportedRetailer,
} from './snapshot-schema';
import type { ExternalPromotion } from './types';

/**
 * PrijsProfeet → our boundary type.
 *
 * ## What could and could not be done here
 *
 * The brief asks for the official OpenAPI specification's field names. **They
 * could not be read.** The egress policy that blocks `prijsprofeet.nl` blocks
 * its documentation too, and no mirror of the spec was reachable on the hosts
 * that are allowed. Writing plausible names here and calling them official is
 * exactly what the brief forbids, and it is worse than leaving a gap: a wrong
 * field name yields zero promotions and nothing announces it.
 *
 * So the split is:
 *
 *   - the **snapshot contract** in `snapshot-schema.ts` is ours, complete, and
 *     covers every concept the brief lists. Everything downstream of it is
 *     built and tested.
 *   - the **binding** from PrijsProfeet's own spelling to that contract is a
 *     table, `FIELD_BINDINGS`, filled in once by whoever can read a real
 *     response. It is data, not code, so finishing this needs no TypeScript.
 *
 * Two spellings below are exceptions and are marked: `base_product_id` and the
 * promotion type codes (`one_plus_one`, `multi_buy`, `percentage`) come from
 * the brief itself, so they are accepted verbatim as input.
 *
 * ## Finishing it
 *
 * 1. Put one real response next to this file and read its keys.
 * 2. Fill in `FIELD_BINDINGS`: our name on the left, theirs on the right.
 * 3. `pnpm promo:probe` reports which of the fields actually arrive.
 *
 * Nothing else changes.
 */

/**
 * Our contract field → the source's key for it.
 *
 * `null` means "not bound yet". A binding may also be a dotted path
 * (`price.current`) for a nested response.
 */
export type FieldBindings = Readonly<Record<keyof PromotionRecord, string | null>>;

export const FIELD_BINDINGS: FieldBindings = {
  external_promotion_id: null,
  retailer: null,
  // Spelled as the brief spells it; accepted verbatim if the source agrees.
  base_product_id: 'base_product_id',
  retailer_product_id: null,
  external_product_id: null,
  gtin: null,
  product_name: null,
  brand: null,
  package_text: null,
  current_price: null,
  regular_price: null,
  unit_price: null,
  promotion_status: null,
  promotion_type: null,
  promotion_text: null,
  valid_from: null,
  valid_until: null,
  is_active: null,
  fetched_at: null,
};

/** Which of our contract fields a response must supply for a record to be usable. */
export const REQUIRED_FIELDS: readonly (keyof PromotionRecord)[] = [
  'external_promotion_id',
  'retailer',
  'product_name',
  'valid_from',
  'valid_until',
];

export class PromotionSourceNotConfiguredError extends Error {
  constructor(missing: readonly string[]) {
    super(
      'De PrijsProfeet-veldbinding is niet ingevuld voor: ' +
        `${missing.join(', ')}.\n\n` +
        'De officiële specificatie was vanuit deze omgeving niet te lezen, dus de ' +
        'veldnamen zijn niet ingevuld in plaats van geraden — een verkeerde veldnaam ' +
        'levert stilzwijgend nul promoties op. Vul FIELD_BINDINGS in ' +
        '(src/services/promotions/prijsprofeet-adapter.ts) zodra er één echte respons ' +
        'beschikbaar is, of lever een momentopname aan die het contract uit ' +
        'PRIJSPROFEET_SNAPSHOT_SCHEMA.md volgt.',
    );
    this.name = 'PromotionSourceNotConfiguredError';
  }
}

/** True once every field a record needs has been bound. */
export function isConfigured(): boolean {
  return REQUIRED_FIELDS.every((field) => FIELD_BINDINGS[field] !== null);
}

export function unboundRequiredFields(): string[] {
  return REQUIRED_FIELDS.filter((field) => FIELD_BINDINGS[field] === null);
}

/** Follow a dotted path through an unknown object, without throwing. */
function at(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

/**
 * Turn one raw record into a snapshot record, using the bindings.
 *
 * Deliberately does no coercion beyond what the bindings say: a value that is
 * present but of the wrong shape is left as it is, so the schema validator
 * downstream reports it by path instead of this function quietly fixing it.
 */
export function bindRecord(raw: unknown): Record<string, unknown> {
  const bound: Record<string, unknown> = {};
  for (const [field, key] of Object.entries(FIELD_BINDINGS)) {
    if (key === null) continue;
    const value = at(raw, key);
    if (value !== undefined && value !== null) bound[field] = value;
  }
  return bound;
}

/**
 * A whole raw response, mapped and validated.
 *
 * Throws when the bindings are incomplete rather than returning an empty list.
 * An empty list is indistinguishable from "no promotions this week", and that
 * is precisely the failure the brief calls unacceptable.
 */
export function mapResponse(raw: unknown, sourceName = 'PrijsProfeet'): ExternalPromotion[] {
  const missing = unboundRequiredFields();
  if (missing.length > 0) throw new PromotionSourceNotConfiguredError(missing);

  const records = Array.isArray(raw) ? raw : at(raw, 'promotions');
  if (!Array.isArray(records)) {
    throw new Error(
      'De respons bevat geen lijst met promoties. Bind het pad naar de lijst in ' +
        'mapResponse voordat dit gebruikt wordt.',
    );
  }

  const validated = validateSnapshot(
    { source: sourceName, promotions: records.map(bindRecord) },
    '(respons)',
  );
  const list = Array.isArray(validated) ? validated : validated.promotions;
  return list.map((record) => toExternalPromotion(record, sourceName, new Date().toISOString()));
}

/**
 * One snapshot record as our boundary type.
 *
 * The only place the two vocabularies meet. Nothing is computed here — that is
 * `toCandidate`'s job — so that a reader can check this function against the
 * schema line by line.
 */
export function toExternalPromotion(
  record: PromotionRecord,
  sourceName: string,
  importedAt: string,
): ExternalPromotion {
  return {
    externalPromotionId: record.external_promotion_id,
    source: sourceName,
    chainId: record.retailer,
    ...(record.base_product_id ? { baseProductId: record.base_product_id } : {}),
    ...(record.retailer_product_id ? { retailerProductId: record.retailer_product_id } : {}),
    ...(record.external_product_id ? { externalProductId: record.external_product_id } : {}),
    ...(record.gtin ? { gtin: record.gtin } : {}),
    productName: record.product_name,
    ...(record.brand ? { brand: record.brand } : {}),
    ...(record.package_text ? { packageText: record.package_text } : {}),
    ...(record.regular_price !== undefined ? { regularPriceCents: record.regular_price } : {}),
    ...(record.current_price !== undefined ? { promotionalPriceCents: record.current_price } : {}),
    ...(record.unit_price !== undefined ? { unitPriceCents: record.unit_price } : {}),
    ...(record.promotion_type ? { promotionTypeCode: record.promotion_type } : {}),
    ...(record.promotion_text ? { promotionText: record.promotion_text } : {}),
    ...(record.promotion_status ? { promotionStatus: record.promotion_status } : {}),
    ...(record.is_active !== undefined ? { isActive: record.is_active } : {}),
    validFrom: record.valid_from,
    validUntil: record.valid_until,
    // The source's own timestamp when it has one, otherwise the moment we read
    // the file. Two different facts, and conflating them would let a month-old
    // export look fresh.
    fetchedAt: record.fetched_at ?? importedAt,
  };
}

export { PROMOTION_STATUSES, PROMOTION_TYPE_CODES, SUPPORTED_RETAILERS };
export type { PromotionRecord, SupportedRetailer };
