import 'server-only';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { Promotion } from '@/domain/stores/types';
import { loadPrijsProfeetSnapshot } from '@/services/promotions/load-snapshot';
import { isUsableWindow, toCandidate } from '@/services/promotions/link-promotions';
import { extractRetailerProductId } from '@/services/promotions/retailer-id';

/**
 * Real promotions, joined to the real catalogue on the shop's own article
 * number and on nothing else.
 *
 * ## Why only that one join
 *
 * Every text rule this file depends on — "2e halve prijs" beating a wrong type
 * code, "25 % volume voordeel" not being a flat percentage, a per-100-gram
 * price not being a pack price — already lives in `toCandidate`, and is reused
 * here rather than restated. What this module adds is the link to a product,
 * and there the tier is the strictest one available: the retailer's own article
 * id, quoted by both sides.
 *
 * Name matching is deliberately absent. A promotion attached to the wrong pack
 * makes the plan cheaper than the till and changes what gets bought, and
 * neither announces itself.
 *
 * Lidl is not excluded by rule but by data: its catalogue identity is a bare
 * number that the article extractor refuses, and the snapshot carries no Lidl
 * promotions to link to anyway.
 */

/** Overridable for the same reason as the price snapshot; see that comment. */
const PROMOTION_SNAPSHOT =
  process.env.WEEKMENU_PROMOTION_SNAPSHOT ?? 'data/external/promotions-snapshot.json';

export interface RealPromotionResult {
  readonly promotions: readonly Promotion[];
  /** When the promotion snapshot was captured. Absent when there is none. */
  readonly capturedAt?: string;
  /** Why there are none, when there are none. Never silently empty. */
  readonly unavailableReason?: string;
  /** Records the snapshot held, for the report. */
  readonly considered: number;
  /** Dropped because the type or the text could not be read safely. */
  readonly unsupported: number;
  /** Dropped because no product carried that article number. */
  readonly unlinked: number;
}

const EMPTY: RealPromotionResult = {
  promotions: [],
  considered: 0,
  unsupported: 0,
  unlinked: 0,
};

export function realPromotionsCapturedAt(path = PROMOTION_SNAPSHOT): string | undefined {
  return existsSync(path) ? statSync(path).mtime.toISOString() : undefined;
}

/**
 * The promotions that apply to this catalogue on this shopping date.
 *
 * A missing or unreadable snapshot returns an empty result with a reason, never
 * an exception: a week priced without promotions is slightly more expensive and
 * entirely correct, so losing the folder must not stop someone cooking.
 */
export function loadRealPromotions(input: {
  readonly onDate: string;
  readonly chainIds?: readonly string[];
  readonly retailerIdByProduct: ReadonlyMap<string, string>;
  readonly path?: string;
}): RealPromotionResult {
  const path = input.path ?? PROMOTION_SNAPSHOT;
  if (!existsSync(path)) {
    return { ...EMPTY, unavailableReason: `geen aanbiedingenmomentopname (${path})` };
  }

  let snapshot;
  try {
    snapshot = loadPrijsProfeetSnapshot(path, {
      readFile: (file) => readFileSync(file, 'utf8'),
      exists: existsSync,
    });
  } catch (error) {
    // A malformed folder is a reason to plan without one, not to fail.
    return {
      ...EMPTY,
      unavailableReason: `aanbiedingen onleesbaar: ${(error as Error).message.slice(0, 120)}`,
    };
  }
  if (snapshot.status !== 'LOADED') {
    return { ...EMPTY, unavailableReason: snapshot.message };
  }

  // article number → our product id, per chain, so a Jumbo article can never
  // match an Albert Heijn product.
  const productByArticle = new Map<string, string>();
  for (const [productId, article] of input.retailerIdByProduct) {
    const chainId = productId.slice(0, productId.indexOf(':'));
    productByArticle.set(`${chainId}:${article}`, productId);
  }

  const wanted = input.chainIds && input.chainIds.length > 0 ? new Set(input.chainIds) : undefined;
  const promotions: Promotion[] = [];
  const seen = new Set<string>();
  let unsupported = 0;
  let unlinked = 0;

  for (const external of snapshot.promotions) {
    if (wanted && !wanted.has(external.chainId)) continue;
    const candidate = toCandidate(external);

    // An unreadable mechanic is skipped, never approximated.
    if (!candidate.params) {
      unsupported += 1;
      continue;
    }
    if (!isUsableWindow(candidate)) {
      unsupported += 1;
      continue;
    }
    // The shopping date decides, not the source's own "is this live" flag.
    if (input.onDate < candidate.validFrom || input.onDate > candidate.validUntil) continue;

    const article =
      extractRetailerProductId(external.chainId, external.retailerProductId) ??
      extractRetailerProductId(external.chainId, external.url);
    if (!article) {
      unlinked += 1;
      continue;
    }
    const productId = productByArticle.get(`${external.chainId}:${article.id.toLowerCase()}`);
    if (!productId) {
      unlinked += 1;
      continue;
    }

    // One promotion per product: two folder lines for the same article would
    // otherwise both apply.
    if (seen.has(productId)) continue;
    seen.add(productId);

    promotions.push({
      id: `${candidate.source}:${candidate.externalPromotionId}`,
      productId,
      scope: { kind: 'chain', chainId: external.chainId },
      params: candidate.params,
      minUnits: minUnitsFor(candidate.params),
      validFrom: candidate.validFrom,
      validUntil: candidate.validUntil,
      label: candidate.originalText || 'Aanbieding',
      source: 'folder',
    });
  }

  return {
    promotions,
    ...(realPromotionsCapturedAt(path) ? { capturedAt: realPromotionsCapturedAt(path)! } : {}),
    considered: snapshot.promotions.length,
    unsupported,
    unlinked,
  };
}

/**
 * How many packs you must buy before the offer means anything.
 *
 * A bundle of three does nothing at two packs, and "2e halve prijs" does
 * nothing at one. Getting this wrong in the lenient direction would price a
 * single pack at the bundle rate.
 */
function minUnitsFor(params: Promotion['params']): number {
  switch (params.type) {
    case 'ONE_PLUS_ONE':
      return 2;
    case 'N_FOR_X':
      return params.bundleSize;
    case 'BUY_NTH_DISCOUNT':
      return params.nth;
    default:
      return 1;
  }
}
