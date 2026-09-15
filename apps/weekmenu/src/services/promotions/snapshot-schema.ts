import { z } from 'zod';

/**
 * The contract for `data/external/promotions-snapshot.json`.
 *
 * ## What this is, and what it is not
 *
 * These field names are **ours**. The official PrijsProfeet OpenAPI document
 * could not be read from this environment — the same egress policy that blocks
 * the API blocks its documentation, and no mirror was reachable either (see
 * PRIJSPROFEET_INTEGRATION.md). Naming a field here after a concept the brief
 * asked for is a description of our own file format; presenting it as the
 * upstream API's spelling would be an invention, and the brief rightly forbids
 * that.
 *
 * So the snapshot file is a **normalised handover format**. Whoever exports
 * from PrijsProfeet binds their field names to these once, in
 * `FIELD_BINDINGS` (see `prijsprofeet-adapter.ts`), and everything downstream is
 * already built and tested.
 *
 * Two names below are exceptions, and they are marked as such: `base_product_id`
 * and the promotion type codes (`one_plus_one`, `multi_buy`, `percentage`) come
 * from the brief itself, so they are accepted verbatim as input spellings.
 *
 * ## Why it is strict
 *
 * An empty promotion set caused by a renamed field is the worst possible
 * failure: everything keeps working, the plan is simply never discounted, and
 * nobody notices. So the schema refuses unknown shapes rather than skipping
 * records, and every rejection names the record index and the field path.
 */

/** ISO date, yyyy-mm-dd. Anything else is a drift signal, not a value to coerce. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'verwacht een ISO-datum yyyy-mm-dd');

const isoDateTime = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), 'verwacht een ISO-tijdstempel');

/**
 * Money as the source states it.
 *
 * Accepts a number of euros or a string, and converts to integer cents at the
 * boundary — money is integer cents everywhere inside this system. A value that
 * cannot be read as money is an error, never a zero: a promotion priced at zero
 * would be free.
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

/**
 * Which retailer. Only the two chains this phase covers are recognised;
 * anything else is skipped by the loader with a count, not an error, because a
 * feed carrying every Dutch chain is normal and not a defect.
 */
export const SUPPORTED_RETAILERS = ['ah', 'jumbo'] as const;
export type SupportedRetailer = (typeof SUPPORTED_RETAILERS)[number];

/**
 * Promotion type codes.
 *
 * The five on the left are the spellings the brief supplies; they are accepted
 * verbatim. `unknown` is what an exporter should write when the source states a
 * type it cannot classify — better an explicit unknown than a guess, and the
 * text parser then gets its turn.
 */
export const PROMOTION_TYPE_CODES = [
  'one_plus_one',
  'multi_buy',
  'percentage',
  'fixed_price',
  'nth_discount',
  'unknown',
] as const;
export type PromotionTypeCode = (typeof PROMOTION_TYPE_CODES)[number];

/** Where a promotion sits relative to its own window, as the source sees it. */
export const PROMOTION_STATUSES = ['active', 'upcoming', 'expired'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

/**
 * One record in the snapshot.
 *
 * Required: only what makes a record usable at all. A promotion without an
 * identity cannot be linked, one without a window cannot be applied to a
 * shopping date, and one without a retailer belongs to nobody. Everything else
 * is optional because a source may genuinely not have it — and an absent field
 * stays absent rather than becoming a default, because a missing GTIN is not an
 * empty GTIN and a missing regular price is not zero.
 */
export const promotionRecordSchema = z
  .object({
    /** The source's own id for this record. May change between folder weeks. */
    external_promotion_id: z.string().min(1),
    retailer: z.enum(SUPPORTED_RETAILERS),

    /**
     * The stable identity, preferred over everything else for linking.
     *
     * Spelled as the brief spells it. PrijsProfeet product ids can change per
     * promotion period, so a record that carries this is worth far more than
     * one that only carries a per-period id.
     */
    base_product_id: z.string().min(1).optional(),
    /** The retailer's own article number, if the source passes it through. */
    retailer_product_id: z.string().min(1).optional(),
    /** The source's per-period product id. Record identity, never product identity. */
    external_product_id: z.string().min(1).optional(),
    gtin: z.string().min(6).optional(),

    product_name: z.string().min(1),
    brand: z.string().min(1).optional(),
    /** Pack size as text, parsed by the same parser the catalogue uses. */
    package_text: z.string().optional(),

    current_price: euroAmount.optional(),
    regular_price: euroAmount.optional(),
    /** Price per kilo/litre as the source states it. Display only, never priced against. */
    unit_price: euroAmount.optional(),

    promotion_status: z.enum(PROMOTION_STATUSES).optional(),
    promotion_type: z.enum(PROMOTION_TYPE_CODES).optional(),
    promotion_text: z.string().optional(),

    valid_from: isoDate,
    valid_until: isoDate,
    /** The source's own "this is live" flag, kept but never trusted over the dates. */
    is_active: z.boolean().optional(),

    fetched_at: isoDateTime.optional(),
  })
  .strict();

export type PromotionRecord = z.infer<typeof promotionRecordSchema>;

/**
 * The snapshot file.
 *
 * A bare array is accepted too, because that is what a first hand-made export
 * usually looks like and refusing it would cost a round trip for nothing. The
 * wrapped form is preferred: it carries provenance that a bare array cannot.
 */
export const wrappedSnapshotSchema = z
  .object({
    source: z.string().min(1).default('PRIJSPROFEET'),
    fetched_at: isoDateTime.optional(),
    promotions: z.array(promotionRecordSchema),
  })
  .strict();

export const bareSnapshotSchema = z.array(promotionRecordSchema);

export type SnapshotFile =
  z.infer<typeof wrappedSnapshotSchema> | z.infer<typeof bareSnapshotSchema>;

/**
 * A validation failure, described well enough to fix without guessing.
 *
 * The record index and the field path are the whole point: "expected string at
 * promotions[41].product_name, received null" is actionable, and "invalid
 * snapshot" is not.
 */
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
 * The shape is decided *before* validating rather than by trying both and
 * unioning the errors. A union reports "invalid input" at the root when both
 * branches fail, which is precisely the useless message this module exists to
 * avoid: the caller needs "promotions[41].current_price", not "invalid".
 */
export function validateSnapshot(raw: unknown, path: string): SnapshotFile {
  const schema = Array.isArray(raw)
    ? bareSnapshotSchema
    : raw !== null && typeof raw === 'object' && 'promotions' in raw
      ? wrappedSnapshotSchema
      : undefined;

  if (!schema) {
    throw new SnapshotSchemaError(path, [
      {
        path: '(root)',
        message: 'verwacht een lijst met promoties, of een object met een "promotions"-lijst',
      },
    ]);
  }

  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new SnapshotSchemaError(
    path,
    result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  );
}
