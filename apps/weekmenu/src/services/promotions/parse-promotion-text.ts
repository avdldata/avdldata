import { cents, type Cents } from '@/domain/units';
import type { PromotionParams } from '@/domain/stores/types';

/**
 * Dutch supermarket promotion text, turned into something the engine can price.
 *
 * This is the part of a promotion feed that is genuinely the same everywhere.
 * "1 + 1 gratis", "2 voor € 5", "2e halve prijs" and "25% korting" are the
 * shelf-edge vocabulary of every Dutch chain, so parsing them belongs here and
 * not in a provider adapter — a second source should only have to hand over the
 * text.
 *
 * The governing rule is the same one that governs product matching: a wrong
 * answer is worse than no answer. A misread promotion does not announce itself;
 * it just makes the plan cheaper than the till, which is the single most
 * damaging thing a shopping app can do. So anything this cannot structure with
 * certainty comes back as UNSUPPORTED, keeps its original text, and is never
 * priced.
 *
 * What it deliberately does NOT do:
 *
 *   - derive a percentage from a price pair. "van € 4,29 voor € 2,99" is read
 *     as a fixed price of € 2,99, which is exactly what the label says. Turning
 *     it into "30% korting" would assert a condition the words never stated;
 *   - accept a per-item price as if it were the deal. "2 voor € 3 (€ 1,50 per
 *     stuk)" is a bundle, and multiplying € 1,50 by the number of packs prices
 *     a single pack at a discount that does not exist;
 *   - apply anything with a condition it cannot represent — a loyalty card, a
 *     spend threshold, a per-customer limit.
 */

export type PromotionParseFailure =
  /** Nothing usable in the text at all. */
  | 'EMPTY'
  /** Recognisably a promotion, but of a kind the engine cannot price. */
  | 'UNSUPPORTED_PROMOTION'
  /** Structured, but the numbers make no sense (0 free, 110% off). */
  | 'IMPLAUSIBLE_VALUES';

export type PromotionParseResult =
  | { readonly status: 'OK'; readonly params: PromotionParams; readonly matched: string }
  | { readonly status: 'FAILED'; readonly reason: PromotionParseFailure; readonly raw: string };

/**
 * Conditions that make an otherwise readable promotion unusable.
 *
 * Each of these changes who gets the price, not what the price is, and none of
 * them is something the optimizer can honour. A "bonuskaart" price is not the
 * price for a shopper without the card.
 */
const BLOCKING_CONDITIONS: readonly RegExp[] = [
  /\bbonuskaart\b/,
  // AH's loyalty programme is literally called "Extra's"; the bare word
  // "extra" is ordinary promotion filler, so only the programme name blocks.
  /\bextra'?s?\s+(?:leden|prijs|korting|deal)\b/,
  /\bvoor\s+extra'?s\b/,
  /\bair\s?miles\b/,
  /\bkoopzegel/,
  /\bspaar/,
  /\bper\s+klant\b/,
  /\bmax(?:imaal|imum)?\s+\d+\s+per\b/,
  /\bbij\s+aankoop\s+van\s+(?:€|\d+[,.]\d{2})/,
  /\bvanaf\s+€/,
  /\bstapelkorting\b/,
  /\bbezorg/,
  /\bkortingscode\b/,
  /\bonline\b/,

  /*
   * The four below were added after reading the real PrijsProfeet snapshot.
   * Each one was previously parsed into something the till will not charge.
   */

  // "25% volume voordeel" — a staffel, and the feed never says at how many
  // units it starts. Read as a flat 25% it discounts a single pack by a
  // quarter, which is simply not the offer. 458 records in the first real
  // snapshot; the largest single source of over-discounting we have seen.
  /\bvolume\s*voordeel\b/,
  /\bpakketkorting\b/,
  // "100 GRAM VOOR 1.69" — a price per weight, not per pack. Reading it as a
  // pack price puts a 300 g grillworst in the basket at the 100 g rate.
  /\b\d+\s*(?:gram|gr|kilo|kg|ml|cl|lt|liter)\s+voor\b/,
  /\bper\s+(?:kilo|kg|liter|lt|stuk|\d+\s*(?:gram|g|ml))\b/,
];

/** "€ 1,50", "1.50", "€1,-" → cents. Dutch decimal comma, optional euro sign. */
function parseEuro(text: string): Cents | undefined {
  const cleaned = text.replace(/\s|€/g, '');
  // "1,-" and "1,–" are the Dutch shorthand for a whole euro.
  const whole = /^(\d+)[,.](?:-|–|—)$/.exec(cleaned);
  if (whole) return cents(Number(whole[1]) * 100);
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(cleaned);
  if (!match) return undefined;
  const euros = Number(match[1]);
  const fraction = match[2] ?? '';
  const centPart = fraction.length === 1 ? Number(fraction) * 10 : Number(fraction || '0');
  if (!Number.isFinite(euros) || !Number.isFinite(centPart)) return undefined;
  return cents(euros * 100 + centPart);
}

