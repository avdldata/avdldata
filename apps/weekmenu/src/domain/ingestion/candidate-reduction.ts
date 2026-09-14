import type { ProductOffer } from '../stores/types';

/**
 * Drop products that provably cannot change the answer.
 *
 * The packaging optimizer considers every product that can supply an
 * ingredient, and most of that work is wasted: a shop sells the same 500 gram
 * tub of quark under four labels at four prices, and only the cheapest can ever
 * be part of a best solution. Removing the other three costs nothing and saves
 * three columns of the packaging matrix on every week that needs quark.
 *
 * "Provably" is the whole word that matters here. This is not a heuristic that
 * usually keeps the good ones — a top-N by price per gram would be that, and it
 * would be wrong, because a bigger pack can beat a cheaper-per-gram smaller one
 * once you account for how much the week actually needs. The rule below removes
 * a product only when another product is *identical in every dimension the
 * optimizer can observe* and never costs more.
 *
 * What is deliberately NOT reduced, and why:
 *
 *   different pack sizes   500 g at €1,00 does not dominate 1 kg at €1,80: for
 *                          a week needing 900 g the big pack wins
 *   anything on promotion  a multi-buy can be cheaper at some quantities and
 *                          not others, so no single price comparison settles it
 *   different nutrition    if two products differ nutritionally the objective
 *                          can tell them apart, so they are not interchangeable
 */

export type DominanceRule = 'IDENTICAL_PACKAGE_CHEAPER';

export interface RemovedCandidate {
  readonly offer: ProductOffer;
  /** The product that made this one redundant. */
  readonly dominatedBy: string;
  readonly rule: DominanceRule;
}

export interface CandidateReduction {
  readonly kept: readonly ProductOffer[];
  readonly removed: readonly RemovedCandidate[];
}

/**
 * Group key: everything that has to be equal before two offers can be compared
 * at all. Ingredient and shop are obvious; the package is in there because a
 * different size is a genuinely different option, not a worse version.
 */
function groupKey(offer: ProductOffer): string {
  return [
    offer.ingredientId,
    offer.locationId,
    offer.packageAmount.amount,
    offer.packageAmount.unit,
  ].join('|');
}

/**
 * Two offers are only interchangeable if the objective cannot tell them apart
 * nutritionally. Where nutrition comes from the ingredient rather than the
 * product, every product in the group carries the same values by construction.
 */
function nutritionallyInterchangeable(a: ProductOffer, b: ProductOffer): boolean {
  if (a.nutritionOrigin !== b.nutritionOrigin) return false;
  if (a.nutritionOrigin !== 'product') return true;
  return JSON.stringify(a.nutritionPer100 ?? null) === JSON.stringify(b.nutritionPer100 ?? null);
}

export function reduceCandidates(offers: readonly ProductOffer[]): CandidateReduction {
  const groups = new Map<string, ProductOffer[]>();
  for (const offer of offers) {
    const key = groupKey(offer);
    const group = groups.get(key);
    if (group) group.push(offer);
    else groups.set(key, [offer]);
  }

  const kept: ProductOffer[] = [];
  const removed: RemovedCandidate[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0]!);
      continue;
    }

    // A promoted product is never removed: its price depends on how many you
    // buy, so no single comparison can rule it out. It can still *do* the
    // removing, because a promotion only ever lowers what it charges.
    const removable = group.filter((offer) => offer.promotion === undefined);
    const promoted = group.filter((offer) => offer.promotion !== undefined);

    // Deterministic: cheapest first, product id to break ties, so the same
    // input always keeps the same product on every machine.
    const cheapest = [...group].sort(
      (a, b) => a.unitPriceCents - b.unitPriceCents || a.productId.localeCompare(b.productId),
    )[0]!;

    kept.push(...promoted);
    for (const offer of removable) {
      if (offer.productId === cheapest.productId) {
        if (!promoted.includes(offer)) kept.push(offer);
        continue;
      }
      if (
        cheapest.unitPriceCents <= offer.unitPriceCents &&
        nutritionallyInterchangeable(cheapest, offer)
      ) {
        removed.push({ offer, dominatedBy: cheapest.productId, rule: 'IDENTICAL_PACKAGE_CHEAPER' });
      } else {
        kept.push(offer);
      }
    }

    // The cheapest is promoted, so it went in with the promoted ones; make sure
    // the group still has a survivor when every plain offer was removed.
    if (!kept.some((offer) => groupKey(offer) === groupKey(group[0]!))) kept.push(cheapest);
  }

  // Stable output order, so downstream behaviour never depends on Map ordering.
  kept.sort((a, b) => a.productId.localeCompare(b.productId));
  return { kept, removed };
}
