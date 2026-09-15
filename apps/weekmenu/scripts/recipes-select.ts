/**
 * Pick the shortlist, and measure what it would buy us.
 *
 *   pnpm recipes:select
 *   pnpm recipes:select -- --write     # also write the staging JSON
 *
 * Score every candidate, cluster the near-duplicates, take the top 500 and then
 * the top 300 high-confidence dinners, and — the point of the whole phase —
 * measure how many of the 5.190 real promotions that library would reach.
 *
 * Nothing here becomes a production recipe. The output lands in
 * `data/recipes/candidates/_selected/`, which is staging, and the migration to
 * the seed is a separate decision made after reading the numbers.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Epicurious13kProvider } from '../src/services/recipes/providers/epicurious-13k';
import { ForkRecipeProvider } from '../src/services/recipes/providers/forkrecipe';
import { OpenRecipeArchiveProvider } from '../src/services/recipes/providers/open-recipe-archive';
import { scoreCandidate, type RecipeScore } from '../src/services/recipes/scoring';
import { clusterDuplicates, signatureOf } from '../src/services/recipes/dedupe';
import { matchCanonicalIngredient } from '../src/services/recipes/canonical-matching';
import {
  mayBePublishedCommercially,
  mayBecomeProduction,
} from '../src/services/recipes/candidate-types';
import type { ExternalRecipeCandidate } from '../src/services/recipes/candidate-types';
import { loadPrijsProfeetSnapshot } from '../src/services/promotions/load-snapshot';
import { extractRetailerProductId } from '../src/services/promotions/retailer-id';
import { loadRealChains } from '../tests/support/real-data-store';
import { SEED_INGREDIENTS } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';

const write = process.argv.includes('--write');
const OUT = 'data/recipes/candidates/_selected';

/* ── Context: what our catalogue and the folder already contain ──────────── */

const fixture = loadRealChains(['ah', 'jumbo']);
const retailAvailable = new Set<string>();
const productsByIngredient = new Map<string, number>();
for (const chain of fixture.chains) {
  for (const offer of chain.allOffers) {
    retailAvailable.add(offer.ingredientId);
    productsByIngredient.set(
      offer.ingredientId,
      (productsByIngredient.get(offer.ingredientId) ?? 0) + 1,
    );
  }
}

const promo = loadPrijsProfeetSnapshot('data/external/promotions-snapshot.json', {
  readFile: (path) => readFileSync(path, 'utf8'),
  exists: existsSync,
});
const promotedArticles = new Map<string, Set<string>>();
if (promo.status === 'LOADED') {
  for (const p of promo.promotions) {
    const id = extractRetailerProductId(p.chainId, p.url);
    if (!id) continue;
    const set = promotedArticles.get(p.chainId) ?? new Set<string>();
    set.add(id.id.toLowerCase());
    promotedArticles.set(p.chainId, set);
  }
}
/** Canonical ingredients that at least one real promotion touches today. */
const promoted = new Set<string>();
for (const chain of fixture.chains) {
  for (const offer of chain.allOffers) {
    const id = extractRetailerProductId(
      chain.chainId,
      offer.productId.slice(chain.chainId.length + 1),
    );
    if (id && promotedArticles.get(chain.chainId)?.has(id.id.toLowerCase())) {
      promoted.add(offer.ingredientId);
    }
  }
}

/* ── Load and score ──────────────────────────────────────────────────────── */

const providers = [
  new ForkRecipeProvider(),
  new OpenRecipeArchiveProvider(),
  new Epicurious13kProvider(),
];
const all: ExternalRecipeCandidate[] = providers.flatMap((p) => p.loadCandidates());
console.log(
  `\nRECIPE SELECTION — ${all.length.toLocaleString('nl-NL')} kandidaten uit ${providers.length} bronnen\n`,
);

const cuisineCounts = new Map<string, number>();
const scored = all.map((candidate) => ({
  candidate,
  score: scoreCandidate(candidate, {
    retailAvailable,
    promoted,
    cuisineCounts,
    shortlistSize: 500,
  }),
}));

/* ── Dedupe, then take the shortlists ────────────────────────────────────── */

const viable = scored.filter((row) => row.score.total > 0);
console.log(
  `  bruikbaar (score > 0, licentie toestaat productie)   ${viable.length.toLocaleString('nl-NL')}`,
);

