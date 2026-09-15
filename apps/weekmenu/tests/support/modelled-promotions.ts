import type { ExternalPromotion } from '@/services/promotions/types';
import type { ProductOffer } from '@/domain/stores/types';

/**
 * Promotions that are NOT real, for answering a question real data cannot yet.
 *
 * ## Read this before quoting any number produced with this file
 *
 * PrijsProfeet is unreachable from this environment — the egress proxy refuses
 * the host (see PRIJSPROFEET_INTEGRATION.md). So there are no measured
 * promotions, and this file does not pretend otherwise. What it produces is a
 * **model**: promotions of realistic *shape*, applied at a rate the caller
 * chooses, so that the pipeline can be exercised end to end and the value
 * question can be bounded rather than guessed.
 *
 * The one thing this legitimately answers is a sensitivity question: *if* a
 * given share of the basket carries a promotion of a given depth, what does
 * that do to the two-store saving? Run across a range, that produces a curve,
 * and a curve is honest where a single invented number would not be.
 *
 * What it cannot answer, and what only real data can:
 *
 *   - how many promotions there actually are in a given week;
 *   - which products they land on (a chain promoting exactly the products a
 *     recipe catalogue needs would look very different from one that does not);
 *   - whether the two chains promote the same things at the same time, which
 *     is precisely what decides whether a second shop pays for itself.
 *
 * ## Where the shape comes from
 *
 * The *shape* is not invented. The five promotion forms below are the
 * vocabulary the parser was built against, and their relative frequency is set
 * by the caller rather than baked in here, so no unsourced distribution is
 * smuggled into a result.
 *
 * Deterministic: the same offers and the same settings always produce the same
 * promotions, so an A/B comparison measures the change and not the sampler.
 */

export interface PromotionModel {
  /** Share of a chain's offers that carry a promotion, 0..1. */
  readonly rate: number;
  /**
   * The mix of forms, as weights. The caller sets these; there is no default
   * distribution here, because a default would become a fact by repetition.
   */
  readonly mix: Readonly<Record<ModelledForm, number>>;
  readonly validFrom: string;
  readonly validUntil: string;
  /** Changes which offers are picked, so several independent weeks can be run. */
  readonly seed: number;
}

export type ModelledForm =
  'ONE_PLUS_ONE' | 'TWO_PLUS_ONE' | 'N_FOR_X' | 'PERCENT_OFF' | 'SECOND_HALF_PRICE';

const TEXT: Readonly<Record<ModelledForm, (offer: ProductOffer) => string>> = {
  ONE_PLUS_ONE: () => '1 + 1 gratis',
  TWO_PLUS_ONE: () => '2 + 1 gratis',
  N_FOR_X: (offer) => {
    // A real "2 voor X" is priced below two packs but above one, which is what
    // makes it a decision rather than a giveaway. 80% of two packs, rounded to
    // a shelf-plausible figure.
    const bundle = Math.max(1, Math.round((offer.unitPriceCents * 2 * 0.8) / 5) * 5);
    return `2 voor € ${(bundle / 100).toFixed(2)}`;
  },
  PERCENT_OFF: () => '25% korting',
  SECOND_HALF_PRICE: () => '2e halve prijs',
};

/** A small deterministic generator; no clock, no Math.random. */
function hash(text: string, seed: number): number {
  let h = seed >>> 0 || 0x2545f491;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x1_0000_0000;
}

/**
 * Model a week of promotions over a chain's offers.
 *
 * Selection is by hash of the product id, so which products are on offer is
 * stable for a given seed and independent of the order the offers arrive in.
 */
export function modelPromotions(
  offers: readonly ProductOffer[],
  model: PromotionModel,
): ExternalPromotion[] {
  const forms = (Object.keys(model.mix) as ModelledForm[]).filter((f) => model.mix[f] > 0);
  const totalWeight = forms.reduce((sum, form) => sum + model.mix[form], 0);
  if (forms.length === 0 || totalWeight <= 0) return [];

  const promotions: ExternalPromotion[] = [];
  for (const offer of offers) {
    if (hash(offer.productId, model.seed) >= model.rate) continue;

    // A second, independent draw picks the form, so rate and mix do not
    // correlate: raising the rate must not also change which forms appear.
    let pick = hash(offer.productId, model.seed ^ 0x5bf03635) * totalWeight;
    let form = forms[0]!;
    for (const candidate of forms) {
      pick -= model.mix[candidate];
      if (pick <= 0) {
        form = candidate;
        break;
      }
    }

    promotions.push({
      externalPromotionId: `model:${model.seed}:${offer.productId}`,
      source: 'GEMODELLEERD',
      chainId: offer.chainId,
      externalProductId: offer.productId.split(':').slice(1).join(':'),
      productName: offer.name,
      packageText: `${offer.packageAmount.amount} ${offer.packageAmount.unit}`,
      regularPriceCents: offer.unitPriceCents,
      promotionText: TEXT[form](offer),
      validFrom: model.validFrom,
      validUntil: model.validUntil,
      fetchedAt: `${model.validFrom}T06:00:00.000Z`,
    });
  }
  return promotions;
}

/**
 * An even mix of the five forms.
 *
 * Named for what it is. An even split is not a claim about Dutch retail — it is
 * the absence of a claim, which is the only defensible default when the real
 * distribution has not been observed.
 */
export const EVEN_MIX: PromotionModel['mix'] = {
  ONE_PLUS_ONE: 1,
  TWO_PLUS_ONE: 1,
  N_FOR_X: 1,
  PERCENT_OFF: 1,
  SECOND_HALF_PRICE: 1,
};