/** Lowercase, single-spaced, with the ordinal and multiplication noise settled. */
export function normalisePromotionText(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ /g, ' ')
      // Typographic apostrophes; "Extra’s" must read as "extra's".
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[×✕]/g, 'x')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly build: (match: RegExpExecArray) => PromotionParams | undefined;
}

/**
 * The forms, most specific first.
 *
 * Order matters: "2e halve prijs" contains "halve prijs", and "1 + 1 gratis"
 * contains a bare "gratis". A shorter rule that fires first would price a
 * different offer than the shelf does.
 */
const RULES: readonly Rule[] = [
  {
    // "2e halve prijs", "2e voor de halve prijs", "3e gratis", "2e 50% korting"
    name: 'nth-discount',
    pattern: /\b(\d+)\s*(?:e|de|ste)\b[^.]{0,24}?(halve prijs|gratis|(\d{1,2})\s*%)/,
    build: (m) => {
      const nth = Number(m[1]);
      const percent = m[2]!.includes('halve') ? 50 : m[3] ? Number(m[3]) : 100;
      if (nth < 2 || nth > 10 || percent <= 0 || percent > 100) return undefined;
      return { type: 'BUY_NTH_DISCOUNT', nth, percent };
    },
  },
  {
    // "1 + 1 gratis", "2+1 gratis", "3 + 1 gratis"
    name: 'x-plus-y-free',
    pattern: /\b(\d+)\s*\+\s*(\d+)\s*(?:gratis|halve prijs)?\b/,
    build: (m) => {
      const buy = Number(m[1]);
      const free = Number(m[2]);
      if (buy < 1 || free < 1 || buy > 6 || free > 6) return undefined;
      // Buy X, get Y free is "every (X+Y)th item is free", repeated. The engine
      // already prices that exactly, so only the 1+1 case needs its own type —
      // and only because it predates the general one.
      if (buy === 1 && free === 1) return { type: 'ONE_PLUS_ONE' };
      // Anything other than one free per group needs a type we do not have:
      // "2+2 gratis" discounts two of every four, which BUY_NTH_DISCOUNT
      // cannot say. Refusing is cheaper than a wrong bill.
      if (free !== 1) return undefined;
      return { type: 'BUY_NTH_DISCOUNT', nth: buy + free, percent: 100 };
    },
  },
  {
    // "van € 4,29 voor € 2,99" — a was/now pair. Unlike a bare pair of numbers
    // this is unambiguous shelf language: the second figure is what one pack
    // costs today, with no condition attached.
    name: 'was-now',
    pattern: /\bvan\s*€?\s*\d+(?:[,.]\d{1,2})?\s*voor\s*(€?\s*\d+(?:[,.](?:\d{1,2}|-|–))?)/,
    build: (m) => {
      const unitPriceCents = parseEuro(m[1]!);
      if (unitPriceCents === undefined || unitPriceCents <= 0) return undefined;
      return { type: 'FIXED_PRICE', unitPriceCents };
    },
  },
  {
    // "2 voor € 5", "3 voor 4,99", "2 stuks voor € 3,50"
    //
    // The count may not be the tail of a decimal: in "van 4,29 voor 2,99" the
    // "29" is cents, and reading it as a bundle of twenty-nine packs is how a
    // price cut turns into nonsense.
    name: 'n-for-price',
    pattern: /(?<![\d,.])(\d+)\s*(?:stuks?\s*)?voor\s*(€?\s*\d+(?:[,.](?:\d{1,2}|-|–))?)/,
    build: (m) => {
      const bundleSize = Number(m[1]);
      const bundlePriceCents = parseEuro(m[2]!);
      if (bundleSize < 1 || bundleSize > 12) return undefined;
      if (bundlePriceCents === undefined || bundlePriceCents <= 0) return undefined;
      // "1 voor 3,79" is a fixed price with a redundant count, and the engine
      // has a type for that. A bundle of one would price the same but says
      // something confusing on the shopping list.
      if (bundleSize === 1) return { type: 'FIXED_PRICE', unitPriceCents: bundlePriceCents };
      return { type: 'N_FOR_X', bundleSize, bundlePriceCents };
    },
  },
  {
    // "25% korting", "korting 25%", "-25%"
    name: 'percent-off',
    pattern: /(?:^|\s|-)(\d{1,2})\s*%\s*(?:korting)?/,
    build: (m) => {
      const percent = Number(m[1]);
      if (percent <= 0 || percent >= 100) return undefined;
      return { type: 'PERCENT_OFF', percent };
    },
  },
  {
    // "nu € 2,49", "actieprijs € 1,99", "stuntprijs 0,99"
    name: 'fixed-price',
    pattern:
      /\b(?:nu|actieprijs|stuntprijs|weekprijs|voordeelprijs)\s*(€?\s*\d+(?:[,.](?:\d{1,2}|-|–))?)/,
    build: (m) => {
      const unitPriceCents = parseEuro(m[1]!);
      if (unitPriceCents === undefined || unitPriceCents <= 0) return undefined;
      return { type: 'FIXED_PRICE', unitPriceCents };
    },
  },
  {
    // "VOOR 0.99" on its own — the commonest fixed-price form in the real
    // snapshot, and one no earlier rule caught.
    //
    // Anchored to the end of the text so it cannot pick the tail off a longer
    // sentence, and it sits last so that "2 voor 0.99" is read as a bundle by
    // the rule above rather than as a fixed price here. The per-weight forms
    // ("100 gram voor 1.69") are refused before any rule runs.
    name: 'bare-for-price',
    pattern: /(?:^|\s)voor\s*(€?\s*\d+(?:[,.](?:\d{1,2}|-|–))?)\s*$/,
    build: (m) => {
      const unitPriceCents = parseEuro(m[1]!);
      if (unitPriceCents === undefined || unitPriceCents <= 0) return undefined;
      return { type: 'FIXED_PRICE', unitPriceCents };
    },
  },
];

