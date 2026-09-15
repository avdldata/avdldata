import { existsSync, readFileSync } from 'node:fs';
import {
  DEFAULT_SNAPSHOT_PATH,
  loadPrijsProfeetSnapshot,
  type SnapshotOutcome,
} from '@/services/promotions/load-snapshot';
import { extractRetailerProductId } from '@/services/promotions/retailer-id';
import type { ProductOffer } from '@/domain/stores/types';

/**
 * One place where the snapshot is read from disk.
 *
 * The loader itself takes its file access as arguments so it stays portable and
 * testable; this is the thin binding to the real filesystem, shared by every
 * script and test so they all read the same file the same way.
 */

export function loadSnapshotFromDisk(path = DEFAULT_SNAPSHOT_PATH): SnapshotOutcome {
  return loadPrijsProfeetSnapshot(path, {
    readFile: (file) => readFileSync(file, 'utf8'),
    exists: (file) => existsSync(file),
  });
}

export function snapshotPresent(path = DEFAULT_SNAPSHOT_PATH): boolean {
  return existsSync(path);
}

/**
 * The retailer article number for each of our own offers.
 *
 * Derived from the Checkjebon slug, which carries it for 100 % of products in
 * both chains. Built once and shared, because every linking call needs it and
 * recomputing it per call would be the same work thirty times over.
 */
export function retailerIdIndex(
  chains: readonly {
    chainId: string;
    allOffers?: readonly ProductOffer[];
    reducedOffers: readonly ProductOffer[];
  }[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const chain of chains) {
    // Indexed over every matched offer, not only the ones that survived
    // candidate reduction. The index is keyed by product id, so a superset
    // costs nothing — and linking against the reduced set only would hide
    // promotions on products that reduction dropped at shelf price.
    for (const offer of chain.allOffers ?? chain.reducedOffers) {
      const id = extractRetailerProductId(
        chain.chainId,
        offer.productId.slice(chain.chainId.length + 1),
      );
      if (id) index.set(offer.productId, id.id);
    }
  }
  return index;
}
