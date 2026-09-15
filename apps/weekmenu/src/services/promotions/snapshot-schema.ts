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

/** A list of short strings, e.g. `promotional_keywords` and `dietary_tags`. */
const stringList = z.array(z.string()).nullable().optional();

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

    /**
     * The product page.
     *
     * Two spellings are accepted. The documentation calls it `url`; the actual
     * export calls it `product_url`. Both are here rather than one being
     * "corrected" into the other, because we have seen the second and been told
     * the first, and guessing which the next endpoint uses would cost the
     * retailer article number — the identity tier 1 depends on.
     */
    url: z.string().min(1).nullable().optional(),
    product_url: z.string().min(1).nullable().optional(),
    price_changed_at: isoDateTime.nullable().optional(),
    /** When the export was scraped. The real feed's name for the same idea. */
    extracted_at: isoDateTime.nullable().optional(),

    /*
     * Everything below is in the real export but not in the field list the
     * documentation gave us. It is kept, not dropped: `.strict()` would refuse
     * the whole file otherwise, and refusing a field is not the same as it not
     * existing. Most of it is provenance and display; two of them are load-
     * bearing and are marked as such.
     */

    /** Load-bearing: the shelf text lives here, as a list. See `promotionTexts`. */
    promotional_keywords: stringList,
    /** Load-bearing: the real feed's name for `is_current_deal`. */
    is_promotional: z.boolean().nullable().optional(),

    brand: z.string().nullable().optional(),
    image_url: z.string().nullable().optional(),
    /**
     * The source's own headline percentage.
     *
     * Provenance only, never priced. For a 1+1 record it says 50, which is the
     * effective rate across two packs and not a discount on one — pricing a
     * single pack off it would halve a price the till will charge in full.
     */
    discount_percentage: z.number().nullable().optional(),
    savings_amount: euroAmount.nullable().optional(),
    savings_percentage: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
    /** The unit `unit_price` is expressed in ("L", "kg"). Display only. */
    unit: z.string().nullable().optional(),
    retailer_category: z.string().nullable().optional(),
    unified_category: z.string().nullable().optional(),
    dietary_tags: stringList,
    private_label: z.boolean().nullable().optional(),
    nutriscore: z.string().nullable().optional(),
    /** Which folder the offer came from, and where in it. Provenance. */
    folder_id: z.string().nullable().optional(),
    page_number: z.number().nullable().optional(),
  })
  .strict();

/**
 * The shelf texts on a record, in the order the source lists them.
 *
 * The documented field is `promotion_text`, a single string. The real export
 * has `promotional_keywords`, a list — and the list is not a list of synonyms:
 * it mixes the mechanism ("2 voor 5.99") with things that are not one at all
 * ("Gratis bezorging bij 15 euro", "BONUS"). Both are returned, unfiltered.
 * Deciding which of them prices anything belongs to the parser, which can say
 * "none of these", and not to the schema, which cannot.
 */
export function promotionTexts(record: PrijsProfeetRecord): string[] {
  const texts = [...(record.promotional_keywords ?? [])];
  if (record.promotion_text) texts.push(record.promotion_text);
  return texts.map((text) => text.trim()).filter((text) => text !== '');
}

/** The product page, whichever of the two spellings the export uses. */
export function productUrl(record: PrijsProfeetRecord): string | undefined {
  return record.product_url ?? record.url ?? undefined;
}

/** The source's "this is live now" flag, whichever spelling it arrives under. */
export function isCurrentDeal(record: PrijsProfeetRecord): boolean | undefined {
  return record.is_promotional ?? record.is_current_deal ?? undefined;
}

/** When the source last touched this record. */
export function observedAt(record: PrijsProfeetRecord): string | undefined {
  return record.extracted_at ?? record.price_changed_at ?? undefined;
}

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
    /**
     * Three accepted keys for the same list.
     *
     * `products` is what the real export writes; the other two are what the
     * documentation and our own earlier contract used. Accepting all three costs
     * one line and removes a whole class of "zero promotions and no error".
     */
    products: z.array(prijsProfeetRecordSchema).optional(),
    promotions: z.array(prijsProfeetRecordSchema).optional(),
    results: z.array(prijsProfeetRecordSchema).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.products !== undefined || value.promotions !== undefined || value.results !== undefined,
    'verwacht een "products"-, "promotions"- of "results"-lijst',
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
        message: 'verwacht een lijst met records, of een object met een "products"-lijst',
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
    records: data.products ?? data.results ?? data.promotions ?? [],
  };
}
