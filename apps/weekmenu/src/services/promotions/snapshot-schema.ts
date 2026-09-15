import { z } from 'zod';

/**
 * The PrijsProfeet record, in PrijsProfeet's own field names.
 *
 * These are the verified official names, so a raw export validates as it comes
 * out of the API: no hand-written transformation step, no second vocabulary to
 * keep in sync. That was the whole reason the earlier version of this file used
 * our own names — the spec could not be read from this environment — and it is
 * no longer necessary.
 *
 * ## What is required, and why so little
 *
 * Only `retailer` and `name`. Everything else is optional, because the feed
 * carries four different kinds of record and they legitimately differ:
 *
 *   active / upcoming   a promotion, with a window
 *   shelf               today's ordinary price, with no window at all and
 *                       sometimes no `product_id` either
 *   historical          a past price point, never applied to a basket
 *
 * A schema that demanded a validity window would reject every shelf record, and
 * one that demanded `product_id` would reject the shelf records that carry only
 * an EAN. Neither is drift; both are the feed working normally.
 *
 * ## What is still strict
 *
 * `.strict()` stays. An unknown key is refused, because a renamed field usually
 * arrives alongside a missing one, and a promotion set that is silently empty is
 * the failure this whole layer exists to prevent. Types are enforced on every
 * field that *is* present: a date that is not a date and a price that is not a
 * price are errors, never coerced and never treated as zero.
 *
 * Whether a record can actually be used is decided after validation, by
 * classification — see `classifyRecord`. That keeps "the feed is malformed"
 * apart from "this record is not a promotion", which are different problems
 * with different fixes.
 */

/** ISO date, yyyy-mm-dd. Anything else is drift, not a value to coerce. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'verwacht een ISO-datum yyyy-mm-dd');

/** A timestamp; the feed uses these for `price_changed_at`. */
const isoDateTime = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), 'verwacht een ISO-tijdstempel');

/**
 * Money as the source states it, converted to integer cents at the boundary.
 *
 * Accepts a number of euros or a string. A value that cannot be read as money
 * is an error and never a zero: a promotion priced at zero would be free.
 */
const euroAmount = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const text = String(value).replace(/[€\s]/g, '').replace(',', '.');
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) {
    ctx.addIssue({ code: 'custom', message: `"${String(value)}" is geen bedrag` });
    return z.NEVER;
  }
  return Math.round(parsed * 100);
});

/** The two chains this phase covers. Others are counted and skipped, not failed. */
export const SUPPORTED_RETAILERS = ['ah', 'jumbo'] as const;
export type SupportedRetailer = (typeof SUPPORTED_RETAILERS)[number];

/**
 * The four statuses the feed publishes, and what each means for us.
 *
 *   active       a promotion running now
 *   upcoming     a promotion that starts later — usable, because a week planned
 *                on Sunday is shopped later, and that is the whole reason for
 *                fetching these
 *   shelf        today's ordinary price, no promotion. Usable for price
 *                validation and enrichment, never as a discount.
 *   historical   a past price point. Never applied to a basket, in any form.
 */
