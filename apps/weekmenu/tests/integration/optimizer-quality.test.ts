import { describe, expect, it } from 'vitest';
import { benchmarkSeeds, compareScenario, runBenchmark } from '../support/benchmark';

/**
 * The optimizer measured against the truth.
 *
 * Two questions live here, and they are deliberately not the same test.
 *
 * *Correctness* is absolute. Whatever week comes out must obey every dietary
 * rule, respect the store limit, account for everything it needs, and charge
 * what the register would charge. A single failure fails the suite.
 *
 * *Quality* is a measurement with a floor. The production search is a heuristic;
 * it is allowed to return a slightly worse week than the perfect one. What it is
 * not allowed to do is get quietly worse over time, so the thresholds below are
 * a regression alarm rather than a target — the honest numbers live in
 * OPTIMIZER_BENCHMARK.md and are refreshed deliberately.
 *
 * The scenario count is kept modest so this stays a test rather than an errand;
 * `pnpm bench 500` is the full run.
 */

// Forty is enough to catch a regression; CI runs 120 in a separate job and
// `pnpm bench 500` is the number that goes in the report. The search does
// considerably more work per week than it used to, so this trades a little
// coverage here for a suite that still runs in a coffee break.
const SEEDS = benchmarkSeeds(40);

describe('the optimizer measured against an exhaustive solver', () => {
  const summary = runBenchmark(SEEDS);

  it('compares nearly every scenario', () => {
    // A scenario both engines refuse is fine; one where they disagree about
    // whether a week exists at all is a defect in one of them.
    expect(summary.disagreements).toEqual([]);
    expect(summary.compared).toBeGreaterThan(SEEDS.length * 0.9);
  });

  it('never breaks a hard rule, whatever the search decides', () => {
    const failures = summary.correctnessFailures.map(
      (failure) =>
        `seed ${failure.seed} (${failure.summary}): ` +
        failure.problems.map((problem) => `${problem.kind} — ${problem.detail}`).join('; '),
    );
    expect(failures).toEqual([]);
  });

  it('finds the exact optimum in the large majority of cases', () => {
    expect(summary.exactPercent).toBeGreaterThan(97);
  });

  it('stays close to the optimum on average', () => {
    expect(summary.meanGapPercent).toBeLessThan(0.2);
    expect(summary.medianGapPercent).toBe(0);
  });

  it('keeps the tail in hand', () => {
    expect(summary.p95GapPercent).toBe(0);
    expect(summary.p99GapPercent).toBeLessThan(1);
  });

  it('has no pathological case', () => {
    expect(
      summary.worstGapPercent,
      `worst case ${summary.worstGapPercent.toFixed(2)}% on seed ${summary.worstSeed}` +
        (summary.worst ? ` — ${summary.worst.summary}` : ''),
    ).toBeLessThan(5);
  });

  it('answers far faster than the exhaustive search it is measured against', () => {
    expect(summary.meanHeuristicMs).toBeLessThan(summary.meanExhaustiveMs);
    expect(summary.meanHeuristicMs).toBeLessThan(2000);
  });
}, 600_000);

/**
 * Scenarios the fuzzer found interesting, pinned so they keep being checked.
 *
 * A benchmark that only produces statistics teaches you nothing twice. These
 * are the seeds behind the worst and most awkward cases measured so far; if a
 * change to the search makes any of them worse, this notices immediately and
 * names the seed, rather than nudging a percentile nobody reads.
 *
 * Reproduce one locally with:  pnpm bench 500   (and look for the seed)
 */
describe('regression corpus: cases the fuzzer found', () => {
  // Every one of these was a measured failure at some point — the worst cases
  // over 500 scenarios under the beam-only search, with gaps from 3 % to 12 %.
  // All of them are now solved exactly, so that is what they are pinned to:
  // anything above zero on any of these is a regression with a seed attached,
  // rather than a percentile nobody reads.
  const CASES: { seed: number; what: string }[] = [
    { seed: 3228008, what: 'was the worst of 500: 12 dishes, 3 shops, only 1 allowed' },
    { seed: 3869447, what: 'waste-heavy against a costly repetition penalty' },
    { seed: 955255, what: 'store combination dominates the answer' },
    { seed: 883984, what: 'promotion and pack-size interaction' },
    { seed: 250464, what: 'only seven eligible dishes: the order is the only choice' },
    { seed: 131679, what: 'tight diversity configuration across three shops' },
    { seed: 3988232, what: 'was the worst once one-swap was in: 3 shops, 2 allowed' },
    { seed: 2420270, what: 'was the worst once two-swap was in' },
    { seed: 377168, what: 'resisted every widening of the beam' },
    { seed: 234626, what: 'the hardest hard-budget case measured' },
  ];

  for (const { seed, what } of CASES) {
    it(`seed ${seed} — ${what}`, () => {
      const outcome = compareScenario(seed);
      expect(outcome.status, `seed ${seed} became uncomparable`).toBe('COMPARED');
      if (outcome.status !== 'COMPARED') return;

      const { comparison } = outcome;
      expect(
        comparison.problems.map((problem) => `${problem.kind}: ${problem.detail}`),
        `seed ${seed} broke a hard rule`,
      ).toEqual([]);
      expect(
        comparison.relativeGapPercent,
        `seed ${seed}: optimum ${comparison.optimalScore}, optimizer ` +
          `${comparison.heuristicScore}, gap ${comparison.relativeGapPercent.toFixed(2)}%`,
      ).toBe(0);
    }, 120_000);
  }
});
