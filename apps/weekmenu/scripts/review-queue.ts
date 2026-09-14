/**
 * The products the matcher will not decide on its own.
 *
 * Deliberately a terminal list rather than a screen: the queue is a development
 * tool, and what it needs to do is let someone see a decision, make it, and
 * write it down. Copy the suggested line into `src/data/matching/overrides.ts`
 * and it becomes permanent.
 *
 *   pnpm match:review                      the twenty most common cases
 *   pnpm match:review -- --ingredient ui   everything queued for one ingredient
 *   pnpm match:review -- --limit 50
 */
import { readFileSync } from 'node:fs';
import { parsePackage } from '../src/domain/ingestion/package-parser';
import { buildIngredientPhrases, matchProduct } from '../src/domain/ingestion/match-ingredient';
import { PRODUCT_MATCH_OVERRIDES } from '../src/data/matching/overrides';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';

const args = process.argv.slice(2);
const only =
  args.indexOf('--ingredient') !== -1 ? args[args.indexOf('--ingredient') + 1] : undefined;
const limit = args.indexOf('--limit') !== -1 ? Number(args[args.indexOf('--limit') + 1]) : 20;
const chainName = args.indexOf('--chain') !== -1 ? args[args.indexOf('--chain') + 1]! : 'ah';

interface RawProduct {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
}
const chains = JSON.parse(readFileSync('data/external/checkjebon-snapshot.json', 'utf8')) as {
  n?: string;
  d?: RawProduct[];
}[];
const chain = chains.find((c) => c.n === chainName);
if (!chain) throw new Error(`geen keten "${chainName}"`);

const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);
const names = new Map(SEED_INGREDIENTS.map((i) => [i.id, i.canonicalName]));

// Only ingredients a recipe actually needs: reviewing products for ingredients
// nobody cooks with is work that changes nothing.
const needed = new Set<string>();
for (const recipe of SEED_RECIPES) {
  for (const line of recipe.ingredients) if (!line.optional) needed.add(line.ingredientId);
}

interface QueueItem {
  productId: string;
  name: string;
  price: number | undefined;
  size: string;
  ingredientId: string;
  confidence: number;
  rationale: string;
  reasons: string;
  packageOk: boolean;
}
const queue: QueueItem[] = [];

for (const product of chain.d ?? []) {
  const productId = `${chainName}:${product.l ?? product.n ?? ''}`;
  const match = matchProduct(
    { productId, productName: product.n ?? '' },
    phrases,
    PRODUCT_MATCH_OVERRIDES,
  );
  if (!match || match.status !== 'NEEDS_REVIEW') continue;
  if (!needed.has(match.canonicalIngredientId)) continue;
  if (only && match.canonicalIngredientId !== only) continue;

  queue.push({
    productId,
    name: product.n ?? '',
    price: product.p,
    size: product.s ?? '',
    ingredientId: match.canonicalIngredientId,
    confidence: match.confidence,
    rationale: match.rationale,
    reasons: match.reasons.join(' + '),
    packageOk: parsePackage(product.s).status === 'OK',
  });
}

// Most-frequent ingredients first: one decision about "ui" unblocks more weeks
// than one about an ingredient a single recipe uses.
const perIngredient = new Map<string, number>();
for (const item of queue) {
  perIngredient.set(item.ingredientId, (perIngredient.get(item.ingredientId) ?? 0) + 1);
}
queue.sort(
  (a, b) =>
    (perIngredient.get(b.ingredientId) ?? 0) - (perIngredient.get(a.ingredientId) ?? 0) ||
    b.confidence - a.confidence ||
    a.name.localeCompare(b.name),
);

console.log(
  `\nReviewwachtrij — ${chain.n}, ${queue.length} producten wachten op een oordeel` +
    `${only ? ` (alleen ${only})` : ''}\n`,
);

for (const item of queue.slice(0, limit)) {
  console.log(`  ${item.name}`);
  console.log(
    `    € ${(item.price ?? 0).toFixed(2)}  ${item.size || '(geen maat)'}` +
      `${item.packageOk ? '' : '  ⚠ verpakking onleesbaar'}`,
  );
  console.log(
    `    voorstel: ${item.ingredientId} (${names.get(item.ingredientId) ?? '?'})  ` +
      `zekerheid ${(item.confidence * 100).toFixed(0)}%`,
  );
  console.log(`    ${item.reasons}: ${item.rationale}`);
  console.log(
    `    goedkeuren → { productId: '${item.productId}', ` +
      `canonicalIngredientId: '${item.ingredientId}', status: 'APPROVED' },`,
  );
  console.log('');
}

if (queue.length > limit) {
  console.log(`  … en nog ${queue.length - limit}. Gebruik --limit of --ingredient.\n`);
}
