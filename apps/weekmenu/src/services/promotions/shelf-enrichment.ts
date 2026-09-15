import type { ProductOffer } from '@/domain/stores/types';
import { extractRetailerProductId, sameRetailerProduct } from './retailer-id';
import type { ExternalShelfPrice } from './types';

/**
 * The two things a shelf record may be used for, and nothing else.
 *
 * A `shelf` record is today's ordinary price at a chain. It is not a discount,
 * and it never becomes one — that is enforced by its type, not by a rule here.
 * What it is good for:
 *
 *   **Enrichment.** Checkjebon carries no EAN, so the GTIN tier of the linker
 *   is dead weight today. A shelf record ties an EAN to a retailer article
 *   number we already know, which brings that tier to life for promotions that
 *   quote only a barcode.
 *
 *   **Price validation.** Two independent sources quoting the same product is
 *   the only way to notice that our catalogue price has gone stale, short of
 *   standing in the shop. A disagreement is reported, never resolved: which of
 *   the two is right is not something this code can know, and quietly adopting
 *   the other source's number would replace a measurable problem with an
 *   invisible one.
 *
 * Both hang on the same link, and it is an exact one: the retailer's own
 * article number, read out of the shelf record's URL and out of our product
 * slug. No name matching, because a shelf price attached to the wrong product
 * is a wrong price with no symptom.
 */

/** A shelf record tied to one of our offers by the retailer's article number. */
export interface ShelfLink {
  readonly offer: ProductOffer;
  readonly shelf: ExternalShelfPrice;
}

/**
 * Tie shelf records to our offers on the retailer article number.
 *
 * `retailerIdByProduct` is the same index the promotion linker uses, so a
 * product is identified the same way on both paths.
 */
export function linkShelfPrices(
  shelfPrices: readonly ExternalShelfPrice[],
  offers: readonly ProductOffer[],
  retailerIdByProduct: ReadonlyMap<string, string>,
): ShelfLink[] {
  const byRetailerId = new Map<string, ProductOffer[]>();
  for (const offer of offers) {
    const id = retailerIdByProduct.get(offer.productId);
    if (!id) continue;
    const key = id.toLowerCase();
    const list = byRetailerId.get(key);
    if (list) list.push(offer);
    else byRetailerId.set(key, [offer]);
  }

  const links: ShelfLink[] = [];
  for (const shelf of shelfPrices) {
    const id = extractRetailerProductId(shelf.chainId, shelf.url);
    if (!id) continue;
    const exact = byRetailerId.get(id.id.toLowerCase());
    // Ambiguity is skipped rather than resolved: one shelf price cannot belong
    // to two products, and picking one would be a coin toss with a price on it.
    if (exact?.length === 1) {
      links.push({ offer: exact[0]!, shelf });
      continue;
    }
    if (exact) continue;
    for (const [storedKey, candidates] of byRetailerId) {
      if (!sameRetailerProduct({ id: storedKey, numeric: numericOf(storedKey) }, id)) continue;
      if (candidates.length === 1) links.push({ offer: candidates[0]!, shelf });
      break;
    }
  }
  return links;
}

function numericOf(id: string): string | undefined {
  return /(\d{1,10})/.exec(id)?.[1];
}

/**
 * An EAN per product, harvested from shelf records.
 *
 * Feeds the linker's GTIN tier, which our own catalogue cannot fill. A product
 * that two shelf records disagree about is left out entirely — a second EAN for
 * the same article number means one of them is wrong, and there is no way to
 * tell which.
 */
export function eanIndexFromShelf(links: readonly ShelfLink[]): Map<string, string> {
  const seen = new Map<string, Set<string>>();
  for (const link of links) {
    const ean = link.shelf.identity.ean;
    if (!ean) continue;
    const set = seen.get(link.offer.productId);
    if (set) set.add(ean);
    else seen.set(link.offer.productId, new Set([ean]));
  }
  const index = new Map<string, string>();
  for (const [productId, eans] of seen) {
    if (eans.size === 1) index.set(productId, [...eans][0]!);
  }
  return index;
}

export interface PriceComparison {
  readonly chainId: string;
  /** Products where both sources quote a price. */
  readonly compared: number;
  readonly identical: number;
  /** Different by at most one cent — rounding, not disagreement. */
  readonly withinOneCent: number;
  /** Different by more than 5 %. Worth looking at. */
  readonly differsOverFivePercent: number;
  /** Median absolute difference in cents, over the compared products. */
  readonly medianAbsDiffCents: number;
  /** The largest disagreements, for eyeballing. */
  readonly worst: readonly {
    readonly productId: string;
    readonly name: string;
    readonly oursCents: number;
    readonly theirsCents: number;
  }[];
}

/**
 * Compare our catalogue price against the shelf price, per chain.
 *
 * Reports the disagreement. Does not act on it: adopting the other source's
 * number would make the two agree without making either correct, and the point
 * of a second source is to tell us when to go and look.
 */
export function comparePrices(links: readonly ShelfLink[], worstCount = 10): PriceComparison[] {
  const chains = [...new Set(links.map((l) => l.offer.chainId))].sort();
  return chains.map((chainId) => {
    const rows = links
      .filter((l) => l.offer.chainId === chainId && l.shelf.priceCents !== undefined)
      .map((l) => ({
        productId: l.offer.productId,
        name: l.offer.name,
        // The shelf price of one pack, which is what a shelf record quotes.
        // Not `normalUnitPriceCents`: that is our median over observations, and
        // comparing a median against today's price would report drift that is
        // really just the median doing its job.
        oursCents: l.offer.unitPriceCents as number,
        theirsCents: l.shelf.priceCents!,
      }));
    const diffs = rows.map((r) => Math.abs(r.oursCents - r.theirsCents)).sort((a, b) => a - b);
    const median = diffs.length === 0 ? 0 : (diffs[Math.floor(diffs.length / 2)] ?? 0);
    return {
      chainId,
      compared: rows.length,
      identical: rows.filter((r) => r.oursCents === r.theirsCents).length,
      withinOneCent: rows.filter((r) => Math.abs(r.oursCents - r.theirsCents) <= 1).length,
      differsOverFivePercent: rows.filter(
        (r) => r.oursCents > 0 && Math.abs(r.oursCents - r.theirsCents) / r.oursCents > 0.05,
      ).length,
      medianAbsDiffCents: median,
      worst: [...rows]
        .sort(
          (a, b) => Math.abs(b.oursCents - b.theirsCents) - Math.abs(a.oursCents - a.theirsCents),
        )
        .slice(0, worstCount),
    };
  });
}