const clusters = clusterDuplicates(
  viable,
  (row) => signatureOf(row.candidate),
  (row) => row.score.total,
);
const deduped = clusters.map((c) => c.best).sort((a, b) => b.score.total - a.score.total);
const removed = clusters.reduce((n, c) => n + c.duplicates.length, 0);
console.log(
  `  na deduplicatie                                     ${deduped.length.toLocaleString('nl-NL')}  (${removed.toLocaleString('nl-NL')} bijna-duplicaten samengevoegd)`,
);

const top500 = deduped.slice(0, 500);
const highConfidence = deduped.filter(
  (row) =>
    row.score.facts.verdict === 'DINNER' &&
    row.score.ingredientCoverage >= 0.8 &&
    row.score.unitParseability >= 0.8 &&
    row.score.facts.ambiguousLines === 0 &&
    mayBecomeProduction(row.candidate.rights),
);
const top300 = highConfidence.slice(0, 300);
console.log(`  TOP 500 kandidaten                                  ${top500.length}`);
console.log(`  high-confidence dinners beschikbaar                 ${highConfidence.length}`);
console.log(`  TOP 300 high-confidence                             ${top300.length}\n`);

/* ── Where they come from, and under what terms ──────────────────────────── */

const bySource = new Map<string, { top500: number; top300: number; commercial: boolean }>();
for (const row of top500) {
  const entry = bySource.get(row.candidate.source) ?? {
    top500: 0,
    top300: 0,
    commercial: mayBePublishedCommercially(row.candidate.rights),
  };
  entry.top500 += 1;
  bySource.set(row.candidate.source, entry);
}
for (const row of top300) {
  const entry = bySource.get(row.candidate.source);
  if (entry) entry.top300 += 1;
}
console.log('  Herkomst van de selectie\n');
console.log('    bron                     top500   top300   commercieel publiceerbaar');
for (const [source, entry] of [...bySource].sort((a, b) => b[1].top500 - a[1].top500)) {
  console.log(
    `    ${source.padEnd(24)} ${String(entry.top500).padStart(6)}   ${String(entry.top300).padStart(6)}   ${entry.commercial ? 'ja' : 'NEE'}`,
  );
}

/* ── New canonical ingredients the shortlist would need ──────────────────── */

interface ConceptRow {
  concept: string;
  recipes: number;
  dinnerRecipes: number;
}
const concepts = new Map<string, ConceptRow>();
for (const row of top500) {
  for (const concept of row.score.facts.newConcepts) {
    const entry = concepts.get(concept) ?? { concept, recipes: 0, dinnerRecipes: 0 };
    entry.recipes += 1;
    if (row.score.facts.verdict === 'DINNER') entry.dinnerRecipes += 1;
    concepts.set(concept, entry);
  }
}
const conceptRows = [...concepts.values()].sort((a, b) => b.recipes - a.recipes);
console.log(
  `\n  Ontbrekende canonical ingredients in de top 500: ${conceptRows.length} concepten\n`,
);
console.log('    ' + 'concept'.padEnd(30) + 'recepten'.padStart(9) + 'dinners'.padStart(9));
for (const row of conceptRows.slice(0, 25)) {
  console.log(
    '    ' +
      row.concept.padEnd(30) +
      String(row.recipes).padStart(9) +
      String(row.dinnerRecipes).padStart(9),
  );
}

/* ── The core measurement ────────────────────────────────────────────────── */

const currentIngredients = new Set(
  SEED_RECIPES.flatMap((r) => r.ingredients.map((i) => i.ingredientId)),
);
const projectedIngredients = new Set(currentIngredients);
for (const row of top300)
  for (const id of row.score.facts.canonicalIds) projectedIngredients.add(id);

const eligibleProducts = (ingredients: ReadonlySet<string>) => {
  const per: Record<string, number> = { ah: 0, jumbo: 0 };
  const articles = new Map<string, Set<string>>();
  for (const chain of fixture.chains) {
    const set = new Set<string>();
    for (const offer of chain.allOffers) {
      if (!ingredients.has(offer.ingredientId)) continue;
      per[chain.chainId] = (per[chain.chainId] ?? 0) + 1;
      const id = extractRetailerProductId(
        chain.chainId,
        offer.productId.slice(chain.chainId.length + 1),
      );
      if (id) set.add(id.id.toLowerCase());
    }
    articles.set(chain.chainId, set);
  }
  let reachable = 0;
  if (promo.status === 'LOADED') {
    for (const p of promo.promotions) {
      const id = extractRetailerProductId(p.chainId, p.url);
      if (id && articles.get(p.chainId)?.has(id.id.toLowerCase())) reachable += 1;
    }
  }
  return { ah: per.ah ?? 0, jumbo: per.jumbo ?? 0, reachable };
};

