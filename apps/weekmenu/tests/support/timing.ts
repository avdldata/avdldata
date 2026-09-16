/**
 * The cost of an operation, measured as the fastest of a few runs.
 *
 * A single sample measures the machine as much as the code: these suites run
 * 62 files in parallel, several of which parse a 45 MB catalogue, and a planner
 * that takes 1,8 s alone reads as 2,1 s while that is happening. The minimum is
 * the sample least polluted by whatever else the box was doing, so it is the
 * one a budget should be checked against.
 *
 * This is not a way to pass a budget that is genuinely exceeded: if the work
 * itself gets slower, every run gets slower and the minimum moves with it.
 */
export function fastestOf(runs: number, operation: () => void): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    operation();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}
