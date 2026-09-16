/**
 * What the production recipe library actually contains.
 *
 *   pnpm recipes:report            the full profile
 *   pnpm recipes:report --json     the same numbers as JSON, for the baseline file
 *
 * This is the measurement behind every claim Sprint 2 makes about the library:
 * how many dinners there are, how many survive deduplication, and whether the
 * spread across cuisines, carbohydrates and proteins is real or just asserted.
 */
import { writeFileSync } from 'node:fs';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { SPRINT2_RECIPES } from '@/data/seed/recipes-sprint2';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { checkDiversity, MEAL_STYLES, profileLibrary } from '@/domain/recipes/library';
import { assessFeasibility } from '@/domain/recipes/feasibility';
import { isProductionSafeLicence } from '@/domain/recipes/types';
import { loadRealChains } from '../tests/support/real-data-store';
import { validateLibrary } from '@/domain/recipes/validation';

/**
 * `--menu base` reports the library as it stood before Sprint 2.
 *
 * The before/after comparison has to come out of the same code, or the two
 * columns start measuring subtly different things the moment either side is
 * touched. Keeping it a flag on one script means there is only ever one
 * definition of "primary carbohydrate" or "buyable".
 */
const baseOnly =
  process.argv.includes('--menu') && process.argv[process.argv.indexOf('--menu') + 1] === 'base';
const authored = baseOnly
  ? SEED_RECIPES.filter((r) => !SPRINT2_RECIPES.some((s) => s.id === r.id))
  : SEED_RECIPES;

const ingredients = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(authored, ingredients);
const profile = profileLibrary(recipes, ingredients);
const warnings = checkDiversity(profile);
const problems = validateLibrary(recipes, ingredients, authored);

const fixture = loadRealChains(['ah', 'jumbo', 'lidl']);
const offersByChain = new Map<string, Set<string>>();
for (const chain of fixture.chains) {
  const set = new Set<string>();
  for (const offer of chain.allOffers) set.add(offer.ingredientId);
  offersByChain.set(chain.chainId, set);
}
const feasibility = recipes.map((r) => assessFeasibility(r, ingredients, offersByChain));
const feasiblePerChain = new Map<string, number>();
for (const chainId of offersByChain.keys()) {
  feasiblePerChain.set(chainId, feasibility.filter((f) => f.chains.includes(chainId)).length);
}
const feasibleCombined = feasibility.filter((f) => f.feasibleCombined).length;

const asJson = process.argv.includes('--json');
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;

function pct(count: number): string {
  return `${((count / profile.total) * 100).toFixed(1)}%`;
}

function table(counts: ReadonlyMap<string, number>): string {
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => `    ${label.padEnd(22)} ${String(count).padStart(4)}  ${pct(count)}`)
    .join('\n');
}

const summary = {
  total: profile.total,
  uniqueAfterDedupe: profile.uniqueAfterDedupe,
  duplicatePairs: profile.duplicatePairs.length,
  cuisines: Object.fromEntries(profile.cuisines),
  mealStyles: Object.fromEntries(MEAL_STYLES.map((s) => [s, profile.mealStyles.get(s) ?? 0])),
  methods: Object.fromEntries(profile.methods),
  primaryCarbs: Object.fromEntries(profile.primaryCarbs),
  proteins: Object.fromEntries(profile.proteins),
  vegetarian: profile.vegetarian,
  vegan: profile.vegan,
  fish: profile.fish,
  chicken: profile.chicken,
  beefPork: profile.beefPork,
  avgIngredientCount: Number(profile.avgIngredientCount.toFixed(2)),
  avgPrepMinutes: Number(profile.avgPrepMinutes.toFixed(1)),
  avgCookMinutes: Number(profile.avgCookMinutes.toFixed(1)),
  avgTotalMinutes: Number(profile.avgTotalMinutes.toFixed(1)),
  avgKcal: Number(profile.avgKcal.toFixed(0)),
  canonicalIngredientsUsed: profile.canonicalIngredientsUsed.length,
  canonicalIngredientsAvailable: ingredients.size,
  canonicalIngredientsUnused: profile.canonicalIngredientsUnused,
  licences: Object.fromEntries(profile.licences),
  feasiblePerChain: Object.fromEntries(feasiblePerChain),
  feasibleCombined,
  diversityWarnings: warnings.length,
  validationProblems: problems.length,
};

