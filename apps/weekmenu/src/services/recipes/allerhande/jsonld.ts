/**
 * The schema.org `Recipe` a page publishes about itself.
 *
 * Not HTML scraping in the brittle sense: JSON-LD is structured data a site
 * embeds precisely so machines can read it, in a vocabulary (schema.org) that
 * does not change when the page is redesigned. The page's layout is never
 * looked at. A page that carries no Recipe yields nothing — it is not guessed
 * from headings.
 */

export type JsonObject = Readonly<Record<string, unknown>>;

function isRecipe(node: unknown): node is JsonObject {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  const type = (node as JsonObject)['@type'];
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
}

function findRecipe(node: unknown, depth = 0): JsonObject | undefined {
  if (depth > 6 || !node || typeof node !== 'object') return undefined;
  if (isRecipe(node)) return node;
  const children = Array.isArray(node)
    ? node
    : [(node as JsonObject)['@graph'], (node as JsonObject)['mainEntity']].filter(Boolean);
  for (const child of children) {
    const found = findRecipe(child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function extractRecipeJsonLd(html: string): JsonObject | undefined {
  const blocks = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const text = block[1]!
      .replace(/^\s*<!--/, '')
      .replace(/-->\s*$/, '')
      .replace(/^\s*<!\[CDATA\[/, '')
      .replace(/\]\]>\s*$/, '')
      .trim();
    try {
      const found = findRecipe(JSON.parse(text));
      if (found) return found;
    } catch {
      // One malformed block does not make the others unreadable.
    }
  }
  return undefined;
}