/**
 * Read one promotion out of its shelf text.
 *
 * `promotionalPriceCents` is used only as a fallback: a feed that states a
 * price but no readable text still describes a fixed action price, and that is
 * the one inference safe enough to make. It is never used to *derive* a
 * percentage or a bundle, because those have conditions the price alone does
 * not carry.
 */
export function parsePromotionText(
  text: string | undefined | null,
  promotionalPriceCents?: number,
): PromotionParseResult {
  const raw = (text ?? '').trim();
  const normalised = normalisePromotionText(raw);

  if (normalised === '') {
    if (promotionalPriceCents !== undefined && promotionalPriceCents > 0) {
      return {
        status: 'OK',
        params: { type: 'FIXED_PRICE', unitPriceCents: cents(promotionalPriceCents) },
        matched: 'prijs zonder tekst',
      };
    }
    return { status: 'FAILED', reason: 'EMPTY', raw };
  }

  for (const condition of BLOCKING_CONDITIONS) {
    if (condition.test(normalised)) {
      return { status: 'FAILED', reason: 'UNSUPPORTED_PROMOTION', raw };
    }
  }

  for (const rule of RULES) {
    const match = rule.pattern.exec(normalised);
    if (!match) continue;
    const params = rule.build(match);
    if (params === undefined) {
      // The shape was recognised but the numbers were not usable. That is a
      // different answer from "no idea what this is", and worth keeping apart:
      // it is the signal that a rule needs widening.
      return { status: 'FAILED', reason: 'IMPLAUSIBLE_VALUES', raw };
    }
    return { status: 'OK', params, matched: rule.name };
  }

  if (promotionalPriceCents !== undefined && promotionalPriceCents > 0) {
    return {
      status: 'OK',
      params: { type: 'FIXED_PRICE', unitPriceCents: cents(promotionalPriceCents) },
      matched: 'prijs, tekst niet herkend',
    };
  }

  return { status: 'FAILED', reason: 'UNSUPPORTED_PROMOTION', raw };
}

/**
 * A source's own promotion type code and its shelf text, together.
 *
 * ## The text decides the mechanism; the code only fills gaps
 *
 * This order is not a preference, it is what the real snapshot forces. 300
 * records arrive with `promotion_type: "one_plus_one"` and the shelf text
 * "2e halve prijs", and another 175 with "2+1 gratis". Those are three
 * different offers. Obeying the code would price a quarter off two packs as
 * half off two packs — the plan comes out cheaper than the till, on hundreds of
 * products, with nothing anywhere saying so.
 *
 * So: a text that parses to one unambiguous mechanism wins. The code is the
 * fallback for a text that says nothing usable, and even then it only answers
 * where it can do so without inventing a number.
 *
 * ## Several texts, one offer
 *
 * The real feed publishes a *list* of keywords per record, and the list is not
 * a list of synonyms — it mixes "2 voor 5.99" with "Gratis bezorging bij 15
 * euro" and "BONUS". Every entry is parsed; entries that say nothing are
 * ignored, and if two of them say *different* things the promotion is refused
 * rather than resolved. Two contradictory mechanisms on one record is not a
 * thing to pick between.
 *
 * ## Why the source's price is not a fallback here
 *
 * It was, and against real data that was wrong. In this feed `price` is the
 * *effective* per-unit rate: a "2 VOOR 0.99" record carries `price: 0.49`, and
 * a "2e halve prijs" record carries three quarters of the shelf price. Neither
 * is what one pack costs at the till. Using it as a fixed price would quietly
 * halve a bundle offer on every record whose text we could not read.
 *
 * It is still used for the two codes where the source's own price genuinely is
 * a per-unit price — `percentage` and `fixed_price` — and nowhere else.
 */