if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`geschreven: ${outPath}`);
}

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('=== RECIPE LIBRARY ===\n');
  console.log(`  totaal                     ${profile.total}`);
  console.log(`  uniek na dedupe            ${profile.uniqueAfterDedupe}`);
  console.log(`  duplicaatparen             ${profile.duplicatePairs.length}`);
  for (const pair of profile.duplicatePairs) {
    console.log(
      `    ${pair.a} ~ ${pair.b}  [${pair.key}]  ingredienten ${(pair.ingredientOverlap * 100).toFixed(0)}%  titel ${(pair.titleSimilarity * 100).toFixed(0)}%`,
    );
  }

  console.log('\n  cuisines');
  console.log(table(profile.cuisines as ReadonlyMap<string, number>));
  console.log('\n  primaire koolhydraat');
  console.log(table(profile.primaryCarbs as ReadonlyMap<string, number>));
  console.log('\n  bereidingswijze');
  console.log(table(profile.methods as ReadonlyMap<string, number>));
  console.log('\n  primair eiwit');
  console.log(table(profile.proteins as ReadonlyMap<string, number>));
  console.log('\n  meal styles (een recept kan er meerdere hebben)');
  console.log(
    MEAL_STYLES.map((style) => {
      const count = profile.mealStyles.get(style) ?? 0;
      return `    ${style.padEnd(22)} ${String(count).padStart(4)}  ${pct(count)}`;
    }).join('\n'),
  );

  console.log('\n  dieet');
  console.log(
    `    vegetarisch            ${String(profile.vegetarian).padStart(4)}  ${pct(profile.vegetarian)}`,
  );
  console.log(
    `    veganistisch           ${String(profile.vegan).padStart(4)}  ${pct(profile.vegan)}`,
  );
  console.log(
    `    vis                    ${String(profile.fish).padStart(4)}  ${pct(profile.fish)}`,
  );
  console.log(
    `    kip                    ${String(profile.chicken).padStart(4)}  ${pct(profile.chicken)}`,
  );
  console.log(
    `    rund/varken            ${String(profile.beefPork).padStart(4)}  ${pct(profile.beefPork)}`,
  );

  console.log('\n  gemiddelden');
  console.log(`    ingredienten           ${profile.avgIngredientCount.toFixed(2)}`);
  console.log(`    prep (min)             ${profile.avgPrepMinutes.toFixed(1)}`);
  console.log(`    cook (min)             ${profile.avgCookMinutes.toFixed(1)}`);
  console.log(`    totaal (min)           ${profile.avgTotalMinutes.toFixed(1)}`);
  console.log(`    kcal per portie        ${profile.avgKcal.toFixed(0)}`);

  console.log('\n  canonical ingredienten');
  console.log(
    `    gebruikt               ${profile.canonicalIngredientsUsed.length} / ${ingredients.size}`,
  );
  console.log(`    ongebruikt             ${profile.canonicalIngredientsUnused.length}`);
  if (profile.canonicalIngredientsUnused.length > 0) {
    console.log(`      ${profile.canonicalIngredientsUnused.join(', ')}`);
  }

  console.log('\n  licenties');
  console.log(table(profile.licences));
  const unsafe = recipes.filter((r) => !isProductionSafeLicence(r.provenance.licence));
  console.log(`    niet productie-veilig  ${unsafe.length}`);
  for (const recipe of unsafe) console.log(`      ${recipe.id} (${recipe.provenance.licence})`);

  console.log('\n=== RETAIL FEASIBILITY ===\n');
  for (const [chainId, count] of [...feasiblePerChain].sort()) {
    console.log(`    ${chainId.padEnd(22)} ${String(count).padStart(4)}  ${pct(count)}`);
  }
  console.log(
    `    ${'gecombineerd'.padEnd(22)} ${String(feasibleCombined).padStart(4)}  ${pct(feasibleCombined)}`,
  );
  const blocked = new Map<string, number>();
  for (const f of feasibility) {
    for (const id of f.missingEverywhere) blocked.set(id, (blocked.get(id) ?? 0) + 1);
  }
  if (blocked.size > 0) {
    console.log('\n    nergens te koop, per ingredient (aantal recepten):');
    console.log(table(blocked));
  }

  console.log('\n=== DIVERSITEITSPOORT ===\n');
  if (warnings.length === 0) console.log('  geen waarschuwingen');
  for (const warning of warnings) {
    const limit =
      warning.kind === 'STYLE_MISSING'
        ? `minimaal ${warning.limit}`
        : `maximaal ${(warning.limit * 100).toFixed(0)}%`;
    console.log(
      `  ${warning.kind.padEnd(16)} ${warning.label.padEnd(20)} ${String(warning.count).padStart(4)}  ${pct(warning.count)}  (${limit})`,
    );
  }

  console.log('\n=== VALIDATIE ===\n');
  if (problems.length === 0) console.log('  geen problemen');
  const byCode = new Map<string, number>();
  for (const problem of problems) byCode.set(problem.code, (byCode.get(problem.code) ?? 0) + 1);
  console.log(table(byCode));
  for (const problem of problems.filter((p) => p.severity === 'ERROR')) {
    console.log(`  ERROR  ${problem.recipeId.padEnd(34)} ${problem.code}  ${problem.detail}`);
  }
  for (const problem of problems.filter((p) => p.severity === 'WARNING')) {
    console.log(`  WARN   ${problem.recipeId.padEnd(34)} ${problem.code}  ${problem.detail}`);
  }
}
