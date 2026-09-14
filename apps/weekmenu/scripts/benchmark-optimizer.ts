/**
 * Measure how close the production optimizer gets to the real optimum.
 *
 * Runs a fixed, reproducible list of small scenarios through both the heuristic
 * search and the exhaustive reference solver, and reports the distribution of
 * the gap between them. Everything is seeded, so the same command produces the
 * same numbers on any machine — a benchmark you cannot re-enter is a rumour.
 *
 * Run with:  pnpm bench            (500 scenarios)
 *            pnpm bench 2000       (more, if you have the patience)
 *            pnpm bench 500 --json (machine-readable, for a diff over time)
 */
import { benchmarkSeeds, runBenchmark, type BenchmarkSummary } from '../tests/support/benchmark';

const args = process.argv.slice(2);
const count = Number(args.find((argument) => /^\d+$/.test(argument)) ?? 500);
const asJson = args.includes('--json');

const started = Date.now();
const summary = runBenchmark(benchmarkSeeds(count));
const elapsedSeconds = (Date.now() - started) / 1000;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ...summary,
        comparisons: undefined,
        worst: summary.worst
          ? { seed: summary.worst.seed, gap: summary.worst.relativeGapPercent }
          : undefined,
        elapsedSeconds,
      },
      null,
      2,
    ),
  );
} else {
  report(summary, elapsedSeconds);
}

// A correctness failure or a disagreement is a bug, and the exit code has to
// say so — a benchmark that only prints is a benchmark CI cannot use.
const broken = summary.correctnessFailures.length > 0 || summary.disagreements.length > 0;
process.exit(broken ? 1 : 0);

function report(result: BenchmarkSummary, seconds: number): void {
  const line = (label: string, value: string): void =>
    console.log(`  ${label.padEnd(28)} ${value}`);

  console.log(`\nOptimizer benchmark — ${result.scenarios} scenario's in ${seconds.toFixed(1)}s\n`);

  line('vergeleken', String(result.compared));
  line('overgeslagen', String(result.skipped));
  line('onvergelijkbaar', String(result.disagreements.length));
  console.log('');
  line('exact optimaal', `${result.exactCount} (${result.exactPercent.toFixed(1)}%)`);
  line('gemiddelde gap', `${result.meanGapPercent.toFixed(2)}%`);
  line('mediaan', `${result.medianGapPercent.toFixed(2)}%`);
  line('p90', `${result.p90GapPercent.toFixed(2)}%`);
  line('p95', `${result.p95GapPercent.toFixed(2)}%`);
  line('p99', `${result.p99GapPercent.toFixed(2)}%`);
  line('slechtste', `${result.worstGapPercent.toFixed(2)}% (seed ${result.worstSeed})`);
  console.log('');
  line('optimizer gemiddeld', `${result.meanHeuristicMs.toFixed(1)} ms`);
  line('uitputtend gemiddeld', `${result.meanExhaustiveMs.toFixed(1)} ms`);

  if (result.worst) {
    console.log(`\n  Slechtste geval — seed ${result.worst.seed}`);
    console.log(`    ${result.worst.summary}`);
    console.log(
      `    optimum ${result.worst.optimalScore}, optimizer ${result.worst.heuristicScore}, ` +
        `gap ${result.worst.absoluteGap} cent-equivalent (${result.worst.relativeGapPercent.toFixed(2)}%)`,
    );
  }

  const tail = [...result.comparisons]
    .sort((a, b) => b.relativeGapPercent - a.relativeGapPercent)
    .slice(0, 10);
  if (tail.length > 0 && tail[0]!.relativeGapPercent > 0) {
    console.log('\n  Tien grootste afwijkingen');
    for (const entry of tail) {
      console.log(
        `    seed ${String(entry.seed).padStart(8)}  ${entry.relativeGapPercent.toFixed(2).padStart(6)}%  ${entry.summary}`,
      );
    }
  }

  for (const disagreement of result.disagreements)
    console.log(`\n  ONVERGELIJKBAAR: ${disagreement}`);
  for (const failure of result.correctnessFailures) {
    console.log(`\n  CORRECTHEIDSFOUT seed ${failure.seed}`);
    for (const problem of failure.problems) console.log(`    ${problem.kind}: ${problem.detail}`);
  }

  console.log('');
}