export function parseTypedPromotion(
  typeCode: string | undefined | null,
  text: string | readonly string[] | undefined | null,
  promotionalPriceCents?: number,
  regularPriceCents?: number,
): PromotionParseResult {
  const code = (typeCode ?? '').trim().toLowerCase();
  const texts = (Array.isArray(text) ? text : [text as string | undefined | null]).filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim() !== '',
  );

  const fromText = resolveTexts(texts);
  if (fromText.status === 'OK') return fromText;
  // Two texts that disagree is a refusal, not a reason to consult the code.
  if (fromText.reason === 'AMBIGUOUS') {
    return { status: 'FAILED', reason: 'UNSUPPORTED_PROMOTION', raw: texts.join(' | ') };
  }

  const raw = texts.join(' | ') || code;
  switch (code) {
    case 'one_plus_one':
      // Unambiguous on its own: buy one, get one. No numbers needed, and no
      // text left to contradict it.
      return { status: 'OK', params: { type: 'ONE_PLUS_ONE' }, matched: 'code one_plus_one' };

    case 'percentage':
      // A stated pair of prices gives the percentage exactly, with no guessing:
      // both numbers come from the source, and for this code both are per unit.
      if (
        promotionalPriceCents !== undefined &&
        regularPriceCents !== undefined &&
        regularPriceCents > 0 &&
        promotionalPriceCents < regularPriceCents
      ) {
        const percent = Math.round((1 - promotionalPriceCents / regularPriceCents) * 100);
        if (percent > 0 && percent < 100) {
          return {
            status: 'OK',
            params: { type: 'PERCENT_OFF', percent },
            matched: 'code percentage',
          };
        }
      }
      return { status: 'FAILED', reason: 'UNSUPPORTED_PROMOTION', raw };

    case 'fixed_price':
      if (promotionalPriceCents !== undefined && promotionalPriceCents > 0) {
        return {
          status: 'OK',
          params: { type: 'FIXED_PRICE', unitPriceCents: cents(promotionalPriceCents) },
          matched: 'code fixed_price',
        };
      }
      return { status: 'FAILED', reason: 'UNSUPPORTED_PROMOTION', raw };

    // multi_buy and nth_discount need a bundle size or an nth, and only the
    // text has those. A code that says "a bundle" without saying how many is
    // not priceable, and two is a guess that costs money.
    default:
      return { status: 'FAILED', reason: 'UNSUPPORTED_PROMOTION', raw };
  }
}

type ResolvedTexts =
  | { readonly status: 'OK'; readonly params: PromotionParams; readonly matched: string }
  | { readonly status: 'FAILED'; readonly reason: 'NONE' | 'AMBIGUOUS' };

/**
 * One mechanism out of a list of shelf texts, or nothing.
 *
 * Distinct parses are compared by value, so the same offer written twice in
 * different casing ("25% KORTING" and "25% korting") is one answer and not a
 * conflict.
 */
function resolveTexts(texts: readonly string[]): ResolvedTexts {
  const byParams = new Map<string, { params: PromotionParams; matched: string }>();
  for (const text of texts) {
    // Deliberately without the price fallback. A price is not a *reading* of
    // this text, so letting it stand in for one turns an unreadable keyword
    // into a second, competing mechanism: "BONUS" next to "35% Op=Op korting"
    // would produce both a fixed price and a percentage, and the two would
    // cancel each other out as a contradiction. What a bare price means is the
    // code's business, below.
    const parsed = parsePromotionText(text);
    if (parsed.status !== 'OK') continue;
    byParams.set(JSON.stringify(parsed.params), { params: parsed.params, matched: parsed.matched });
  }
  if (byParams.size === 1) {
    const only = [...byParams.values()][0]!;
    return { status: 'OK', params: only.params, matched: only.matched };
  }
  if (byParams.size > 1) return { status: 'FAILED', reason: 'AMBIGUOUS' };
  // No usable text. What a bare price means is the *code's* business, not this
  // function's: for `percentage` a stated pair of prices is a percentage, and
  // for no code at all a price on its own says nothing about the mechanism.
  return { status: 'FAILED', reason: 'NONE' };
}