export const PROMOTION_STATUSES = ['active', 'upcoming', 'historical', 'shelf'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

/**
 * Promotion type codes.
 *
 * The three named ones are the official concepts. Anything else the feed sends
 * is kept verbatim rather than rejected — an unrecognised code is not a schema
 * error, it simply means the text parser decides. Refusing it would turn a new
 * promotion kind into a broken import.
 */
export const KNOWN_PROMOTION_TYPES = ['percentage', 'multi_buy', 'one_plus_one'] as const;
export type KnownPromotionType = (typeof KNOWN_PROMOTION_TYPES)[number];

export const prijsProfeetRecordSchema = z
  .object({
    /**
     * The retailer's product id for this record.
     *
     * Nullable on purpose. Shelf records may carry no `product_id` while still
     * carrying an EAN, a price and a URL, and dropping those would throw away
     * exactly the records that are useful for price validation. It also changes
     * per promotion week at some chains, which is why it is never the identity
     * we link on when `base_product_id` is there.
     */
    product_id: z.string().min(1).nullable().optional(),
    /** The stable, chain-internal key. The one to link on. */
    base_product_id: z.string().min(1).nullable().optional(),
    retailer: z.string().min(1),
    name: z.string().min(1),
    /** Product identity across retailers. Not offer identity — see the docs. */
    ean: z.string().min(6).nullable().optional(),
    /** Pack size as text, parsed by the same parser the catalogue uses. */
    quantity: z.string().nullable().optional(),

    /** The price in this record: the action price when there is one. */
    price: euroAmount.nullable().optional(),
    /** The "from" price, when the record states one. */
    original_price: euroAmount.nullable().optional(),
    /** Per kilo or litre. Display, validation and sanity checks only. */
    unit_price: euroAmount.nullable().optional(),

    /** Supplementary source information, never our only validity rule. */
    is_current_deal: z.boolean().nullable().optional(),
    promotion_status: z.enum(PROMOTION_STATUSES).nullable().optional(),
    promotion_type: z.string().min(1).nullable().optional(),
    /** Shelf text; the parser takes the numbers out of it. */
    promotion_text: z.string().nullable().optional(),

    valid_from: isoDate.nullable().optional(),
    valid_until: isoDate.nullable().optional(),

    url: z.string().min(1).nullable().optional(),
    price_changed_at: isoDateTime.nullable().optional(),
  })
  .strict();

export type PrijsProfeetRecord = z.infer<typeof prijsProfeetRecordSchema>;

/**
 * The snapshot file.
 *
 * A bare array of records is the plain case. The wrapped form adds provenance
 * the array cannot carry, and is preferred for that reason.
 */
export const wrappedSnapshotSchema = z
  .object({
    source: z.string().min(1).default('PRIJSPROFEET'),
    fetched_at: isoDateTime.optional(),
    /** Either key is accepted; the feed calls them results, we call them promotions. */
    promotions: z.array(prijsProfeetRecordSchema).optional(),
    results: z.array(prijsProfeetRecordSchema).optional(),
  })
  .strict()
  .refine(
    (value) => value.promotions !== undefined || value.results !== undefined,
    'verwacht een "promotions"- of "results"-lijst',
  );

export const bareSnapshotSchema = z.array(prijsProfeetRecordSchema);

export interface NormalisedSnapshot {
  readonly source: string;
  readonly fetchedAt?: string;
  readonly records: readonly PrijsProfeetRecord[];
}

/**
 * Why a record cannot be used as a promotion.
 *
 * Separate from schema failure on purpose: a shelf record is perfectly valid
 * data that simply is not a discount, and conflating the two would either
 * reject good data or hide bad data.
 */
export type RecordUse =
  /** A promotion we can price, once it is linked and in window. */
  | 'PROMOTION'
  /** Today's ordinary price. Useful for validating ours; never a discount. */
  | 'SHELF_PRICE'
  /** A past price point. Never applied. */
  | 'HISTORICAL'
  /** Marked as a promotion but with no window, so it can never be dated. */
  | 'PROMOTION_WITHOUT_WINDOW'
  /** No identity at all: no base id, no product id, no EAN. */
  | 'NO_IDENTITY';

/**
 * What a record is for.
 *
 * Status leads, because the feed states it. Where status is absent the window
 * decides, which is the same rule the rest of the system uses: dates over flags.
 */
export function classifyRecord(record: PrijsProfeetRecord): RecordUse {
  const hasIdentity = Boolean(record.base_product_id ?? record.product_id ?? record.ean);
  if (!hasIdentity) return 'NO_IDENTITY';

  const status = record.promotion_status ?? undefined;
  if (status === 'historical') return 'HISTORICAL';
  if (status === 'shelf') return 'SHELF_PRICE';

  const hasWindow = Boolean(record.valid_from && record.valid_until);
  if (status === 'active' || status === 'upcoming') {
    return hasWindow ? 'PROMOTION' : 'PROMOTION_WITHOUT_WINDOW';
  }

  // No status stated. A window makes it a promotion; its absence makes it a
  // shelf price, which is the conservative reading — treating an undated
  // record as a discount would apply it to every week forever.
  return hasWindow ? 'PROMOTION' : 'SHELF_PRICE';
}

/**
 * A stable external record id.
 *
 * The feed has no promotion id of its own, so one is derived from the parts
 * that identify the record: the retailer, the best identity available, and the
 * window. Deterministic, so re-importing the same export twice de-duplicates
 * instead of doubling, and so a record keeps its id between imports.
 */
export function recordId(record: PrijsProfeetRecord): string {
  const identity = record.base_product_id ?? record.product_id ?? record.ean ?? record.name;
  const window = record.valid_from ? `${record.valid_from}..${record.valid_until ?? ''}` : 'shelf';
  return `${record.retailer}:${identity}:${window}`;
}

export class SnapshotSchemaError extends Error {
  constructor(
    readonly path: string,
    readonly issues: readonly { path: string; message: string }[],
  ) {
    const shown = issues
      .slice(0, 12)
      .map((issue) => `  ${issue.path || '(root)'}: ${issue.message}`)
      .join('\n');
    const more = issues.length > 12 ? `\n  ... en nog ${issues.length - 12}` : '';
    super(
      `Promotiemomentopname ${path} voldoet niet aan het schema:\n${shown}${more}\n\n` +
        'Records worden niet stilzwijgend overgeslagen: een lege promotieset door een ' +
        'hernoemd veld is precies de fout die niemand opmerkt. Zie ' +
        'PRIJSPROFEET_SNAPSHOT_SCHEMA.md voor het contract.',
    );
    this.name = 'SnapshotSchemaError';
  }
}

/**
 * Validate a parsed JSON value, or throw with the exact paths that failed.
 *
 * The shape is decided before validating rather than by trying both and
 * unioning the errors. A union reports "invalid input" at the root when both
 * branches fail, which is precisely the useless message this module exists to
 * avoid: the caller needs `results.41.price`, not "invalid".
 */
export function validateSnapshot(raw: unknown, path: string): NormalisedSnapshot {
  const wrapped = raw !== null && typeof raw === 'object' && !Array.isArray(raw);
  const schema = Array.isArray(raw)
    ? bareSnapshotSchema
    : wrapped
      ? wrappedSnapshotSchema
      : undefined;

  if (!schema) {
    throw new SnapshotSchemaError(path, [
      {
        path: '(root)',
        message: 'verwacht een lijst met records, of een object met een "results"-lijst',
      },
    ]);
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new SnapshotSchemaError(
      path,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  if (Array.isArray(result.data)) {
    return { source: 'PRIJSPROFEET', records: result.data };
  }
  const data = result.data;
  return {
    source: data.source,
    ...(data.fetched_at ? { fetchedAt: data.fetched_at } : {}),
    records: data.results ?? data.promotions ?? [],
  };
}
