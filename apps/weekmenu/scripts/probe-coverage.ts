/**
 * The question this phase exists to answer.
 *
 * Not "how many products did we import" — that number is easy to make large and
 * means nothing. The question is whether the recipes we already have can be
 * priced from real data: for every canonical ingredient a recipe needs, is
 * there at least one real product, with a real price and a readable package,
 * at a given chain?
 *
 * Run with:  pnpm data:coverage
 */
import { readFileSync } from 'node:fs';
import { parsePackage } from '../src/domain/ingestion/package-parser';
import {
  buildIngredientPhrases,
  matchProduct,
  type ProductIngredientMatch,
} from '../src/domain/ingestion/match-ingredient';
import { PRODUCT_MATCH_OVERRIDES } from '../src/data/matching/overrides';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';

const fileArg = process.argv.indexOf('--file');
const path = fileArg !== -1 ? process.argv[fileArg + 1]! : 'data/external/checkjebon-snapshot.json';

interface RawProduct {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
}
interface RawChain {
  n?: string;
  c?: string;
  d?: RawProduct[];
}

const chains = JSON.parse(readFileSync(path, 'utf8')) as RawChain[];
const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);

// Only the ingredients the recipe catalogue actually needs. Coverage of
// ingredients no recipe uses is not a number anybody should act on.
const needed = new Set<string>();
for (const recipe of SEED_RECIPES) {
  for (const line of recipe.ingredients) if (!line.optional) needed.add(line.ingredientId);
}
const pantry = new Set(
  SEED_INGREDIENTS.filter((ingredient) => ingredient.pantryStaple).map((i) => i.id),
);
const mustBuy = [...needed].filter((id) => !pantry.has(id));

console.log(
  `\nDekking van de receptcatalogus — ${SEED_RECIPES.length} recepten, ` +
    `${needed.size} ingrediënten nodig, waarvan ${mustBuy.length} gekocht moeten worden\n`,
);

const head =
  '  ' +
  'keten'.padEnd(12) +
  'producten'.padStart(11) +
  'gematcht'.padStart(10) +
  'auto'.padStart(9) +
  'review'.padStart(9) +
  'afgewezen'.padStart(11) +
  'ingr. >=1'.padStart(11) +
  'dekking'.padStart(10) +
  'bruikbaar'.padStart(11);
console.log(head);
console.log('  ' + '-'.repeat(head.length - 2));

interface ChainResult {
  chain: string;
  covered: Set<string>;
  usable: Set<string>;
  matches: ProductIngredientMatch[];
}
const results: ChainResult[] = [];

for (const chain of chains) {
  const products = chain.d ?? [];
  if (products.length === 0) continue;

  const matches: ProductIngredientMatch[] = [];
  const covered = new Set<string>();
  const usable = new Set<string>();
  let auto = 0;
  let review = 0;
  let rejected = 0;

  for (const product of products) {
    const name = product.n ?? '';
    const match = matchProduct(
      { productId: `${chain.n ?? ''}:${product.l ?? name}`, productName: name },
      phrases,
      PRODUCT_MATCH_OVERRIDES,
    );
    if (!match) continue;
    matches.push(match);

    if (match.status === 'REJECTED') {
      rejected += 1;
      continue;
    }
    if (match.status === 'AUTO_APPROVED' || match.status === 'APPROVED') auto += 1;
    else review += 1;

    covered.add(match.canonicalIngredientId);

    // Optimizer-eligible: an auto-approved match, a real price, a readable pack.
    const price = product.p;
    const pack = parsePackage(product.s);
    if (
      (match.status === 'AUTO_APPROVED' || match.status === 'APPROVED') &&
      typeof price === 'number' &&
      Number.isFinite(price) &&
      price > 0 &&
      pack.status === 'OK'
    ) {
      usable.add(match.canonicalIngredientId);
    }
  }

  const coveredNeeded = mustBuy.filter((id) => covered.has(id)).length;
  const usableNeeded = mustBuy.filter((id) => usable.has(id)).length;
  const pct = (value: number): string => `${((value / mustBuy.length) * 100).toFixed(1)}%`;

  console.log(
    '  ' +
      (chain.n ?? '?').padEnd(12) +
      String(products.length).padStart(11) +
      String(matches.length - rejected).padStart(10) +
      String(auto).padStart(9) +
      String(review).padStart(9) +
      String(rejected).padStart(11) +
      String(coveredNeeded).padStart(11) +
      pct(coveredNeeded).padStart(10) +
      pct(usableNeeded).padStart(11),
  );

  results.push({ chain: chain.n ?? '?', covered, usable, matches });
}

