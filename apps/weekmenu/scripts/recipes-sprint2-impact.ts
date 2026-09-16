/**
 * What the bigger recipe library changed, measured on both sides.
 *
 *   pnpm recipes:impact
 *
 * Three questions the sprint has to answer with numbers rather than a claim:
 * how many weeks of never-repeating dinners the library carries, what the
 * planner now costs in milliseconds, and whether more recipes reach more real
 * promotions. Each is measured twice in one run — once with the library as it
 * was at 56 recipes, once as it is — so the two columns cannot drift apart.
 *
 * Nothing here is optimised. Sprint 2 measures latency; it does not tune it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { optimiseWeek } from '@/domain/optimization/week-optimizer';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { SPRINT2_RECIPES } from '@/data/seed/recipes-sprint2';
import { DEMO_HOUSEHOLD } from '@/data/seed/demo-household';
import { loadPrijsProfeetSnapshot } from '@/services/promotions/load-snapshot';
import { extractRetailerProductId } from '@/services/promotions/retailer-id';
import type { Recipe } from '@/domain/recipes/types';
import { storeCandidates } from '../tests/support/fixtures';
import { loadRealChains } from '../tests/support/real-data-store';

const ingredients = buildIngredientIndex(SEED_INGREDIENTS);
const all = normaliseRecipes(SEED_RECIPES, ingredients);
const sprint2 = new Set(SPRINT2_RECIPES.map((r) => r.id));
const before = all.filter((r) => !sprint2.has(r.id));
const stores = storeCandidates();

const TODAY = new Date('2026-03-02T09:00:00Z');

function plan(pool: readonly Recipe[]) {
  return optimiseWeek({
    household: DEMO_HOUSEHOLD,
    recipes: pool,
    ingredients,
    stores,
    maxStores: 3,
    conveniencePreference: 'gebalanceerd',
    budget: {},
    startDate: '2026-03-02',
    today: TODAY,
  });
}

/** How many weeks of dinners are in here before a dish has to come round again. */
function weeksWithoutRepeating(pool: readonly Recipe[]) {
  const used = new Set<string>();
  let weeks = 0;
  for (let i = 0; i < 40; i += 1) {
    const result = plan(pool.filter((r) => !used.has(r.id)));
    if (result.status !== 'OK') break;
    for (const day of result.plan.days) used.add(day.recipe.id);
    weeks += 1;
  }
  return { weeks, used: used.size };
}

/**
 * Fastest of N, measured interleaved and after a warm-up.
 *
 * Both matter. Measured back to back, the first library pays for the JIT and
 * came out at 2.006 ms against 1.158 ms for the second — which would have
 * read as "82 more recipes made the planner nearly twice as fast", the exact
 * opposite of what a naive reading expects and equally untrue.
 */
function fastestInterleaved(
  a: readonly Recipe[],
  b: readonly Recipe[],
  runs = 5,
): [number, number] {
  plan(a);
  plan(b);
  let bestA = Number.POSITIVE_INFINITY;
  let bestB = Number.POSITIVE_INFINITY;
  for (let i = 0; i < runs; i += 1) {
    let started = performance.now();
    plan(a);
    bestA = Math.min(bestA, performance.now() - started);
    started = performance.now();
    plan(b);
    bestB = Math.min(bestB, performance.now() - started);
  }
  return [bestA, bestB];
}

/* ── promotions the library can actually reach ───────────────────────────── */

const promo = loadPrijsProfeetSnapshot('data/external/promotions-snapshot.json', {
  readFile: (path) => readFileSync(path, 'utf8'),
  exists: existsSync,
});
const promotions = promo.status === 'LOADED' ? promo.promotions : [];

function reachablePromotions(pool: readonly Recipe[]): number {
  const wanted = new Set(pool.flatMap((r) => r.ingredients.map((l) => l.ingredientId)));
  const fixture = loadRealChains(['ah', 'jumbo', 'lidl']);
  const articles = new Map<string, Set<string>>();
  for (const chain of fixture.chains) {
    const set = new Set<string>();
    for (const offer of chain.allOffers) {
      if (!wanted.has(offer.ingredientId)) continue;
      const id = extractRetailerProductId(
        chain.chainId,
        offer.productId.slice(chain.chainId.length + 1),
      );
      if (id) set.add(id.id.toLowerCase());
    }
    articles.set(chain.chainId, set);
  }
  return promotions.filter((p) => {
    const id = extractRetailerProductId(p.chainId, p.url);
    return id !== undefined && (articles.get(p.chainId)?.has(id.id.toLowerCase()) ?? false);
  }).length;
}

/* ── report ──────────────────────────────────────────────────────────────── */

const beforeWeeks = weeksWithoutRepeating(before);
const afterWeeks = weeksWithoutRepeating(all);
const [beforeMs, afterMs] = fastestInterleaved(before, all);
const beforeReach = reachablePromotions(before);
const afterReach = reachablePromotions(all);

const row = (label: string, a: string | number, b: string | number) =>
  console.log('  ' + label.padEnd(40) + String(a).padStart(10) + String(b).padStart(12));

console.log(`\nSPRINT 2 — IMPACT VAN DE GROTERE RECEPTBIBLIOTHEEK\n`);
console.log('  ' + 'metriek'.padEnd(40) + 'vóór'.padStart(10) + 'na'.padStart(12));
console.log('  ' + '-'.repeat(62));
row('recepten', before.length, all.length);
row('weken zonder herhaling', beforeWeeks.weeks, afterWeeks.weeks);
row('gerechten die daarbij aan bod komen', beforeWeeks.used, afterWeeks.used);
row('optimizer, snelste van 5 (ms)', beforeMs.toFixed(0), afterMs.toFixed(0));
row(`bereikbare promoties (van ${promotions.length})`, beforeReach, afterReach);
console.log('');
if (promotions.length === 0) {
  console.log('  let op: geen promotiesnapshot geladen, de laatste regel is nul bij gebrek aan data');
}
