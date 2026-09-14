/**
 * The sizes nobody can verify exactly.
 *
 * Measures determinism, runtime, and the score against the best ever recorded
 * for that scenario. `--update` rewrites the corpus with anything better; without
 * it, falling short of a recorded best is reported as a regression and exits
 * non-zero, so CI can hold the line.
 *
 * Run with:  pnpm bench:large
 *            pnpm bench:large --update      (after a deliberate improvement)
 *            pnpm bench:large --baseline    (the old optimizer, for comparison)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { benchmarkSeeds } from '../tests/support/benchmark';
import { LARGE_WORLD_SIZES, corpusKey, runLargeWorld } from '../tests/support/large-worlds';
import { DEFAULT_OPTIMIZER_CONFIG } from '../src/domain/optimization/config';

const CORPUS = new URL('../tests/support/best-known.json', import.meta.url);
const args = process.argv.slice(2);
const update = args.includes('--update');
const baseline = args.includes('--baseline');
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 12);
const restartsArg = args.find((a) => a.startsWith('--restarts='));
const restarts = restartsArg ? Number(restartsArg.split('=')[1]) : undefined;

const search = baseline
  ? {
      beamWidth: 40,
      fullyEvaluatedWeeks: 20,
      localSearch: {
        enabled: false,
        maxIterations: 0,
        maxEvaluations: 0,
        twoSwap: false,
        maxTwoSwapEvaluations: 0,
        restarts: 1,
      },
    }
  : restarts !== undefined
    ? { localSearch: { ...DEFAULT_OPTIMIZER_CONFIG.search.localSearch, restarts } }
    : {};

let corpus: Record<string, { score: number; week: string[] }> = {};
try {
  corpus = JSON.parse(readFileSync(CORPUS, 'utf8'));
} catch {
  corpus = {};
}

const seeds = benchmarkSeeds(count);
const regressions: string[] = [];
const nonDeterministic: string[] = [];
let improved = 0;

console.log(
  `\nGrote werelden — ${count} seeds per formaat${baseline ? ', BASELINE-optimizer' : ''}` +
    `${restarts !== undefined ? `, restarts ${restarts}` : ''}\n`,
);
console.log(
  '  ' +
    'recepten'.padEnd(10) +
    'kandidaten'.padStart(12) +
    'ms mediaan'.padStart(12) +
    'ms p90'.padStart(10) +
    'vs best'.padStart(12) +
    'determin.'.padStart(11),
);
console.log('  ' + '-'.repeat(67));

for (const recipeCount of LARGE_WORLD_SIZES) {
  const durations: number[] = [];
  const deltas: number[] = [];
  let candidates = 0;
  let allDeterministic = true;

  for (const seed of seeds) {
    const outcome = runLargeWorld(seed, recipeCount, search);
    if (outcome.status !== 'OK') continue;
    const { result } = outcome;

    durations.push(result.ms);
    candidates = Math.max(candidates, result.candidateRecipes);
    if (!result.deterministic) {
      allDeterministic = false;
      nonDeterministic.push(`seed ${seed} @ ${recipeCount} recepten`);
    }

    const key = corpusKey(seed, recipeCount);
    const known = corpus[key];
    if (!known) {
      corpus[key] = { score: result.score, week: [...result.week] };
      continue;
    }

    deltas.push(((result.score - known.score) / Math.max(1, known.score)) * 100);
    // "Best known" means best anyone has found, from any variant — including
    // the old optimizer, which on occasion still lands somewhere this one does
    // not. A corpus that only records the current default would quietly grade
    // the optimizer against itself.
    if (result.score < known.score) {
      improved += 1;
      corpus[key] = { score: result.score, week: [...result.week] };
    } else if (result.score > known.score + 0.5 && !baseline) {
      regressions.push(
        `seed ${seed} @ ${recipeCount} recepten: ${result.score} tegen best bekend ${known.score}`,
      );
    }
  }

  durations.sort((a, b) => a - b);
  const at = (p: number): number =>
    durations[Math.min(durations.length - 1, Math.ceil((p / 100) * durations.length) - 1)] ?? 0;
  const meanDelta = deltas.length > 0 ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0;

  console.log(
    '  ' +
      String(recipeCount).padEnd(10) +
      String(candidates).padStart(12) +
      at(50).toFixed(0).padStart(12) +
      at(90).toFixed(0).padStart(10) +
      `${meanDelta >= 0 ? '+' : ''}${meanDelta.toFixed(2)}%`.padStart(12) +
      (allDeterministic ? 'ja' : 'NEE').padStart(11),
  );
}

if (update) {
  writeFileSync(CORPUS, `${JSON.stringify(corpus, null, 2)}\n`);
  console.log(`\n  corpus bijgewerkt (${improved} verbeteringen)`);
} else if (improved > 0) {
  console.log(`\n  ${improved} scenario's beter dan best bekend — draai met --update`);
}

for (const problem of nonDeterministic) console.log(`\n  NIET DETERMINISTISCH: ${problem}`);
for (const problem of regressions) console.log(`\n  REGRESSIE: ${problem}`);

console.log('');
process.exit(regressions.length > 0 || nonDeterministic.length > 0 ? 1 : 0);
