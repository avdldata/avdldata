/**
 * How many recipes can the planner actually offer today?
 *
 *   pnpm recipes:selectable
 *
 * Three different numbers, and the difference between them is the point:
 *
 *   A  total production records        every recipe in the library
 *   B  currently selectable            those the active catalogue can sell
 *   C  unique selectable               B with near-duplicates collapsed
 *
 * Only C is the library the user experiences, and only C counts towards the
 * Sprint 2 gate of 120.
 */
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { partitionByAvailability } from '@/domain/recipes/feasibility';
import { findDuplicatePairs } from '@/domain/recipes/library';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';
import { loadRealChains } from '../tests/support/real-data-store';

const ingredients = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(SEED_RECIPES, ingredients);

// The same union the app builds through the provider, taken here straight from
// the real fixture so the script needs no server runtime.
const fixture = loadRealChains(['ah', 'jumbo', 'lidl']);
const purchasable = new Set<string>();
for (const chain of fixture.chains) {
  for (const offer of chain.allOffers) purchasable.add(offer.ingredientId);
}

const { available, unavailable } = partitionByAvailability(recipes, ingredients, purchasable);

const duplicatePairs = findDuplicatePairs(available, ingredients);
const removed = new Set<string>();
for (const pair of duplicatePairs) if (!removed.has(pair.a)) removed.add(pair.b);

const blocking = new Map<string, string[]>();
for (const verdict of unavailable) {
  for (const id of verdict.missingIngredientIds) {
    blocking.set(id, [...(blocking.get(id) ?? []), verdict.recipeId]);
  }
}

console.log('\nRECEPTEN DIE DE PLANNER MAG KIEZEN\n');
console.log(`  A  productierecords                 ${recipes.length}`);
console.log(`  B  nu selecteerbaar                 ${available.length}`);
console.log(`  C  uniek binnen selecteerbaar       ${available.length - removed.size}`);
console.log(`     niet beschikbaar (datagat)       ${unavailable.length}`);

console.log('\n  ontbrekende ingredienten\n');
for (const [id, ids] of [...blocking].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`    ${id.padEnd(22)} ${String(ids.length).padStart(3)} recept(en)`);
  for (const recipeId of ids.sort()) console.log(`        ${recipeId}`);
}

if (duplicatePairs.length > 0) {
  console.log('\n  duplicaatparen binnen selecteerbaar\n');
  for (const pair of duplicatePairs) {
    console.log(
      `    ${pair.a} ~ ${pair.b}  [${pair.key}]  ingredienten ${(pair.ingredientOverlap * 100).toFixed(0)}%`,
    );
  }
}

const gate = available.length - removed.size >= 120;
console.log(`\n  poort >= 120 uniek selecteerbaar: ${gate ? 'GEHAALD' : 'NIET GEHAALD'}\n`);
