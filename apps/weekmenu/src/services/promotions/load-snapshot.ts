import { toExternalPromotion } from './prijsprofeet-adapter';
import { validateSnapshot, SUPPORTED_RETAILERS } from './snapshot-schema';
import type { ExternalPromotion } from './types';

/**
 * Reading `data/external/promotions-snapshot.json`.
 *
 * The development path while the live source is out of reach: an export is
 * dropped in as a file and the whole pipeline runs against it, identically to
 * how it would run against the API.
 *
 *     JSON snapshot → schema validation → raw records → normalised promotions
 *                   → product linking → promotion engine
 *
 * Two properties this insists on.
 *
 * **It fails loudly.** A renamed field does not silently produce an empty
 * promotion set; it produces an error naming the record and the field. The
 * empty set is the dangerous outcome — everything keeps working and the plan is
 * simply never discounted — so it is the one outcome this refuses to reach by
 * accident.
 *
 * **A missing file is not an error.** No snapshot means no promotions, which is
 * a perfectly good state: the week plans at shelf prices. That is reported once,
 * clearly, and the caller carries on.
 */

export const DEFAULT_SNAPSHOT_PATH = 'data/external/promotions-snapshot.json';

export interface SnapshotLoadResult {
  readonly status: 'LOADED';
  readonly promotions: readonly ExternalPromotion[];
  readonly source: string;
  readonly sourceFile: string;
  /** When the source built the export, if it says. */
  readonly fetchedAt?: string;
  /** When we read it. Always known, and a different fact. */
  readonly importedAt: string;
  /** Records for retailers this phase does not cover. Skipped, not failed. */
  readonly skippedRetailers: Readonly<Record<string, number>>;
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
  const text = options.readFile(path);

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
  const wrapped = Array.isArray(validated)
    ? { source: 'PRIJSPROFEET', promotions: validated, fetched_at: undefined }
    : validated;

  const wanted = new Set(options.retailers ?? SUPPORTED_RETAILERS);
  const skipped: Record<string, number> = {};
  const promotions: ExternalPromotion[] = [];

  for (const record of wrapped.promotions) {
    if (!wanted.has(record.retailer)) {
      skipped[record.retailer] = (skipped[record.retailer] ?? 0) + 1;
      continue;
    }
    promotions.push(toExternalPromotion(record, wrapped.source, importedAt));
  }

  return {
    status: 'LOADED',
    promotions,
    source: wrapped.source,
    sourceFile: path,
    ...(wrapped.fetched_at ? { fetchedAt: wrapped.fetched_at } : {}),
    importedAt,
    skippedRetailers: skipped,
  };
}

/**
 * How many records carry each identity, per chain.
 *
 * The metric that decides the linking strategy, and the reason it is measured
 * rather than assumed: if stable ids are absent the tier order below it does
 * the work, and if none of the three is present then name-and-package is all
 * there is and the review queue will be long.
 */
export interface IdentityCoverage {
  readonly retailer: string;
  readonly records: number;
  readonly withStableId: number;
  readonly withRetailerId: number;
  readonly withGtin: number;
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
      withRetailerId: rows.filter((p) => p.retailerProductId ?? p.externalProductId).length,
      withGtin: rows.filter((p) => p.gtin).length,
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
