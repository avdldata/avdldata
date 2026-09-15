import { existsSync, readFileSync } from 'node:fs';
import { buildCrosswalk, eanIndex, stableIdIndex } from '@/services/identity/crosswalk';
import { toIdentityRecords } from '@/services/identity/prijsprofeet-identities';
import { validateSnapshot } from '@/services/promotions/snapshot-schema';
import type { ExternalIdentityRecord, IdentityCrosswalk } from '@/services/identity/types';
import type { ProductOffer } from '@/domain/stores/types';

/**
 * The identity crosswalk, built from whatever snapshots are on disk.
 *
 * One place, so the benchmark, the import report and the price comparison all
 * bridge the two catalogues the same way. A crosswalk that differs per caller
 * measures the caller.
 *
 * Both snapshots feed it. A shelf snapshot is the better source — it covers
 * products that are not in any folder — but a promotion snapshot carries the
 * same identity fields for the products that are, so the bridge works with
 * either and reports which it used.
 */

export const PROMOTION_SNAPSHOT_PATH = 'data/external/promotions-snapshot.json';
export const SHELF_SNAPSHOT_PATH = 'data/external/shelf-snapshot.json';

export interface LoadedCrosswalk {
  readonly crosswalks: readonly IdentityCrosswalk[];
  /** base_product_id per internal product id. */
  readonly stableIdByProduct: Map<string, string>;
  /** EAN per internal product id. */
  readonly gtinByProduct: Map<string, string>;
  readonly sources: readonly string[];
}

const read = (path: string) => readFileSync(path, 'utf8').replace(/^\uFEFF/, '');

/** Our own product URL per product id, from the Checkjebon snapshot. */
export function catalogueUrls(
  path = 'data/external/checkjebon-snapshot.json',
): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(path)) return map;
  const chains = JSON.parse(read(path)) as {
    n: string;
    u?: string;
    d: { l: string }[];
  }[];
  for (const chain of chains) {
    for (const product of chain.d) {
      map.set(`${chain.n}:${product.l}`, `${chain.u ?? ''}${product.l}`);
    }
  }
  return map;
}

export function loadCrosswalks(
  chains: readonly { chainId: string; allOffers: readonly ProductOffer[] }[],
): LoadedCrosswalk {
  const records: ExternalIdentityRecord[] = [];
  const sources: string[] = [];
  for (const [path, kinds] of [
    [SHELF_SNAPSHOT_PATH, ['shelf'] as const],
    [PROMOTION_SNAPSHOT_PATH, ['promotion'] as const],
  ] as const) {
    if (!existsSync(path)) continue;
    const validated = validateSnapshot(JSON.parse(read(path)), path);
    records.push(...toIdentityRecords(validated.records, { kinds: [...kinds] }));
    sources.push(path);
  }

  const urlByProduct = catalogueUrls();
  const importedAt = new Date().toISOString();
  const crosswalks = chains.map((chain) =>
    buildCrosswalk({
      chainId: chain.chainId,
      offers: chain.allOffers,
      urlByProduct,
      records,
      source: 'PRIJSPROFEET',
      sourceFile: sources.join(' + '),
      importedAt,
    }),
  );

  return {
    crosswalks,
    stableIdByProduct: stableIdIndex(crosswalks),
    gtinByProduct: eanIndex(crosswalks),
    sources,
  };
}