const before = eligibleProducts(currentIngredients);
const after = eligibleProducts(projectedIngredients);
const totalPromotions = promo.status === 'LOADED' ? promo.promotions.length : 0;
const pct = (n: number) => `${((n / Math.max(1, totalPromotions)) * 100).toFixed(1)}%`;

console.log(`\n  IMPACT — huidige receptuniverse tegenover de top-300 kandidaten\n`);
const head =
  '    ' +
  'metriek'.padEnd(40) +
  'nu'.padStart(10) +
  'projectie'.padStart(12) +
  'verschil'.padStart(11);
console.log(head);
console.log('    ' + '-'.repeat(head.length - 4));
const row = (label: string, a: number, b: number) =>
  console.log(
    '    ' +
      label.padEnd(40) +
      String(a).padStart(10) +
      String(b).padStart(12) +
      String(b - a).padStart(11),
  );
row('canonical ingredients in recepten', currentIngredients.size, projectedIngredients.size);
row('recepten', SEED_RECIPES.length, SEED_RECIPES.length + top300.length);
row('optimizer-eligible AH-producten', before.ah, after.ah);
row('optimizer-eligible Jumbo-producten', before.jumbo, after.jumbo);
row('samen', before.ah + before.jumbo, after.ah + after.jumbo);
row('bereikbare promoties', before.reachable, after.reachable);
console.log(
  `\n    van ${totalPromotions.toLocaleString('nl-NL')} promoties: ${pct(before.reachable)} nu, ${pct(after.reachable)} geprojecteerd\n`,
);
console.log(
  `    De projectie gaat uit van de canonical ingredients die de top 300 nodig\n` +
    `    heeft en die wij al modelleren. Ingrediënten die nog niet bestaan tellen\n` +
    `    niet mee: die moeten eerst gemodelleerd en gematcht worden, en tot dat\n` +
    `    gebeurd is zouden ze een belofte zijn in plaats van een meting.\n`,
);

/* ── Diversity of the shortlist ──────────────────────────────────────────── */

const cuisines = new Map<string, number>();
const methods = new Map<string, number>();
for (const r of top300) {
  const sig = signatureOf(r.candidate);
  cuisines.set(sig.cuisine, (cuisines.get(sig.cuisine) ?? 0) + 1);
  methods.set(`${sig.method}/${sig.carb}`, (methods.get(`${sig.method}/${sig.carb}`) ?? 0) + 1);
}
console.log('  Spreiding van de top 300\n');
console.log(
  '    keukens: ' +
    [...cuisines]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => `${k} ${v}`)
      .join(', '),
);
console.log(
  '    vormen:  ' +
    [...methods]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => `${k} ${v}`)
      .join(', '),
);

if (write) {
  mkdirSync(OUT, { recursive: true });
  const dump = (name: string, rows: { candidate: ExternalRecipeCandidate; score: RecipeScore }[]) =>
    writeFileSync(
      `${OUT}/${name}.json`,
      `${JSON.stringify(
        rows.map((r) => ({
          source: r.candidate.source,
          externalId: r.candidate.externalId,
          sourceUrl: r.candidate.sourceUrl,
          rights: r.candidate.rights,
          attribution: r.candidate.attribution,
          title: r.candidate.title,
          cuisine: r.candidate.cuisine,
          servings: r.candidate.servings,
          score: r.score.total,
          facts: r.score.facts,
          ingredients: r.candidate.ingredients,
        })),
        null,
        2,
      )}\n`,
    );
  dump('top500', top500);
  dump('top300', top300);
  writeFileSync(`${OUT}/missing-concepts.json`, `${JSON.stringify(conceptRows, null, 2)}\n`);
  console.log(`\n  Staging weggeschreven naar ${OUT}/\n`);
}

void SEED_INGREDIENTS;
void matchCanonicalIngredient;
