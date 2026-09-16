/**
 * Re-judge the candidate pool with the catalogue as it stands today.
 *
 *   pnpm recipes:reassess
 *
 * No new corpus is fetched and nothing is scraped. The question is narrower and
 * worth answering before a single recipe is written by hand: the ingredient
 * taxonomy grew from 122 to 136 canonical ingredients, gained variants, retail
 * forms and composites, so candidates that were rejected for an unmatchable
 * line may now be usable. This script re-runs the same funnel and prints the
 * before/after per corpus, split by licence.
 *
 * The licence split is the point of the second half. A candidate that clears
 * every technical bar and cannot be licensed is not a recipe we have — the
 * whole funnel is reported per tier so the two constraints never get confused
 * with one another.
 */
import { Epicurious13kProvider } from '../src/services/recipes/providers/epicurious-13k';
import { ForkRecipeProvider } from '../src/services/recipes/providers/forkrecipe';
import { OpenRecipeArchiveProvider } from '../src/services/recipes/providers/open-recipe-archive';
import { classifyDinner } from '../src/services/recipes/dinner-classifier';
import { matchCanonicalIngredient } from '../src/services/recipes/canonical-matching';
import { normaliseAmount } from '../src/services/recipes/units';
import {
  mayBePublishedCommercially,
  mayBecomeProduction,
  type RecipeCandidateProvider,
  type SourceRights,
} from '../src/services/recipes/candidate-types';
import { SEED_INGREDIENT_VARIANTS } from '../src/data/seed/ingredient-taxonomy';
import { SEED_INGREDIENTS } from '../src/data/seed/ingredients';
import { loadRealChains } from '../tests/support/real-data-store';

/**
 * The fourteen ids the taxonomy phase added, so "before" is reconstructable
 * without keeping a stale number from an earlier report.
 */
const ADDED_THIS_PHASE = new Set([
  'pasta',
  'rijst',
  'maistortilla',
  'asperges',
  'geitenkaas',
  'rookworst',
  'shoarmavlees',
  'hummus',
  'pesto',
  'pastasaus',
  'satesaus',
  'sriracha',
  'taco-kruidenmix',
  'roerbakgroentemix',
]);

const catalogue = new Set(SEED_INGREDIENTS.map((i) => i.id));
const variantTargets = new Set(SEED_INGREDIENT_VARIANTS.map((v) => v.id));

const fixture = loadRealChains(['ah', 'jumbo', 'lidl']);
const retailAvailable = new Set<string>();
for (const chain of fixture.chains) {
  for (const offer of chain.allOffers) retailAvailable.add(offer.ingredientId);
}

/** A candidate is usable when we can name every line and weigh most of them. */
const MIN_COVERAGE = 0.9;
const MIN_PARSEABILITY = 0.8;

interface Funnel {
  readonly source: string;
  readonly rights: SourceRights;
  total: number;
  dinner: number;
  coveredBefore: number;
  coveredAfter: number;
  usableBefore: number;
  usableAfter: number;
  retailFeasible: number;
  productionSafe: number;
  newlyUnlocked: string[];
}

const providers: RecipeCandidateProvider[] = [
  new ForkRecipeProvider(),
  new OpenRecipeArchiveProvider(),
  new Epicurious13kProvider(),
];

const rows: Funnel[] = [];

