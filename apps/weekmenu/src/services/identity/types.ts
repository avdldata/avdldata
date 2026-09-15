/**
 * Tying one of our catalogue products to the same product at an external source.
 *
 * This is a different job from ingredient matching, and the difference is worth
 * spelling out because it decides how strict the rules below are.
 *
 *   ingredient matching   "which products could supply the chickpeas this
 *                         recipe asks for?" — a wrong answer costs one product
 *                         choice in one week, and the review queue catches it
 *
 *   identity resolution   "is this the same article?" — a wrong answer attaches
 *                         a stranger's barcode to our product, and every future
 *                         promotion that quotes that barcode lands on the wrong
 *                         thing, for as long as the mapping lives
 *
 * The second is a durable claim about the world, so it is held to a higher
 * standard: only exact evidence, never a resemblance, and 100 % precision is
 * the target with coverage a distant second.
 */

/** How an identity link was established. Ordered strongest first. */
export type IdentityMatchMethod =
  /** The retailer's own article number, complete, identical on both sides. */
  | 'RETAILER_ARTICLE_ID'
  /** The full product URL path, identical on both sides. */
  | 'RETAILER_URL'
  /** A barcode both sides carry and agree on. */
  | 'EAN'
  /** Normalised name identical AND package identical. Both, or neither. */
  | 'NAME_PACKAGE'
  /** Anything weaker. Recorded, never applied. */
  | 'NEEDS_REVIEW';

/** Which methods may be trusted without a human looking. */
export const AUTO_APPROVED_METHODS: readonly IdentityMatchMethod[] = [
  'RETAILER_ARTICLE_ID',
  'RETAILER_URL',
  'EAN',
  'NAME_PACKAGE',
];

export function isAutoApproved(method: IdentityMatchMethod): boolean {
  return AUTO_APPROVED_METHODS.includes(method);
}

/**
 * One product, as both sources name it.
 *
 * Every field that came from a source is kept next to the field that came from
 * ours, rather than merged into one "true" record. A crosswalk that overwrites
 * cannot be audited, and this one exists precisely so a wrong link can be found
 * again later.
 */
export interface ExternalRetailIdentity {
  readonly retailer: string;
  /** Our product id, `<chain>:<slug>`. */
  readonly checkjebonProductId: string;
  readonly checkjebonUrl?: string;
  /** The shop's own article number, complete — `wi104081`, `128692ZK`. */
  readonly retailerArticleId?: string;
  /** PrijsProfeet's per-record id. Record identity, never product identity. */
  readonly prijsprofeetProductId?: string;
  /** PrijsProfeet's stable key. This is the one worth having. */
  readonly prijsprofeetBaseProductId?: string;
  readonly ean?: string;
  readonly matchMethod: IdentityMatchMethod;
  /**
   * How sure we are, as a number, so a threshold can be set in one place.
   *
   * Not a probability and not calibrated against anything — it is an ordering
   * of the methods, written down so that "strong link" is a value and not a
   * habit. Exact identifiers are 1; a name-and-package agreement is 0.9,
   * because the two sources can spell and round independently.
   */
  readonly confidence: number;
  /** Which source said so, and when we read it. */
  readonly provenance: {
    readonly source: string;
    readonly sourceFile?: string;
    readonly recordKind: 'shelf' | 'promotion' | 'unknown';
    readonly observedAt?: string;
    readonly importedAt: string;
  };
}

/** What one crosswalk run produced. */
export interface IdentityCrosswalk {
  readonly retailer: string;
  readonly links: readonly ExternalRetailIdentity[];
  /** Links held back for a human. Never used downstream. */
  readonly review: readonly ExternalRetailIdentity[];
  readonly metrics: IdentityMetrics;
}

export interface IdentityMetrics {
  readonly retailer: string;
  /** Our products offered to the matcher. */
  readonly catalogueProducts: number;
  /** External records offered to the matcher. */
  readonly externalRecords: number;
  readonly byMethod: Readonly<Record<IdentityMatchMethod, number>>;
  /** Our products that got no link at all. */
  readonly unlinked: number;
  /** External records that matched no product of ours. */
  readonly externalUnused: number;
  /** Refused because two of our products fitted equally well. */
  readonly ambiguous: number;
  /** Refused because two records disagreed about the same product. */
  readonly conflicting: number;
}

/**
 * An external record reduced to the identity it carries.
 *
 * Deliberately source-neutral: a shelf record and a promotion record carry the
 * same identity fields, and which of the two it was is provenance rather than
 * meaning. That is what lets one crosswalk builder serve both.
 */
export interface ExternalIdentityRecord {
  readonly retailer: string;
  readonly productId?: string;
  readonly baseProductId?: string;
  readonly ean?: string;
  readonly url?: string;
  readonly name: string;
  readonly packageText?: string;
  readonly priceCents?: number;
  readonly recordKind: 'shelf' | 'promotion' | 'unknown';
  readonly observedAt?: string;
}
