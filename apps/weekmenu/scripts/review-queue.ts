/**
 * The review queue, sorted by what a decision would actually buy.
 *
 * Grouped per ingredient rather than per product, because that is the unit a
 * human can reason about: "bosui has no usable product and four recipes need
 * it" is a decision worth making, while "here is the fourteenth cashew nut" is
 * not. Ingredients that already have enough good alternatives are marked as
 * such and pushed down, since the goal was never to classify a whole catalogue.
 *
 *   pnpm match:review                     the ingredients worth deciding
 *   pnpm match:review -- --ingredient ui  every candidate for one ingredient
 *   pnpm match:review -- --band LOW
 */
import { resolvePackage } from '../src/domain/ingestion/package-parser';
import { buildIngredientPhrases, matchProduct } from '../src/domain/ingestion/match-ingredient';
import {
  DEFAULT_SUFFICIENCY,
  scoreReviewItem,
  type ReviewBand,
} from '../src/domain/ingestion/review-priority';
import { PRODUCT_MATCH_OVERRIDES } from '../src/data/matching/overrides';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const only =
  args.indexOf('--ingredient') !== -1 ? args[args.indexOf('--ingredient') + 1] : undefined;
const bandFilter =
  args.indexOf('--band') !== -1 ? (args[args.indexOf('--band') + 1] as ReviewBand) : undefined;
const limit = args.indexOf('--limit') !== -1 ? Number(args[args.indexOf('--limit') + 1]) : 12;

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
const ah = chains.find((c) => c.n === 'ah')!;

const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);
const names = new Map(SEED_INGREDIENTS.map((i) => [i.id, i.canonicalName]));

// How often each ingredient is actually cooked with — the weight behind every
// decision below.
const recipeUse = new Map<string, number>();
for (const recipe of SEED_RECIPES) {
  for (const line of recipe.ingredients) {
    if (line.optional) continue;
    const ingredient = SEED_INGREDIENTS.find((i) => i.id === line.ingredientId);
    if (ingredient?.pantryStaple) continue;
    recipeUse.set(line.ingredientId, (recipeUse.get(line.ingredientId) ?? 0) + 1);
  }
}

interface Candidate {
  name: string;
  price: number;
  size: string;
  usable: boolean;
  productId: string;
  rationale: string;
}
const approved = new Map<string, { count: number; sizes: Set<number> }>();
const review = new Map<string, Candidate[]>();

for (const product of ah.d ?? []) {
  const productId = `ah:${product.l ?? product.n ?? ''}`;
  const match = matchProduct(
    { productId, productName: product.n ?? '' },
    phrases,
    PRODUCT_MATCH_OVERRIDES,
  );
  if (!match) continue;
  const pack = resolvePackage(product.s, product.n);
  const priced = typeof product.p === 'number' && Number.isFinite(product.p) && product.p > 0;
  const usable = pack.status === 'OK' && priced;

  if (match.status === 'AUTO_APPROVED' || match.status === 'APPROVED') {
    if (!usable) continue;
    const entry = approved.get(match.canonicalIngredientId) ?? {
      count: 0,
      sizes: new Set<number>(),
    };
    entry.count += 1;
    if (pack.status === 'OK') entry.sizes.add(pack.info.totalAmount);
    approved.set(match.canonicalIngredientId, entry);
    continue;
  }
  if (match.status !== 'NEEDS_REVIEW') continue;

  const list = review.get(match.canonicalIngredientId) ?? [];
  list.push({
    name: product.n ?? '',
    price: product.p ?? 0,
    size: product.s ?? '',
    usable,
    productId,
    rationale: match.rationale,
  });
  review.set(match.canonicalIngredientId, list);
}

interface Row {
  ingredientId: string;
  recipeCount: number;
  approvedCount: number;
  candidates: Candidate[];
  score: number;
  band: ReviewBand;
  reason: string;
  sufficient: boolean;
}
const rows: Row[] = [];
for (const [ingredientId, candidates] of review) {
  const cover = approved.get(ingredientId) ?? { count: 0, sizes: new Set<number>() };
  const context = {
    ingredientId,
    recipeCount: recipeUse.get(ingredientId) ?? 0,
    approvedCount: cover.count,
    packageSizeCount: cover.sizes.size,
  };
  // An ingredient's priority is the best any of its candidates could achieve:
  // one usable candidate is enough to make the group worth opening.
  const best = candidates
    .map((candidate) => scoreReviewItem(context, { usable: candidate.usable }))
    .sort((a, b) => b.score - a.score)[0]!;
  rows.push({
    ingredientId,
    recipeCount: context.recipeCount,
    approvedCount: context.approvedCount,
    candidates,
    score: best.score,
    band: best.band,
    reason: best.reason,
    sufficient: best.sufficientlyCovered,
  });
}
rows.sort((a, b) => b.score - a.score || a.ingredientId.localeCompare(b.ingredientId));