for (const provider of providers) {
  const row: Funnel = {
    source: provider.source.id,
    rights: provider.source.rights,
    total: 0,
    dinner: 0,
    coveredBefore: 0,
    coveredAfter: 0,
    usableBefore: 0,
    usableAfter: 0,
    retailFeasible: 0,
    productionSafe: 0,
    newlyUnlocked: [],
  };

  for (const candidate of provider.loadCandidates()) {
    row.total += 1;
    const verdict = classifyDinner(candidate).verdict;
    if (verdict !== 'DINNER' && verdict !== 'POSSIBLE_DINNER') continue;
    row.dinner += 1;

    let matchedAfter = 0;
    let matchedBefore = 0;
    let rejected = 0;
    let parseable = 0;
    const ids = new Set<string>();
    for (const line of candidate.ingredients) {
      const match = matchCanonicalIngredient(line.rawName ?? line.rawText);
      if (match.kind === 'REJECT') {
        rejected += 1;
      } else if (match.kind === 'EXACT' || match.kind === 'SAFE_ALIAS') {
        matchedAfter += 1;
        // The "before" column is the same matcher minus everything this phase
        // introduced: the fourteen new ids and the ten variants.
        const id = match.ingredientId ?? '';
        const viaNew = ADDED_THIS_PHASE.has(id) || variantTargets.has(match.variantId ?? '');
        if (!viaNew) matchedBefore += 1;
        if (catalogue.has(id)) ids.add(id);
      }
      if (normaliseAmount(line.quantity, line.unit).value !== undefined) parseable += 1;
    }

    const relevant = Math.max(1, candidate.ingredients.length - rejected);
    const coverageAfter = matchedAfter / relevant;
    const coverageBefore = matchedBefore / relevant;
    const parseability =
      candidate.ingredients.length === 0 ? 0 : parseable / candidate.ingredients.length;

    if (coverageBefore >= MIN_COVERAGE) row.coveredBefore += 1;
    if (coverageAfter >= MIN_COVERAGE) row.coveredAfter += 1;

    const usableBefore = coverageBefore >= MIN_COVERAGE && parseability >= MIN_PARSEABILITY;
    const usableAfter = coverageAfter >= MIN_COVERAGE && parseability >= MIN_PARSEABILITY;
    if (usableBefore) row.usableBefore += 1;
    if (usableAfter) {
      row.usableAfter += 1;
      if (!usableBefore && row.newlyUnlocked.length < 25) row.newlyUnlocked.push(candidate.title);
      const buyable = [...ids].every((id) => retailAvailable.has(id));
      if (buyable) row.retailFeasible += 1;
      if (buyable && mayBePublishedCommercially(provider.source.rights)) row.productionSafe += 1;
    }
  }

  rows.push(row);
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

console.log('=== HERBEOORDELING KANDIDAATPOOL (136 canonical ingredienten) ===\n');
console.log(
  '  corpus                rights            totaal  dinner   dekking>=90%        bruikbaar          retail   prod-safe',
);
console.log(
  '                                                            voor    na       voor    na',
);
for (const row of rows) {
  console.log(
    `  ${row.source.padEnd(20)} ${row.rights.padEnd(16)} ${pad(row.total, 7)} ${pad(row.dinner, 7)} ${pad(row.coveredBefore, 7)} ${pad(row.coveredAfter, 7)}  ${pad(row.usableBefore, 7)} ${pad(row.usableAfter, 7)} ${pad(row.retailFeasible, 8)} ${pad(row.productionSafe, 10)}`,
  );
}

const totals = rows.reduce(
  (acc, row) => ({
    total: acc.total + row.total,
    dinner: acc.dinner + row.dinner,
    usableBefore: acc.usableBefore + row.usableBefore,
    usableAfter: acc.usableAfter + row.usableAfter,
    retailFeasible: acc.retailFeasible + row.retailFeasible,
    productionSafe: acc.productionSafe + row.productionSafe,
  }),
  { total: 0, dinner: 0, usableBefore: 0, usableAfter: 0, retailFeasible: 0, productionSafe: 0 },
);
console.log(
  `\n  TOTAAL${' '.repeat(33)}${pad(totals.total, 7)} ${pad(totals.dinner, 7)} ${' '.repeat(16)}${pad(totals.usableBefore, 7)} ${pad(totals.usableAfter, 7)} ${pad(totals.retailFeasible, 8)} ${pad(totals.productionSafe, 10)}`,
);
console.log(
  `\n  winst door de taxonomie-uitbreiding: ${totals.usableAfter - totals.usableBefore} extra bruikbare kandidaten`,
);

console.log('\n=== LICENTIEPOORT ===\n');
for (const row of rows) {
  const production = mayBecomeProduction(row.rights);
  const commercial = mayBePublishedCommercially(row.rights);
  console.log(
    `  ${row.source.padEnd(20)} ${row.rights.padEnd(16)} productie=${production ? 'ja ' : 'nee'}  commercieel=${commercial ? 'ja ' : 'nee'}  bruikbaar=${row.usableAfter}`,
  );
}

console.log('\n=== VOORBEELDEN DIE NU PAS DOORKOMEN ===');
for (const row of rows) {
  if (row.newlyUnlocked.length === 0) continue;
  console.log(`\n  ${row.source}`);
  for (const title of row.newlyUnlocked) console.log(`    ${title}`);
}
