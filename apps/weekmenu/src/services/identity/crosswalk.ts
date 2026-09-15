import { normalise } from '@/domain/ingestion/match-ingredient';
import { resolvePackage } from '@/domain/ingestion/package-parser';
import type { ProductOffer } from '@/domain/stores/types';
import { extractRetailerProductId } from '@/services/promotions/retailer-id';
import {
  isAutoApproved,
  type ExternalIdentityRecord,
  type ExternalRetailIdentity,
  type IdentityCrosswalk,
  type IdentityMatchMethod,
} from './types';

/**
 * Building the bridge between our catalogue and an external source.
 *
 * Four tiers, each an equality test on something both sides state, and a fifth
 * that is never applied:
 *
 *   RETAILER_ARTICLE_ID  the shop's own number, complete
 *   RETAILER_URL         the product URL path, identical
 *   EAN                  a barcode both sides carry and agree on
 *   NAME_PACKAGE         normalised name identical AND package identical
 *   NEEDS_REVIEW         everything else
 *
 * Three rules make this stricter than ingredient matching, and all three exist
 * because an identity link is durable in a way an ingredient match is not.
 *
 * **No numeric fallback.** Jumbo's trailing packaging code separates a pack
 * from the case it ships in: `74004PAK` is 2,4 litres of milk at € 2,69 and
 * `74004DSL` is four of them at € 10,76. 730 Jumbo products — 4,2 % — share a
 * number with a different code. Comparing without it produced a real mislink in
 * the first promotion snapshot, and here it would be worse: a wrong barcode
 * written into the crosswalk misdirects every future promotion quoting it.
 *
 * **Ambiguity is refused, never resolved.** If two of our products fit one
 * external record equally well, neither is linked. One of them would be right,
 * and there is no way to tell which, so a coin toss would be a wrong link half
 * the time and look like coverage all of the time.
 *
 * **Disagreement is refused too.** If two external records claim the same
 * product with different barcodes, both are dropped. A second barcode for one
 * article means one of them is wrong.
 */

const CONFIDENCE: Readonly<Record<IdentityMatchMethod, number>> = {
  RETAILER_ARTICLE_ID: 1,
  RETAILER_URL: 1,
  EAN: 1,
  NAME_PACKAGE: 0.9,
  NEEDS_REVIEW: 0,
};

export interface CrosswalkInput {
  readonly chainId: string;
  /** Our products for this chain. */
  readonly offers: readonly ProductOffer[];
  /** Our product URL per product id, when the catalogue carries one. */
  readonly urlByProduct?: ReadonlyMap<string, string>;
  /** The external records to bridge to. */
  readonly records: readonly ExternalIdentityRecord[];
  readonly source: string;
  readonly sourceFile?: string;
  readonly importedAt: string;
}

/** Everything after the last slash, lowercased. The part that identifies. */
function urlKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const path = url
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  if (path === '') return undefined;
  return path.toLowerCase();
}

function normaliseEan(ean: string): string {
  return ean.replace(/\D/g, '').replace(/^0+/, '');
}

/** Group values by key, so "exactly one" and "more than one" stay separable. */
function index<T>(items: readonly T[], key: (item: T) => string | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === undefined || k === '') continue;
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function buildCrosswalk(input: CrosswalkInput): IdentityCrosswalk {
  const offers = input.offers.filter((o) => o.chainId === input.chainId);
  const records = input.records.filter((r) => r.retailer === input.chainId);

  const articleOf = (offer: ProductOffer): string | undefined =>
    extractRetailerProductId(
      input.chainId,
      offer.productId.slice(input.chainId.length + 1),
    )?.id.toLowerCase();

  const byArticle = index(offers, articleOf);
  const byUrl = index(offers, (o) => urlKey(input.urlByProduct?.get(o.productId)));
  const byName = index(offers, (o) => normalise(o.name));

  const byMethod: Record<IdentityMatchMethod, number> = {
    RETAILER_ARTICLE_ID: 0,
    RETAILER_URL: 0,
    EAN: 0,
    NAME_PACKAGE: 0,
    NEEDS_REVIEW: 0,
  };
  let ambiguous = 0;
  let externalUnused = 0;

  /** Candidate links, keyed by our product, before conflicts are settled. */
  const perProduct = new Map<string, ExternalRetailIdentity[]>();
  const review: ExternalRetailIdentity[] = [];

  for (const record of records) {
    const found = findOffer(record, { byArticle, byUrl, byName }, input.chainId);
    if (found === 'AMBIGUOUS') {
      ambiguous += 1;
      continue;
    }
    if (found === undefined) {
      externalUnused += 1;
      continue;
    }
    const link: ExternalRetailIdentity = {
      retailer: input.chainId,
      checkjebonProductId: found.offer.productId,
      ...(input.urlByProduct?.get(found.offer.productId)
        ? { checkjebonUrl: input.urlByProduct.get(found.offer.productId)! }
        : {}),
      ...(articleOf(found.offer) ? { retailerArticleId: articleOf(found.offer)! } : {}),
      ...(record.productId ? { prijsprofeetProductId: record.productId } : {}),
      ...(record.baseProductId ? { prijsprofeetBaseProductId: record.baseProductId } : {}),
      ...(record.ean ? { ean: normaliseEan(record.ean) } : {}),
      matchMethod: found.method,
      confidence: CONFIDENCE[found.method],
      provenance: {
        source: input.source,
        ...(input.sourceFile ? { sourceFile: input.sourceFile } : {}),
        recordKind: record.recordKind,
        ...(record.observedAt ? { observedAt: record.observedAt } : {}),
        importedAt: input.importedAt,
      },
    };
    if (!isAutoApproved(found.method)) {
      review.push(link);
      byMethod.NEEDS_REVIEW += 1;
      continue;
    }
    const list = perProduct.get(found.offer.productId);
    if (list) list.push(link);
    else perProduct.set(found.offer.productId, [link]);
  }

  /*
   * Settle products claimed by more than one record.
   *
   * The common case is harmless: a product on offer this week and next appears
   * twice with the same barcode, and the strongest link wins. The dangerous
   * case is two records disagreeing about the barcode, and there the whole
   * product is dropped — a second EAN for one article means one is wrong, and
   * writing either into the crosswalk would misdirect promotions from now on.
   */
  const links: ExternalRetailIdentity[] = [];
  let conflicting = 0;
  for (const candidates of perProduct.values()) {
    const eans = new Set(candidates.map((c) => c.ean).filter((e): e is string => e !== undefined));
    const baseIds = new Set(
      candidates
        .map((c) => c.prijsprofeetBaseProductId)
        .filter((b): b is string => b !== undefined),
    );
    if (eans.size > 1 || baseIds.size > 1) {
      conflicting += 1;
      continue;
    }
    const best = [...candidates].sort(
      (a, b) =>
        b.confidence - a.confidence ||
        AUTO_ORDER.indexOf(a.matchMethod) - AUTO_ORDER.indexOf(b.matchMethod) ||
        a.checkjebonProductId.localeCompare(b.checkjebonProductId),
    )[0]!;
    byMethod[best.matchMethod] += 1;
    links.push(best);
  }
  links.sort((a, b) => a.checkjebonProductId.localeCompare(b.checkjebonProductId));

  return {
    retailer: input.chainId,
    links,
    review,
    metrics: {
      retailer: input.chainId,
      catalogueProducts: offers.length,
      externalRecords: records.length,
      byMethod,
      unlinked: offers.length - links.length,
      externalUnused,
      ambiguous,
      conflicting,
    },
  };
}