// Which ingredients nobody stocks is the actionable list: those are the recipes
// that cannot be priced for real, whichever chain you shop at.
const nowhere = mustBuy.filter((id) => !results.some((r) => r.usable.has(id)));
console.log(
  `\n  Ingrediënten zonder één bruikbaar product bij welke keten dan ook: ${nowhere.length}`,
);
if (nowhere.length > 0) {
  const names = new Map(SEED_INGREDIENTS.map((i) => [i.id, i.canonicalName]));
  for (const id of nowhere.slice(0, 30)) console.log(`    ${id.padEnd(28)} ${names.get(id) ?? ''}`);
  if (nowhere.length > 30) console.log(`    … en nog ${nowhere.length - 30}`);
}

// Three different questions, deliberately not collapsed into one number.
//
//   every canonical ingredient      how complete the catalogue is overall
//   ingredients recipes actually use  what decides whether a week can be priced
//   weighted by how often they appear  what it costs when one is missing
//
// The third matters because ingredients are not equal: no onion breaks half the
// recipe book, no tempeh breaks one dish.
const usage = new Map<string, number>();
for (const recipe of SEED_RECIPES) {
  for (const line of recipe.ingredients) {
    if (line.optional || pantry.has(line.ingredientId)) continue;
    usage.set(line.ingredientId, (usage.get(line.ingredientId) ?? 0) + 1);
  }
}
const totalUses = [...usage.values()].reduce((sum, n) => sum + n, 0);
const allIds = SEED_INGREDIENTS.filter((i) => !i.pantryStaple).map((i) => i.id);

console.log('\n  Drie soorten dekking, per keten\n');
const head2 =
  '  ' +
  'keten'.padEnd(12) +
  'alle ingr.'.padStart(12) +
  'receptingr.'.padStart(13) +
  'gewogen'.padStart(10);
console.log(head2);
console.log('  ' + '-'.repeat(head2.length - 2));
for (const r of results) {
  const all = allIds.filter((id) => r.usable.has(id)).length / allIds.length;
  const used = mustBuy.filter((id) => r.usable.has(id)).length / mustBuy.length;
  const weighted =
    totalUses === 0
      ? 0
      : [...usage.entries()].filter(([id]) => r.usable.has(id)).reduce((sum, [, n]) => sum + n, 0) /
        totalUses;
  console.log(
    '  ' +
      r.chain.padEnd(12) +
      `${(all * 100).toFixed(1)}%`.padStart(12) +
      `${(used * 100).toFixed(1)}%`.padStart(13) +
      `${(weighted * 100).toFixed(1)}%`.padStart(10),
  );
}

// The ingredients whose absence hurts most: frequently used and not covered.
const ahResult = results.find((r) => r.chain === 'ah');
if (ahResult) {
  const missing = [...usage.entries()]
    .filter(([id]) => !ahResult.usable.has(id))
    .sort((a, b) => b[1] - a[1]);
  if (missing.length > 0) {
    console.log('\n  Grootste gaten bij AH, naar hoe vaak recepten ze nodig hebben\n');
    const names = new Map(SEED_INGREDIENTS.map((i) => [i.id, i.canonicalName]));
    for (const [id, count] of missing.slice(0, 15)) {
      console.log(`    ${String(count).padStart(3)}x  ${id.padEnd(24)} ${names.get(id) ?? ''}`);
    }
  }
}

console.log('');
