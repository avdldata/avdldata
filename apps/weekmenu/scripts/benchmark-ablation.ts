/**
 * What does each piece of the search actually buy?
 *
 * Every variant is a configuration, which keeps the comparison honest in two
 * ways: the old optimizer stays permanently runnable rather than living in a
 * git history nobody consults, and no variant can quietly differ in anything
 * except the setting under test.
 *
 * Run with:  pnpm bench:ablation            (120 scenarios)
 *            pnpm bench:ablation 500
 *            pnpm bench:ablation --budget   (with a hard maximum in play)
 */
import { benchmarkSeeds } from '../tests/support/benchmark';
import { runAblation, searchVariant, type Variant } from '../tests/support/ablation';

const args = process.argv.slice(2);
const count = Number(args.find((argument) => /^\d+$/.test(argument)) ?? 120);

const OFF = {
  enabled: false,
  maxIterations: 0,
  maxEvaluations: 0,
  twoSwap: false,
  maxTwoSwapEvaluations: 0,
} as const;
const on = (maxEvaluations: number, maxIterations = 8) =>
  ({ enabled: true, maxIterations, maxEvaluations, twoSwap: false, maxTwoSwapEvaluations: 0 }) as const;
const withTwoSwap = (maxTwoSwapEvaluations: number) =>
  ({ ...on(200), twoSwap: true, maxTwoSwapEvaluations }) as const;

const VARIANTS: Variant[] = [
  searchVariant('1-swap alleen', { localSearch: on(200) }),
  searchVariant('+ 2-swap, 50 eval', { localSearch: withTwoSwap(50) }),
  searchVariant('+ 2-swap, 100 eval', { localSearch: withTwoSwap(100) }),
  searchVariant('+ 2-swap, 150 eval', { localSearch: withTwoSwap(150) }),
  searchVariant('+ 2-swap, 250 eval', { localSearch: withTwoSwap(250) }),
];

const seeds = benchmarkSeeds(count);
const started = Date.now();
const results = runAblation(seeds, VARIANTS, {});
const seconds = (Date.now() - started) / 1000;

console.log(
  `\nAblatie — ${count} scenario's, ` +
    `${seconds.toFixed(0)}s — elk scenario houdt zijn eigen gewichten\n`,
);

const header =
  '  ' +
  'variant'.padEnd(34) +
  'exact'.padStart(8) +
  'gem.'.padStart(8) +
  'p95'.padStart(8) +
  'p99'.padStart(8) +
  'slechtst'.padStart(10) +
  'ms'.padStart(9) +
  'p95 ms'.padStart(9) +
  'fout'.padStart(6);
console.log(header);
console.log('  ' + '-'.repeat(header.length - 2));

const baseline = results[0]!;
for (const r of results) {
  console.log(
    '  ' +
      r.name.padEnd(34) +
      `${r.exactPercent.toFixed(1)}%`.padStart(8) +
      `${r.meanGapPercent.toFixed(2)}%`.padStart(8) +
      `${r.p95GapPercent.toFixed(2)}%`.padStart(8) +
      `${r.p99GapPercent.toFixed(2)}%`.padStart(8) +
      `${r.worstGapPercent.toFixed(2)}%`.padStart(10) +
      r.meanMs.toFixed(1).padStart(9) +
      r.p95Ms.toFixed(1).padStart(9) +
      String(r.correctnessFailures).padStart(6),
  );
}

// A variant that is better on average but worse on some seed is a trade, not an
// improvement — and the paired view is the only way to see that.
console.log('\n  Per seed tegenover de baseline (aantal seeds beter / slechter)\n');
for (const r of results.slice(1)) {
  let better = 0;
  let worse = 0;
  for (const [seed, gap] of r.gapBySeed) {
    const base = baseline.gapBySeed.get(seed);
    if (base === undefined) continue;
    if (gap < base - 1e-9) better += 1;
    else if (gap > base + 1e-9) worse += 1;
  }
  console.log(`    ${r.name.padEnd(34)} ${String(better).padStart(4)} beter  ${String(worse).padStart(4)} slechter`);
}

console.log('');
process.exit(results.some((r) => r.correctnessFailures > 0) ? 1 : 0);
