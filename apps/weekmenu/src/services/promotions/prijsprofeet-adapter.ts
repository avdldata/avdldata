import type { ExternalPromotion, PromotionProvider } from './types';

/**
 * The PrijsProfeet adapter — deliberately unfinished, and here is why.
 *
 * This is the only file in the promotion pipeline that is allowed to know what
 * PrijsProfeet's response looks like. Everything downstream of
 * `ExternalPromotion` is built, tested and measured.
 *
 * The mapping below is empty because **the live response has never been seen**.
 * Every attempt to reach the service from this environment is refused by the
 * egress proxy before a connection is made:
 *
 *     curl https://prijsprofeet.nl
 *     curl: (56) CONNECT tunnel failed, response 403
 *
 * The full evidence, including what else was checked, is in
 * PRIJSPROFEET_INTEGRATION.md.
 *
 * Filling this in from documentation would be exactly the mistake the brief
 * warns against: a field name that turns out to be wrong does not fail loudly,
 * it silently yields zero promotions or — worse — a promotion attached to the
 * wrong price. So the mapping stays empty and honest until one real response
 * exists, and `mapResponse` throws rather than returning a plausible-looking
 * nothing.
 *
 * ## What finishing this takes
 *
 * One response body. Then:
 *
 *   1. write down the field names in `FIELD_MAPPING` below;
 *   2. implement `mapResponse` against them;
 *   3. run `pnpm promo:probe` — it reports which of the ten fields the brief
 *      asks about are actually present, over a sample;
 *   4. everything after that is already built.
 *
 * ## What the pipeline needs from a response
 *
 * Only `externalPromotionId`, `chainId` and `productName` are structurally
 * required. The rest changes how well linking works rather than whether it
 * runs, and each absence has a measured consequence:
 *
 * | field | absent means |
 * | --- | --- |
 * | retailer product id | tier 1 unavailable; linking falls back to name + package |
 * | GTIN | tier 2 unavailable |
 * | package text | tier 3 degrades to review, because a promotion on the small pack must not land on the large one |
 * | promotion text | only a bare action price can be read, so bundles and nth-item offers are lost |
 * | validFrom / validUntil | the promotion is refused outright: an offer with no window would apply to every week forever |
 * | regular price | no freshness comparison against Checkjebon |
 */

/** The one thing this module still needs. Keys are ours, values are theirs. */
export const FIELD_MAPPING: Readonly<Record<keyof ExternalPromotion, string | null>> = {
  externalPromotionId: null,
  source: null,
  chainId: null,
  externalProductId: null,
  gtin: null,
  productName: null,
  packageText: null,
  regularPriceCents: null,
  promotionalPriceCents: null,
  promotionText: null,
  validFrom: null,
  validUntil: null,
  fetchedAt: null,
};

export class PromotionSourceNotConfiguredError extends Error {
  constructor() {
    super(
      'De PrijsProfeet-veldmapping is nog niet ingevuld: er is in deze omgeving nooit een ' +
        'echte respons opgehaald (egress-proxy weigert de host). Zie ' +
        'PRIJSPROFEET_INTEGRATION.md. Vul FIELD_MAPPING en mapResponse in zodra er één ' +
        'respons beschikbaar is, of gebruik fileSnapshotProvider met een opgeslagen respons.',
    );
    this.name = 'PromotionSourceNotConfiguredError';
  }
}

/** Turn one raw response into our boundary type. Not yet implementable. */
export function mapResponse(_raw: unknown): readonly ExternalPromotion[] {
  throw new PromotionSourceNotConfiguredError();
}

/**
 * The provider, wired but not usable.
 *
 * `transport` is injected rather than hard-coded so that the HTTP details, the
 * base URL and any credential stay outside the domain and outside this
 * repository — and so that a saved response can be fed in without a network.
 */
export function prijsProfeetProvider(
  transport: (chainIds: readonly string[]) => Promise<unknown>,
): PromotionProvider {
  return {
    name: 'PrijsProfeet',
    fetchPromotions: async (chainIds) => mapResponse(await transport(chainIds)),
  };
}

/** True once someone has filled in the mapping. Used by the probe script. */
export function isConfigured(): boolean {
  return Object.values(FIELD_MAPPING).some((value) => value !== null);
}
