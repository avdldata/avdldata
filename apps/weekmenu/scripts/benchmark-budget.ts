/**
 * A hard maximum is a promise. How often is it kept?
 *
 * Each scenario gets a ceiling derived from the cheapest week that provably
 * exists, so every case counted here is one the optimizer *could* have solved.
 * Several tightness levels, because a ceiling one cent above the floor is a
 * very different problem from one with ten percent of room.
 *
 * Run with:  pnpm bench:budget           (200 scenarios per level)
 *            pnpm bench:budget 500
 */
import { benchmarkSeeds } from '../tests/support/benchmark';
import { runBudget } from '../tests/support/budget';

const count = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 200);
const seeds = benchmarkSeeds(count);
const started = Date.now();

console.log(`\nHard budgetmaximum — ${count} scenario's per niveau\n`);
console.log(
  '  ' +
    'plafond'.padEnd(26) +
    'gehaald'.padStart(10) +
    'gemist'.padStart(10) +
    'ergste overschrijding'.padStart(24),
);
console.log('  ' + '-'.repeat(68));

let worstMissed = 0;
for (const factor of [1.0, 1.02, 1.05, 1.1, 1.25]) {
  const summary = runBudget(seeds, factor);
  worstMissed = Math.max(worstMissed, summary.missedPercent);
  console.log(
    '  ' +
      `${factor.toFixed(2)}× de goedkoopst mogelijke`.padEnd(26) +
      `${summary.found}/${summary.measured}`.padStart(10) +
      `${summary.missedPercent.toFixed(1)}%`.padStart(10) +
      `${summary.worstOvershootPercent.toFixed(2)}%`.padStart(24),
  );
  for (const miss of summary.misses.slice(0, 3)) {
    console.log(
      `      seed ${miss.seed}: plafond ${miss.ceilingCents}, week ${miss.groceryCents} ` +
        `(+${miss.overshootPercent.toFixed(1)}%) — ${miss.summary}`,
    );
  }
}

console.log(`\n  ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