const totalCandidates = [...review.values()].reduce((sum, list) => sum + list.length, 0);
const inBand = (band: ReviewBand) =>
  rows.filter((r) => r.band === band).reduce((sum, r) => sum + r.candidates.length, 0);

console.log(`\nReviewwachtrij — ${totalCandidates} producten, ${rows.length} ingrediënten\n`);
console.log(`  recept-relevant        ${totalCandidates - inBand('IRRELEVANT')}`);
console.log(`  hoge prioriteit        ${inBand('HIGH')}`);
console.log(`  gemiddelde prioriteit  ${inBand('MEDIUM')}`);
console.log(`  lage prioriteit        ${inBand('LOW')}`);
console.log(
  `  optioneel              ${inBand('OPTIONAL')}` +
    `  (ingredient heeft al ≥${DEFAULT_SUFFICIENCY.minimumAlternatives} bruikbare producten in ≥${DEFAULT_SUFFICIENCY.minimumPackageSizes} maten)`,
);
console.log(`  irrelevant             ${inBand('IRRELEVANT')}  (geen actief recept gebruikt dit)`);
console.log(
  `\n  echt de moeite waard   ${inBand('HIGH') + inBand('MEDIUM')}  van ${totalCandidates}`,
);

const shown = rows.filter(
  (r) =>
    (!only || r.ingredientId === only) &&
    (bandFilter ? r.band === bandFilter : only ? true : r.band === 'HIGH' || r.band === 'MEDIUM'),
);

console.log(`\n  Wat het eerst beslist zou moeten worden\n`);
for (const row of shown.slice(0, limit)) {
  console.log(`  ${row.ingredientId.padEnd(22)} ${names.get(row.ingredientId) ?? ''}`);
  console.log(
    `    ${row.band.padEnd(10)} score ${String(row.score).padStart(4)}   ` +
      `${row.approvedCount} goedgekeurd, ${row.candidates.length} te beoordelen` +
      `${row.sufficient ? '  (al voldoende gedekt)' : ''}`,
  );
  console.log(`    waarom: ${row.reason}`);
  for (const candidate of row.candidates.slice(0, only ? 20 : 2)) {
    console.log(
      `      € ${candidate.price.toFixed(2).padStart(6)}  ${(candidate.size || '(geen maat)').padEnd(12)} ` +
        `${candidate.usable ? ' ' : '⚠'} ${candidate.name.slice(0, 46)}`,
    );
    if (only) {
      console.log(
        `           { productId: '${candidate.productId}', ` +
          `canonicalIngredientId: '${row.ingredientId}', status: 'APPROVED' },`,
      );
    }
  }
  console.log('');
}

/*
 * How much human effort each coverage target would take.
 *
 * Greedy and optimistic: it assumes one approval per uncovered ingredient is
 * enough, taking ingredients in order of how much weighted coverage they buy.
 * That is a floor on the work, not a promise — some ingredients have only
 * unusable candidates and no number of approvals will fix them.
 */
const totalUses = [...recipeUse.values()].reduce((sum, n) => sum + n, 0);
const coveredUses = [...recipeUse.entries()]
  .filter(([id]) => (approved.get(id)?.count ?? 0) > 0)
  .reduce((sum, [, n]) => sum + n, 0);

const reachable = rows
  .filter((r) => (approved.get(r.ingredientId)?.count ?? 0) === 0)
  .filter((r) => r.candidates.some((c) => c.usable))
  .map((r) => ({ id: r.ingredientId, uses: recipeUse.get(r.ingredientId) ?? 0 }))
  .sort((a, b) => b.uses - a.uses);

console.log('  Hoeveel beoordelingen tot welke gewogen dekking\n');
console.log(`    nu                     ${((coveredUses / totalUses) * 100).toFixed(1)}%`);
let running = coveredUses;
let reviews = 0;
const targets = [96, 97, 98, 99];
let nextTarget = 0;
for (const item of reachable) {
  if (nextTarget >= targets.length) break;
  running += item.uses;
  reviews += 1;
  while (nextTarget < targets.length && (running / totalUses) * 100 >= targets[nextTarget]!) {
    console.log(
      `    ${targets[nextTarget]}%                    ${reviews} beoordeling${reviews === 1 ? '' : 'en'}` +
        `  (laatste: ${item.id})`,
    );
    nextTarget += 1;
  }
}
for (; nextTarget < targets.length; nextTarget += 1) {
  console.log(`    ${targets[nextTarget]}%                    onbereikbaar met deze bron`);
}
console.log('');
