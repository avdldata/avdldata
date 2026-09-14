/**
 * How good is product → ingredient matching, measured against ground truth?
 *
 *   pnpm match:eval                 Albert Heijn
 *   pnpm match:eval --chain jumbo   Jumbo
 *   pnpm match:eval --chain both    both corpora, and the two side by side
 *   pnpm match:eval --misses        plus every mistake, so the next fix is
 *                                   chosen from evidence rather than imagination
 */
import { SEED_INGREDIENTS } from '../src/data/seed/ingredients';
import { GOLDEN_EXAMPLES, type GoldenExample } from '../tests/support/golden-matches';
import { JUMBO_GOLDEN_EXAMPLES } from '../tests/support/golden-matches-jumbo';
import { evaluateMatcher, type MatchEvaluation } from '../tests/support/match-evaluation';

const args = process.argv.slice(2);
const chainArgument = (args[args.indexOf('--chain') + 1] ?? 'ah').toLowerCase();
const chain = args.includes('--chain') ? chainArgument : 'ah';

const CORPORA: Record<string, readonly GoldenExample[]> = {
  ah: GOLDEN_EXAMPLES,
  jumbo: JUMBO_GOLDEN_EXAMPLES,
};

const selected: [string, readonly GoldenExample[]][] =
  chain === 'both'
    ? [
        ['ah', GOLDEN_EXAMPLES],
        ['jumbo', JUMBO_GOLDEN_EXAMPLES],
      ]
    : [[chain, CORPORA[chain] ?? GOLDEN_EXAMPLES]];

if (!(chain in CORPORA) && chain !== 'both') {
  console.log(`\n  Onbekende keten "${chain}". Kies uit: ah, jumbo, both.\n`);
  process.exit(2);
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const line = (label: string, value: string): void => console.log(`  ${label.padEnd(26)} ${value}`);

const report = (name: string, examples: readonly GoldenExample[]): MatchEvaluation => {
  // A label that points at an ingredient which does not exist would silently
  // grade the matcher against nothing.
  const known = new Set(SEED_INGREDIENTS.map((i) => i.id));
  const unknown = [...new Set(examples.map((e) => e.ingredientId))].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    console.log(`\n  ONBEKENDE INGREDIENT-IDS IN ${name.toUpperCase()}: ${unknown.join(', ')}\n`);
  }

  const result = evaluateMatcher(examples);
  const counts = {
    VALID: examples.filter((e) => e.label === 'VALID').length,
    INVALID: examples.filter((e) => e.label === 'INVALID').length,
    AMBIGUOUS: examples.filter((e) => e.label === 'AMBIGUOUS').length,
  };

  console.log(
    `\n${name.toUpperCase()} — ${result.total} handmatig gelabelde voorbeelden ` +
      `(${counts.VALID} valide, ${counts.INVALID} invalide, ${counts.AMBIGUOUS} ambigu)\n`,
  );
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

  if (args.includes('--misses')) {
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

  return result;
};

const results = selected.map(([name, examples]) => [name, report(name, examples)] as const);

// The whole point of a second chain is the comparison: a matcher that scores
// well on Albert Heijn and badly on Jumbo was fitted to one shop's habits.
if (results.length > 1) {
  console.log('\n  Naast elkaar\n');
  const header =
    '    ' +
    'keten'.padEnd(10) +
    'n'.padStart(6) +
    'precision'.padStart(12) +
    'recall'.padStart(10) +
    'F1'.padStart(10);
  console.log(header);
  console.log('    ' + '-'.repeat(header.length - 4));
  for (const [name, result] of results) {
    console.log(
      '    ' +
        name.padEnd(10) +
        String(result.total).padStart(6) +
        pct(result.precision).padStart(12) +
        pct(result.recall).padStart(10) +
        pct(result.f1).padStart(10),
    );
  }
}

console.log('');
process.exit(results.some(([, result]) => result.falsePositives > 0) ? 1 : 0);
