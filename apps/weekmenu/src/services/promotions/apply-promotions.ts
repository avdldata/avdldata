import { isWithinValidity } from '@/domain/pricing/promotions';
import type { ProductOffer, Promotion } from '@/domain/stores/types';
import type { LinkedPromotion } from './types';

/**
 * Deciding which promotions are actually in force, and attaching them.
 *
 * Two judgements live here and nowhere else.
 *
 * **Which day.** A week planner must not ask "is this on offer today". The
 * shopping happens on one particular day, and that day is what decides. An
 * offer expiring on Monday is worth nothing to someone shopping on Saturday,
 * and an offer starting on Monday is worth everything to someone shopping on
 * Monday — which is exactly why upcoming promotions are worth fetching.
 *
 * **Which one, when there are several.** Supermarkets do run overlapping
 * offers, and the cheapest-looking one is not automatically the one the till
 * applies: a bundle beats a percentage at three packs and loses at one. Rather
 * than guess, this picks by an explicit, documented rule and records that a
 * choice was made.
 */

export interface PromotionResolution {
  /** Offers with any in-force promotion attached. Same order as the input. */
  readonly offers: readonly ProductOffer[];
  /** How many offers ended up carrying a promotion. */
  readonly applied: number;
  /** Promotions that linked to a product but are not in force on this date. */
  readonly outOfWindow: number;
  /** Products where more than one promotion was in force. */
  readonly overlaps: readonly OverlapDecision[];
}

export interface OverlapDecision {
  readonly productId: string;
  readonly chosen: string;
  readonly rejected: readonly string[];
  readonly rule: OverlapRule;
}

export type OverlapRule =
  /** One clearly narrower window: the more specific offer is the live one. */
  | 'SHORTEST_WINDOW'
  /** Same window, so fall back to the source's own ordering, deterministically. */
  | 'FIRST_BY_ID';

export interface ApplyOptions {
  /** The day the shopping actually happens. Not "today". */
  readonly shoppingDate: string;
  /**
   * What to do when one product has several promotions in force.
   *
   * V1 is conservative on purpose: it never combines them and never picks "the
   * cheapest" by pricing them, because pricing them means assuming they do not
   * stack, and a feed that lists a bundle and a percentage separately may well
   * mean both. One promotion is applied, chosen by rule, and the others are
   * reported.
   */
  readonly onOverlap?: 'PICK_ONE' | 'SKIP';
}

/**
 * Attach every in-force promotion to its offer.
 *
 * Offers with no promotion come back untouched — identity preserved, so a
 * caller can tell nothing happened. The regular price is never modified: a
 * promotion sits *beside* the shelf price and the pricing engine combines them.
 */
export function applyPromotions(
  offers: readonly ProductOffer[],
  linked: readonly LinkedPromotion[],
  options: ApplyOptions,
): PromotionResolution {
  const onOverlap = options.onOverlap ?? 'PICK_ONE';

  const inForce = new Map<string, Promotion[]>();
  let outOfWindow = 0;
  for (const entry of linked) {
    const promotion = entry.promotion;
    // A review-tier link carries no promotion and must never gain one here.
    if (!promotion) continue;
    if (!isWithinValidity(promotion, options.shoppingDate)) {
      outOfWindow += 1;
      continue;
    }
    const list = inForce.get(promotion.productId);
    if (list) list.push(promotion);
    else inForce.set(promotion.productId, [promotion]);
  }

  const overlaps: OverlapDecision[] = [];
  const chosen = new Map<string, Promotion>();
  for (const [productId, candidates] of inForce) {
    if (candidates.length === 1) {
      chosen.set(productId, candidates[0]!);
      continue;
    }
    const decision = resolveOverlap(productId, candidates);
    overlaps.push(decision);
    if (onOverlap === 'PICK_ONE') {
      chosen.set(
        productId,
        candidates.find((p) => p.id === decision.chosen)!,
      );
    }
  }

  let applied = 0;
  const result = offers.map((offer) => {
    const promotion = chosen.get(offer.productId);
    if (!promotion) return offer;
    applied += 1;
    return { ...offer, promotion };
  });

  return { offers: result, applied, outOfWindow, overlaps };
}

/**
 * Which of several simultaneous promotions to honour.
 *
 * The narrowest window wins: a week-long offer and a two-day offer on the same
 * product almost always means the two-day one is the live special and the other
 * is the standing one. When the windows are identical there is nothing to
 * choose between them, so the source's own id decides — arbitrary, but stable,
 * which is what matters for a deterministic planner.
 *
 * Deliberately not "whichever is cheapest": that requires pricing both at a
 * quantity nobody has decided yet, and it would silently prefer whichever
 * promotion the parser happened to read most generously.
 */
function resolveOverlap(productId: string, candidates: readonly Promotion[]): OverlapDecision {
  const withSpan = candidates.map((promotion) => ({
    promotion,
    span: Date.parse(promotion.validUntil) - Date.parse(promotion.validFrom),
  }));
  const shortest = Math.min(...withSpan.map((c) => c.span));
  const narrowest = withSpan.filter((c) => c.span === shortest);
  const rule: OverlapRule = narrowest.length === 1 ? 'SHORTEST_WINDOW' : 'FIRST_BY_ID';
  const winner =
    rule === 'SHORTEST_WINDOW'
      ? narrowest[0]!.promotion
      : [...narrowest].sort((a, b) => a.promotion.id.localeCompare(b.promotion.id))[0]!.promotion;

  return {
    productId,
    chosen: winner.id,
    rejected: candidates.filter((p) => p.id !== winner.id).map((p) => p.id),
    rule,
  };
}

/**
 * The shopping date for a week, when the caller has not named one.
 *
 * The start of the week, which is the conservative answer: an offer that runs
 * out mid-week is not credited to a week that starts before it began. A caller
 * who knows the household shops on Saturday should say so.
 */
export function defaultShoppingDate(startDate: string): string {
  return startDate;
}
