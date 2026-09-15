import { importRecords, type ImportedSnapshot } from './prijsprofeet-adapter';
import { extractRetailerProductId } from './retailer-id';
import { validateSnapshot, type RecordUse } from './snapshot-schema';
import type { ExternalPromotion, ExternalShelfPrice } from './types';

/**
 * Reading `data/external/promotions-snapshot.json`.
 *
 * The development path while the live source is out of reach: an export is
 * dropped in as a file and the whole pipeline runs against it, identically to
 * how it would run against the API.
 *
 *     JSON snapshot → schema validation → classification → promotions
 *                   → product linking → promotion engine
 *                                     ↘ shelf prices → price validation only
 *
 * Three properties this insists on.
 *
 * **It fails loudly on drift.** A renamed field does not silently produce an
 * empty promotion set; it produces an error naming the record and the field.
 * The empty set is the dangerous outcome — everything keeps working and the
 * plan is simply never discounted — so it is the one outcome this refuses to
 * reach by accident.
 *
 * **A missing file is not an error.** No snapshot means no promotions, which is
 * a perfectly good state: the week plans at shelf prices. That is reported once,
 * clearly, and the caller carries on.
 *
 * **A record that is not a promotion is not a failure either.** The feed
 * carries shelf prices and historical price points alongside promotions. Those
 * are separated by kind, counted, and returned as their own type — not refused,
 * and above all not applied.
 */

export const DEFAULT_SNAPSHOT_PATH = 'data/external/promotions-snapshot.json';

export interface SnapshotLoadResult {
  readonly status: 'LOADED';
  readonly promotions: readonly ExternalPromotion[];
  /** Ordinary prices, for validating ours. Never a discount. */
  readonly shelfPrices: readonly ExternalShelfPrice[];
  readonly source: string;
  readonly sourceFile: string;
  /** When the source built the export, if it says. */
  readonly fetchedAt?: string;
  /** When we read it. Always known, and a different fact. */
  readonly importedAt: string;
  /** Records for retailers this phase does not cover. Skipped, not failed. */
  readonly skippedRetailers: Readonly<Record<string, number>>;
  /** What the file contained, by kind of record. */
  readonly byUse: Readonly<Record<RecordUse, number>>;
  readonly duplicatesDropped: number;
  /** Records in the file, before any filtering. */
  readonly total: number;
}

export interface SnapshotAbsent {
  readonly status: 'ABSENT';
  readonly sourceFile: string;
  readonly message: string;
}

export type SnapshotOutcome = SnapshotLoadResult | SnapshotAbsent;

export interface LoadOptions {
  /** Injected so this module never imports node:fs and stays portable. */
  readonly readFile: (path: string) => string;
  readonly exists: (path: string) => boolean;
  readonly now?: () => Date;
  /** Which chains to keep. Defaults to the two this phase covers. */
  readonly retailers?: readonly string[];
}

/**
 * Load and validate a promotion snapshot.
 *
 * Throws `SnapshotSchemaError` when the file is there but wrong — that is a
 * bug in the export and hiding it would be worse than stopping. Returns
 * `ABSENT` when the file is simply not there, which is not a bug.
 */
