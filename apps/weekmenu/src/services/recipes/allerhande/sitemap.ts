/**
 * An XML sitemap, read for its `<loc>` entries and nothing else.
 *
 * Sitemaps are a published, stable format meant exactly for this: a site
 * listing the pages it wants found. Two shapes exist — a `<urlset>` of pages
 * and a `<sitemapindex>` of further sitemaps — and both are handled.
 */
export interface Sitemap {
  readonly kind: 'urlset' | 'index';
  readonly locations: readonly string[];
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

export function parseSitemap(xml: string): Sitemap {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? 'index' : 'urlset';
  const locations = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/loc>/gis)]
    .map((match) => match[1]!.replace(/&(?:amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e]!).trim())
    .filter((loc) => loc !== '');
  return { kind, locations };
}

/** Allerhande's recipe id from a recipe URL: `/allerhande/recept/R-R1234567/...`. */
export function allerhandeRecipeId(url: string): string | undefined {
  return /\/allerhande\/recept\/(R-R\d+)(?:\/|$)/i.exec(url)?.[1]?.toUpperCase();
}