const AUTO_ORDER: readonly IdentityMatchMethod[] = [
  'RETAILER_ARTICLE_ID',
  'RETAILER_URL',
  'EAN',
  'NAME_PACKAGE',
  'NEEDS_REVIEW',
];

type Found = { offer: ProductOffer; method: IdentityMatchMethod } | 'AMBIGUOUS' | undefined;

function findOffer(
  record: ExternalIdentityRecord,
  idx: {
    byArticle: Map<string, ProductOffer[]>;
    byUrl: Map<string, ProductOffer[]>;
    byName: Map<string, ProductOffer[]>;
  },
  chainId: string,
): Found {
  // Tier 1: the shop's own article number, in full. No numeric fallback —
  // 74004PAK is not 74004DSL.
  const article = extractRetailerProductId(chainId, record.url ?? record.productId);
  if (article) {
    const hit = idx.byArticle.get(article.id.toLowerCase());
    if (hit?.length === 1) return { offer: hit[0]!, method: 'RETAILER_ARTICLE_ID' };
    if (hit && hit.length > 1) return 'AMBIGUOUS';
  }

  // Tier 2: the product URL. A second reading of the same fact when the
  // article number is there, and the only one when it is not.
  const url = urlKey(record.url);
  if (url) {
    const hit = idx.byUrl.get(url);
    if (hit?.length === 1) return { offer: hit[0]!, method: 'RETAILER_URL' };
    if (hit && hit.length > 1) return 'AMBIGUOUS';
  }

  // Tier 3: EAN. Nothing to match against until the catalogue carries one, so
  // this tier is real but currently empty — see IDENTITY_BRIDGE.md.

  // Tier 4: the same name AND the same pack. Both, or neither.
  const sameName = idx.byName.get(normalise(record.name)) ?? [];
  if (sameName.length === 0) return undefined;
  const pack = resolvePackage(record.packageText, record.name);
  if (pack.status !== 'OK') {
    return { offer: sameName[0]!, method: 'NEEDS_REVIEW' };
  }
  const samePack = sameName.filter(
    (o) =>
      o.packageAmount.unit === pack.info.baseUnit &&
      Math.abs(o.packageAmount.amount - pack.info.totalAmount) < 1e-6,
  );
  if (samePack.length === 1) return { offer: samePack[0]!, method: 'NAME_PACKAGE' };
  if (samePack.length > 1) return 'AMBIGUOUS';
  return { offer: sameName[0]!, method: 'NEEDS_REVIEW' };
}

/** The crosswalk as the promotion linker wants it: stable id per product. */
export function stableIdIndex(crosswalks: readonly IdentityCrosswalk[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const crosswalk of crosswalks) {
    for (const link of crosswalk.links) {
      if (link.prijsprofeetBaseProductId) {
        map.set(link.checkjebonProductId, link.prijsprofeetBaseProductId);
      }
    }
  }
  return map;
}

/** The crosswalk as the promotion linker wants it: barcode per product. */
export function eanIndex(crosswalks: readonly IdentityCrosswalk[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const crosswalk of crosswalks) {
    for (const link of crosswalk.links) {
      if (link.ean) map.set(link.checkjebonProductId, link.ean);
    }
  }
  return map;
}
