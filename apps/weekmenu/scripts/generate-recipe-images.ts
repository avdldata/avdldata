/**
 * Generate placeholder artwork for every seeded recipe.
 *
 * Real photography is out of scope for V1, but empty image slots make the UI
 * look broken. This writes one small deterministic SVG per recipe — a warm
 * gradient keyed on the recipe id with a glyph for its main component — so the
 * week overview looks like a finished product and `recipe.imageUrl` points at
 * something real.
 *
 * Run with: pnpm seed:images
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_RECIPES } from '../src/data/seed/recipes';
import { SEED_CHAINS } from '../src/data/seed/stores';

const OUT_DIR = join(process.cwd(), 'public', 'recipes');
const CHAIN_DIR = join(process.cwd(), 'public', 'chains');

const PALETTES: readonly [string, string][] = [
  ['#e7f0ea', '#bcd8c6'],
  ['#fdf1e0', '#f0d3a6'],
  ['#e8f1f8', '#c2d9ea'],
  ['#f3eee6', '#ddd0bb'],
  ['#eef2e4', '#cdd9b4'],
  ['#fbe9e7', '#f0c7c2'],
];

const GLYPHS: readonly (readonly [string, string])[] = [
  ['pasta', '🍝'],
  ['soep', '🥣'],
  ['salade', '🥗'],
  ['wraps', '🌯'],
  ['rijst', '🍚'],
  ['noedels', '🍜'],
  ['ovenschotel', '🥘'],
  ['aardappelen', '🥔'],
  ['vis', '🐟'],
  ['kip', '🍗'],
  ['rundvlees', '🥩'],
  ['varkensvlees', '🥓'],
  ['brood', '🥖'],
  ['vegetarisch', '🥦'],
];

function hash(value: string): number {
  let total = 0;
  for (let i = 0; i < value.length; i += 1) total = (total * 31 + value.charCodeAt(i)) >>> 0;
  return total;
}

function glyphFor(tags: readonly string[]): string {
  for (const [tag, glyph] of GLYPHS) if (tags.includes(tag)) return glyph;
  return '🍽️';
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(CHAIN_DIR, { recursive: true });

for (const recipe of SEED_RECIPES) {
  const [from, to] = PALETTES[hash(recipe.id) % PALETTES.length]!;
  const glyph = glyphFor(recipe.tags);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200" role="img" aria-label="${escapeXml(recipe.name)}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="320" height="200" fill="url(#g)"/>
  <text x="160" y="118" font-size="64" text-anchor="middle">${glyph}</text>
</svg>
`;
  writeFileSync(join(OUT_DIR, `${recipe.id}.svg`), svg, 'utf8');
}

for (const chain of SEED_CHAINS) {
  const initials = chain.name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" role="img" aria-label="${escapeXml(chain.name)}">
  <rect width="48" height="48" rx="12" fill="${chain.colorHex}"/>
  <text x="24" y="31" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">${initials}</text>
</svg>
`;
  writeFileSync(join(CHAIN_DIR, `${chain.id}.svg`), svg, 'utf8');
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

console.log(`Wrote ${SEED_RECIPES.length} recipe images and ${SEED_CHAINS.length} chain logos.`);
