/**
 * Source attribution, in one place.
 *
 * A free tier usually asks for a credit line, and licence terms change. Keeping
 * the wording here means honouring a new condition is one edit rather than a
 * search through the UI — and it means the credit cannot quietly go missing
 * when a screen is rewritten.
 */

export interface SourceAttribution {
  readonly source: string;
  /** What must be shown wherever the data is used. */
  readonly notice: string;
  /** Where a reader can check the source themselves. */
  readonly url?: string;
}

export const PROMOTION_ATTRIBUTIONS: Readonly<Record<string, SourceAttribution>> = {
  PrijsProfeet: {
    source: 'PrijsProfeet',
    notice: 'Aanbiedingsdata: PrijsProfeet',
  },
};

export const CATALOGUE_ATTRIBUTION: SourceAttribution = {
  source: 'Checkjebon',
  notice: 'Prijs- en productdata: Checkjebon',
  url: 'https://github.com/supermarkt/checkjebon',
};

/**
 * Every credit that applies to a plan, de-duplicated and in a stable order.
 *
 * A plan that used no promotions still credits the catalogue, because the
 * prices came from somewhere either way.
 */
export function attributionsFor(sources: readonly string[]): SourceAttribution[] {
  const credits = new Map<string, SourceAttribution>();
  credits.set(CATALOGUE_ATTRIBUTION.source, CATALOGUE_ATTRIBUTION);
  for (const source of sources) {
    const attribution = PROMOTION_ATTRIBUTIONS[source];
    if (attribution) credits.set(attribution.source, attribution);
  }
  return [...credits.values()].sort((a, b) => a.source.localeCompare(b.source));
}
