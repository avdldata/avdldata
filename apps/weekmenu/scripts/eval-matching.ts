/**
 * How good is product → ingredient matching, measured against ground truth?
 *
 *   pnpm match:eval            summary
 *   pnpm match:eval --misses   plus every mistake, so the next fix is chosen
 *                              from evidence rather than from imagination
 */
import { SEED_INGREDIENTS } from '../src/data/seed/ingredients';
import { GOLDEN_EXAMPLES } from '../tests/support/golden-matches';
import { evaluateMatcher } from '../tests/support/match-evaluation';

// A label that points at an ingredient which does not exist would silently
// grade the matcher against nothing.
const known = new Set(SEED_INGREDIENTS.map((i) => i.id));
const unknown = [...new Set(GOLDEN_EXAMPLES.map((e) => e.ingredientId))].filter(
  (id) => !known.has(id),
);
if (unknown.length > 0) {
  console.log(`\n  ONBEKENDE INGREDIENT-IDS IN HET CORPUS: ${unknown.join(', ')}\n`);
}

const result = evaluateMatcher();
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

console.log(`\nMatching gemeten tegen ${result.total} handmatig gelabelde voorbeelden\n`);
const line = (label: string, value: string): void => console.log(`  ${label.padEnd(26)} ${value}`);
line('auto-goedgekeurd', String(result.autoApproved));
line('naar review', String(result.needsReview));
line('afgewezen / geen match', String(result.rejectedOrUnmatched));
console.log('');
line('terecht goedgekeurd', String(result.truePositives));
line('ONTERECHT goedgekeurd', String(result.falsePositives));
line('gemist (valide, niet auto)', String(result.falseNegatives));
console.log('');
line('precision (auto-tier)', pct(result.precision));
line('recall', pct(result.recall));
line('F1', pct(result.f1));

if (process.argv.includes('--misses')) {
  if (result.falsePositiveExamples.length > 0) {
    console.log('\n  ONTERECHT GOEDGEKEURD — elk hiervan is een verkeerde aankoop\n');
    for (const { example, reason } of result.falsePositiveExamples) {
      console.log(`    [${example.label}] ${example.productName}`);
      console.log(`        -> ${example.ingredientId}: ${reason}`);
    }
  }
  if (result.falseNegativeExamples.length > 0) {
    console.log('\n  GEMIST — valide, maar niet automatisch goedgekeurd\n');
    for (const { example, status, reason } of result.falseNegativeExamples) {
      console.log(`    [${status}] ${example.productName}`);
      console.log(`        -> ${example.ingredientId}: ${reason}`);
    }
  }
}

console.log('');
process.exit(result.falsePositives > 0 ? 1 : 0);