export function loadPrijsProfeetSnapshot(
  path: string = DEFAULT_SNAPSHOT_PATH,
  options: LoadOptions,
): SnapshotOutcome {
  if (!options.exists(path)) {
    return {
      status: 'ABSENT',
      sourceFile: path,
      message: `PrijsProfeet snapshot unavailable; continuing without promotions (${path})`,
    };
  }

  const importedAt = (options.now?.() ?? new Date()).toISOString();
  // A byte-order mark, stripped rather than tripped over. The real export is
  // produced on Windows and carries one; `JSON.parse` refuses it with a message
  // about an unexpected token that says nothing about what to do. It is not a
  // content difference, so it is not worth a failure.
  const text = options.readFile(path).replace(/^\uFEFF/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // Not a schema problem but a file problem, and worth saying so precisely.
    throw new Error(
      `Promotiemomentopname ${path} is geen geldige JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const validated = validateSnapshot(parsed, path);
  const imported: ImportedSnapshot = importRecords(validated.records, {
    source: validated.source,
    // The source's own timestamp when it has one, otherwise the moment we read
    // the file. Two different facts, and conflating them would let a month-old
    // export look fresh — which is why both are returned below.
    fetchedAt: validated.fetchedAt ?? importedAt,
    ...(options.retailers ? { retailers: options.retailers } : {}),
  });

  return {
    status: 'LOADED',
    promotions: imported.promotions,
    shelfPrices: imported.shelfPrices,
    source: imported.source,
    sourceFile: path,
    ...(validated.fetchedAt ? { fetchedAt: validated.fetchedAt } : {}),
    importedAt,
    skippedRetailers: imported.skippedRetailers,
    byUse: imported.byUse,
    duplicatesDropped: imported.duplicatesDropped,
    total: imported.total,
  };
}

/**
 * How many records carry each identity, per chain.
 *
 * The metric that decides the linking strategy, and the reason it is measured
 * rather than assumed: if stable ids are absent the tier order below it does
 * the work, and if none of the identities is present then name-and-package is
 * all there is and the review queue will be long.
 */
export interface IdentityCoverage {
  readonly retailer: string;
  readonly records: number;
  /** `base_product_id` — the identity that survives a folder change. */
  readonly withStableId: number;
  /** The retailer's own article number, read out of the product URL. */
  readonly withRetailerId: number;
  /** `ean` — product identity, usable across retailers. */
  readonly withGtin: number;
  /** `product_id` — per record, so counted separately from the rest. */
  readonly withProductId: number;
  readonly withPackage: number;
  readonly withRegularPrice: number;
  readonly withPromotionText: number;
  readonly withTypeCode: number;
  readonly active: number;
  readonly upcoming: number;
  readonly expired: number;
}

/** Count what a snapshot actually carries. Presence, never plausibility. */
export function identityCoverage(
  promotions: readonly ExternalPromotion[],
  onDate?: string,
): IdentityCoverage[] {
  const chains = [...new Set(promotions.map((p) => p.chainId))].sort();
  return chains.map((retailer) => {
    const rows = promotions.filter((p) => p.chainId === retailer);
    // Status is derived from the window against a date, not read from the
    // source's own flag: the flag was true when the export was built.
    const state = (promotion: ExternalPromotion): 'active' | 'upcoming' | 'expired' => {
      if (!onDate) return promotion.promotionStatus ?? 'active';
      if (promotion.validUntil && promotion.validUntil < onDate) return 'expired';
      if (promotion.validFrom && promotion.validFrom > onDate) return 'upcoming';
      return 'active';
    };
    return {
      retailer,
      records: rows.length,
      withStableId: rows.filter((p) => p.baseProductId).length,
      withRetailerId: rows.filter((p) => p.retailerProductId).length,
      withGtin: rows.filter((p) => p.gtin).length,
      withProductId: rows.filter((p) => p.externalProductId).length,
      withPackage: rows.filter((p) => p.packageText?.trim()).length,
      withRegularPrice: rows.filter((p) => p.regularPriceCents !== undefined).length,
      withPromotionText: rows.filter((p) => p.promotionText?.trim()).length,
      withTypeCode: rows.filter((p) => p.promotionTypeCode).length,
      active: rows.filter((p) => state(p) === 'active').length,
      upcoming: rows.filter((p) => state(p) === 'upcoming').length,
      expired: rows.filter((p) => state(p) === 'expired').length,
    };
  });
}

/**
 * How many shelf records carry each identity, per chain.
 *
 * Shelf prices are the enrichment path — an EAN or a pack size we did not have,
 * and a second opinion on a price — and all three depend on being able to tie
 * the record to one of our products. Same counting, separate table, because
 * mixing the two would make it impossible to tell which coverage figure a
 * promotion decision rests on.
 */
export interface ShelfCoverage {
  readonly retailer: string;
  readonly records: number;
  readonly withStableId: number;
  readonly withRetailerId: number;
  readonly withEan: number;
  readonly withProductId: number;
  readonly withPrice: number;
  readonly withPackage: number;
}

export function shelfCoverage(shelfPrices: readonly ExternalShelfPrice[]): ShelfCoverage[] {
  const chains = [...new Set(shelfPrices.map((p) => p.chainId))].sort();
  return chains.map((retailer) => {
    const rows = shelfPrices.filter((p) => p.chainId === retailer);
    return {
      retailer,
      records: rows.length,
      withStableId: rows.filter((p) => p.identity.baseProductId).length,
      // Recomputed from the URL rather than stored, because a shelf record is
      // never linked automatically and does not need the field carried around.
      // Counted as extractable, not as present: a URL we cannot read an article
      // number out of buys us nothing, so it must not appear as coverage.
      withRetailerId: rows.filter((p) => extractRetailerProductId(p.chainId, p.url)).length,
      withEan: rows.filter((p) => p.identity.ean).length,
      withProductId: rows.filter((p) => p.identity.productId).length,
      withPrice: rows.filter((p) => p.priceCents !== undefined).length,
      withPackage: rows.filter((p) => p.packageText?.trim()).length,
    };
  });
}
