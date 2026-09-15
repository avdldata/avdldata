/**
 * The shop's own product number, pulled out of the link we already have.
 *
 * This is the strongest identity available for linking a promotion to a
 * product: it is what the retailer itself calls the item, so two sources that
 * both quote it cannot be talking about different things. Names can be spelled
 * differently and pack sizes can be rounded; an article number cannot.
 *
 * Both formats below were checked against every product in the Checkjebon
 * snapshot — 16.173 Albert Heijn and 17.217 Jumbo products, all of them
 * matching, none of them deviating. That is why the parsers are strict: a slug
 * that does not fit the shape is far more likely to be a format change worth
 * noticing than a variant worth accepting.
 *
 * Strict about the shape, not about the size: Albert Heijn numbers run from two
 * digits ("wi73/ah-franse-baguettes") to six, and a minimum length invented
 * from the first few examples would have dropped the oldest products in the
 * catalogue.
 *
 * One place, two functions, no regular expressions loose in the codebase.
 */

/** What a retailer's own identifier looks like once extracted. */
export interface RetailerProductId {
  /** The identifier exactly as the retailer writes it. */
  readonly id: string;
  /**
   * The numeric article number on its own, when the full id carries something
   * extra.
   *
   * Jumbo appends a packaging code — "707266STK" is article 707266 in a
   * "stuk" pack. Kept for reporting and for reading a slug, but **not** used
   * for identity: 730 Jumbo products share a number with a different code, and
   * a case of six is not the pack. See `sameRetailerProduct`.
   */
  readonly numeric?: string;
}

/**
 * Albert Heijn: `wi415202/100-coconut-grove` → `wi415202`.
 *
 * Accepts the bare slug as stored in the snapshot, or a full product URL.
 */
export function extractAhProductId(
  slugOrUrl: string | undefined | null,
): RetailerProductId | undefined {
  const text = (slugOrUrl ?? '').trim();
  if (text === '') return undefined;
  const match = /(?:^|\/)(wi\d{1,10})(?:\/|$)/i.exec(text);
  if (!match) return undefined;
  const id = match[1]!.toLowerCase();
  return { id, numeric: id.slice(2) };
}

/**
 * Jumbo: `11er-spek-rosti-350-g-128692ZK` → `128692ZK`, article `128692`.
 *
 * The trailing capitals are the packaging unit (ZK, DS, STK, FLS, PAK, POT,
 * BLK, CUP and a handful of others). They are part of the id the shop shows,
 * so they are kept — but the article number is exposed separately because a
 * feed that quotes only the number is just as identifying.
 */
export function extractJumboProductId(
  slugOrUrl: string | undefined | null,
): RetailerProductId | undefined {
  const text = (slugOrUrl ?? '').trim().replace(/\/+$/, '');
  if (text === '') return undefined;
  const last = text.split('/').pop() ?? '';
  // Either the tail of a slug ("...-128692ZK") or the bare identifier a feed
  // hands over directly ("128692ZK"). Requiring the hyphen would have refused
  // exactly the form a promotion source is most likely to send.
  const match = /(?:^|-)(\d{4,10})([A-Z]{2,4})$/.exec(last);
  if (!match) return undefined;
  return { id: `${match[1]}${match[2]}`, numeric: match[1] };
}

/** Whichever parser the chain calls for. Unknown chain: no identity, no guess. */
export function extractRetailerProductId(
  chainId: string,
  slugOrUrl: string | undefined | null,
): RetailerProductId | undefined {
  if (chainId === 'ah') return extractAhProductId(slugOrUrl);
  if (chainId === 'jumbo') return extractJumboProductId(slugOrUrl);
  return undefined;
}

/**
 * Do two retailer identifiers refer to the same product?
 *
 * The full id, and only the full id.
 *
 * This used to accept a match on the article number alone, on the reasoning
 * that a feed dropping Jumbo's packaging code was still naming the same
 * article. The first real promotion snapshot showed that reasoning to be
 * wrong, and expensively so:
 *
 *   74004PAK   Campina Verse Halfvolle Melk Voordeelpak 2,4 L    € 2,69
 *   74004DSL   Campina Halfvolle Melk Voordeelpack 4 x 2,4 L     € 10,76
 *
 * The suffix is not decoration, it is the difference between a pack and the
 * case it ships in. Across the Jumbo catalogue 730 products — 4,2 % — share a
 * number with a different packaging code, routinely at six to twelve times the
 * price. A promotion on the case landing on the single pack is a discount that
 * does not exist, and it is the kind that never announces itself.
 *
 * Nothing is lost by dropping it. Every URL in the real snapshot yields the
 * complete id, for 100 % of 5.190 records, so the fallback was answering a
 * question nobody asked. Albert Heijn is unaffected either way: its extractor
 * refuses a bare number, so a numeric-only AH id never reaches here.
 */
export function sameRetailerProduct(
  a: RetailerProductId | undefined,
  b: RetailerProductId | undefined,
): boolean {
  if (!a || !b) return false;
  return a.id.toLowerCase() === b.id.toLowerCase();
}
