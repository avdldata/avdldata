/**
 * Is Lidl usable, measured with the code as it stands today?
 *
 * Every number here is produced by the same pipeline AH and Jumbo go through:
 * the same matcher, the same package parser, the same taxonomy, the same
 * candidate reduction. No percentage is carried over from an earlier phase.
 *
 *   pnpm lidl:readiness
 */
import { readFileSync } from 'node:fs';
import { buildIngredientPhrases, matchProduct } from '@/domain/ingestion/match-ingredient';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '@/data/seed/ingredients';
import { SEED_INGREDIENT_VARIANTS } from '@/data/seed/ingredient-taxonomy';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { PRODUCT_MATCH_OVERRIDES } from '@/data/matching/overrides';
import { resolvePackage } from '@/domain/ingestion/package-parser';
import { loadRealChain, type RealChainId } from '../tests/support/real-data-store';

interface Raw {
  readonly n?: string;
  readonly d?: { n?: string; l?: string; s?: string; p?: number }[];
}
const snapshot = JSON.parse(
  readFileSync('data/external/checkjebon-snapshot.json', 'utf8'),
) as Raw[];
const phrases = buildIngredientPhrases(
  SEED_INGREDIENTS,
  SEED_INGREDIENT_ALIASES,
  SEED_INGREDIENT_VARIANTS,
);

/** What every recipe needs, weighted by how often it is needed. */
const need = new Map<string, number>();
for (const recipe of SEED_RECIPES) {
  for (const line of recipe.ingredients)
    need.set(line.ingredientId, (need.get(line.ingredientId) ?? 0) + 1);
}
const totalWeight = [...need.values()].reduce((a, b) => a + b, 0);

function report(chainId: RealChainId): void {
  const chain = snapshot.find((c) => c.n === chainId);
  const products = chain?.d ?? [];
  let withPrice = 0,
    withPackage = 0,
    auto = 0,
    review = 0,
    rejected = 0,
    noMatch = 0;
  const covered = new Set<string>();

  for (const product of products) {
    const name = product.n ?? '';
    const price = product.p;
    const hasPrice = typeof price === 'number' && price > 0;
    if (hasPrice) withPrice += 1;
    const pack = resolvePackage(product.s, name);
    if (pack) withPackage += 1;
    const match = matchProduct(
      { productId: `${chainId}:${product.l ?? name}`, productName: name },
      phrases,
      PRODUCT_MATCH_OVERRIDES,
    );
    if (!match) {
      noMatch += 1;
      continue;
    }
    if (match.status === 'AUTO_APPROVED') auto += 1;
    else if (match.status === 'NEEDS_REVIEW') review += 1;
    else if (match.status === 'REJECTED') rejected += 1;
  }

  // The real gate: product + price + package + approved match + active.
  const fixture = loadRealChain(chainId);
  for (const offer of fixture.allOffers) covered.add(offer.ingredientId);
  const recipeCovered = [...need.keys()].filter((id) => covered.has(id));
  const weighted = recipeCovered.reduce((sum, id) => sum + (need.get(id) ?? 0), 0);

  const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
  console.log(`\n## ${chainId.toUpperCase()}\n`);
  const row = (label: string, value: number, of?: number) =>
    console.log(
      `  ${label.padEnd(36)}${String(value).padStart(7)}${of ? `  ${pct(value, of)}` : ''}`,
    );
  row('producten in momentopname', products.length);
  row('met geldige prijs', withPrice, products.length);
  row('met leesbare verpakking', withPackage, products.length);
  row('AUTO_APPROVED', auto, products.length);
  row('NEEDS_REVIEW', review, products.length);
  row('REJECTED', rejected, products.length);
  row('geen match', noMatch, products.length);
  row('optimizer-eligible', fixture.allOffers.length, products.length);
  row('na kandidaatreductie', fixture.reducedOffers.length);
  row('gedekte canonical ingredients', covered.size);
  row('receptingredienten gedekt', recipeCovered.length, need.size);
  console.log(
    `  ${'gewogen receptdekking'.padEnd(36)}${String(weighted).padStart(7)}  ${pct(weighted, totalWeight)}`,
  );
}

for (const chainId of ['ah', 'jumbo', 'lidl'] as const) report(chainId);
console.log('');
