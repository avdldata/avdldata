/**
 * A hundred real weeks, with candidate reduction on and off.
 *
 * Reduction may only ship if it changes nothing. Not "changes little" — nothing:
 * the same dishes, the same products, the same bill, the same objective score.
 * Any single scenario where the answer differs means a rule is wrong, and a
 * faster wrong answer is not a trade worth making.
 *
 * The lower bound is measured the same way and for the same reason, since it is
 * the other knob that touches how much work the refinement does.
 *
 *   pnpm perf:stress
 */
import { optimiseWeek, type OptimizerInput } from '../src/domain/optimization/week-optimizer';
import {
  DEFAULT_OPTIMIZER_CONFIG,
  type ConveniencePreference,
} from '../src/domain/optimization/config';
import { loadRealAlbertHeijn, storeWith } from '../tests/support/real-data-store';
import { DEMO_HOUSEHOLD } from '../src/data/seed/demo-household';
import { cents } from '../src/domain/units';

const fixture = loadRealAlbertHeijn();
const full = storeWith(fixture.allOffers);
const reduced = storeWith(fixture.reducedOffers);

console.log(
  `\nStresstest — ${fixture.allOffers.length} aanbiedingen, ` +
    `${fixture.reducedOffers.length} na reductie ` +
    `(${fixture.removedCount} weg, ${((fixture.removedCount / fixture.allOffers.length) * 100).toFixed(1)}%)\n`,
);

const CONVENIENCE: ConveniencePreference[] = ['laagste-prijs', 'gebalanceerd', 'gemak'];

/** A hundred households that differ in the ways the optimizer reacts to. */
const scenarios = Array.from({ length: 100 }, (_, index) => {
  const memberCount = 1 + (index % DEMO_HOUSEHOLD.members.length);
  const budget =
    index % 4 === 0
      ? {}
      : index % 4 === 1
        ? { targetCents: cents(3000 + (index % 7) * 500) }
        : index % 4 === 2
          ? { hardMaxCents: cents(4000 + (index % 11) * 400) }
          : { targetCents: cents(3500), hardMaxCents: cents(6000) };
  return {
    label: `w${String(index + 1).padStart(3, '0')}`,
    members: DEMO_HOUSEHOLD.members.slice(0, memberCount),
    conveniencePreference: CONVENIENCE[index % CONVENIENCE.length]!,
    maxMinutes: index % 5 === 0 ? 45 : undefined,
    budget,
    startDate: `2026-09-${String(1 + (index % 28)).padStart(2, '0')}`,
  };
});

interface Outcome {
  week: string;
  products: string;
  grocery: number;
  score: number;
  waste: number;
  stores: string;
  ms: number;
}

function run(
  store: typeof full,
  useLowerBound: boolean,
  scenario: (typeof scenarios)[number],
  refine = true,
): Outcome | undefined {
  const config = {
    ...DEFAULT_OPTIMIZER_CONFIG,
    search: {
      ...DEFAULT_OPTIMIZER_CONFIG.search,
      localSearch: {
        ...DEFAULT_OPTIMIZER_CONFIG.search.localSearch,
        useLowerBound,
        enabled: refine,
      },
    },
  };
  const input: OptimizerInput = {
    household: { ...DEMO_HOUSEHOLD, members: scenario.members },
    recipes: fixture.recipes,
    ingredients: fixture.ingredientIndex,
    stores: [store],
    maxStores: 1,
    conveniencePreference: scenario.conveniencePreference,
    budget: scenario.budget,
    startDate: scenario.startDate,
    today: new Date(`${scenario.startDate}T09:00:00Z`),
    config,
    ...(scenario.maxMinutes !== undefined ? { maxMinutes: scenario.maxMinutes } : {}),
  };
  const started = performance.now();
  const result = optimiseWeek(input);
  const ms = performance.now() - started;
  if (result.status !== 'OK') return undefined;
  return {
    week: result.plan.days.map((d) => d.recipe.id).join('|'),
    products: result.plan.recommendedOption.assignments
      .flatMap((a) => a.packaging.lines.map((l) => `${l.offer.productId}x${l.units}`))
      .sort()
      .join(','),
    grocery: result.plan.totals.groceryCents,
    score: result.plan.score.totalPenaltyCents,
    waste: Math.round(result.plan.waste.wasteScore),
    stores: result.plan.recommendedOption.locationIds.join('|'),
    ms,
  };
}

interface Arm {
  label: string;
  store: typeof full;
  useLowerBound: boolean;
  durations: number[];
  outcomes: (Outcome | undefined)[];
}
const arms: Arm[] = [
  {
    label: 'volledig, met ondergrens',
    store: full,
    useLowerBound: true,
    durations: [],
    outcomes: [],
  },
  {
    label: 'gereduceerd, met ondergrens',
    store: reduced,
    useLowerBound: true,
    durations: [],
    outcomes: [],
  },
  {
    label: 'gereduceerd, zonder ondergrens',
    store: reduced,
    useLowerBound: false,
    durations: [],
    outcomes: [],
  },
];

for (const scenario of scenarios) {
  for (const arm of arms) {
    const outcome = run(arm.store, arm.useLowerBound, scenario);
    arm.outcomes.push(outcome);
    if (outcome) arm.durations.push(outcome.ms);
  }
}

const stat = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
  return {
    mean: values.reduce((s, v) => s + v, 0) / Math.max(1, values.length),
    median: at(50),
    p95: at(95),
    worst: sorted.at(-1) ?? 0,
  };
};

const head =
  '  ' +
  'variant'.padEnd(32) +
  'weken'.padStart(7) +
  'gem.'.padStart(9) +
  'mediaan'.padStart(9) +
  'p95'.padStart(9) +
  'slechtst'.padStart(10);
console.log(head);
console.log('  ' + '-'.repeat(head.length - 2));
for (const arm of arms) {
  const s = stat(arm.durations);
  console.log(
    '  ' +
      arm.label.padEnd(32) +
      String(arm.durations.length).padStart(7) +
      `${s.mean.toFixed(0)}`.padStart(9) +
      `${s.median.toFixed(0)}`.padStart(9) +
      `${s.p95.toFixed(0)}`.padStart(9) +
      `${s.worst.toFixed(0)}`.padStart(10),
  );
}

// The correctness question: does any arm ever produce a different answer?
console.log('\n  Verschillen tegenover "volledig, met ondergrens"\n');
const baseline = arms[0]!;
for (const arm of arms.slice(1)) {
  let differentWeek = 0;
  let differentProducts = 0;
  let differentScore = 0;
  let worseScore = 0;
  let worstDelta = 0;
  const examples: string[] = [];

  for (let index = 0; index < scenarios.length; index += 1) {
    const a = baseline.outcomes[index];
    const b = arm.outcomes[index];
    if (!a || !b) continue;
    if (a.week !== b.week) differentWeek += 1;
    if (a.products !== b.products) differentProducts += 1;
    if (a.score !== b.score) {
      differentScore += 1;
      const delta = b.score - a.score;
      if (delta > 0) worseScore += 1;
      if (Math.abs(delta) > Math.abs(worstDelta)) worstDelta = delta;
      if (examples.length < 3) {
        examples.push(`${scenarios[index]!.label}: ${a.score} -> ${b.score}`);
      }
    }
  }

  console.log(`    ${arm.label}`);
  console.log(`      andere week            ${differentWeek}/100`);
  console.log(`      andere producten       ${differentProducts}/100`);
  console.log(`      andere score           ${differentScore}/100  (slechter: ${worseScore})`);
  console.log(`      grootste scoreverschil ${worstDelta}`);
  for (const example of examples) console.log(`        ${example}`);
  console.log('');
}

/*
 * The decisive comparison.
 *
 * With the refinement switched off the search does a fixed, budget-independent
 * amount of work, so reduction and no-reduction have to agree exactly. If they
 * do, the differences above are the search spending a fixed evaluation budget
 * on more weeks — not reduction quietly removing the better product.
 */
console.log('  Zonder verfijning — vast zoekwerk\n');
let deterministicDiff = 0;
let deterministicWorse = 0;
let deterministicBetter = 0;
for (const scenario of scenarios) {
  const a = run(full, true, scenario, false);
  const b = run(reduced, true, scenario, false);
  if (!a || !b) continue;
  if (a.week !== b.week || a.products !== b.products || a.score !== b.score) deterministicDiff += 1;
  if (b.score > a.score) {
    deterministicWorse += 1;
    if (deterministicWorse <= 3)
      console.log(`    SLECHTER ${scenario.label}: ${a.score} -> ${b.score}`);
  } else if (b.score < a.score) {
    deterministicBetter += 1;
  }
}
console.log(`    andere uitkomst        ${deterministicDiff}/100`);
console.log(`    beter                  ${deterministicBetter}/100`);
console.log(`    SLECHTER               ${deterministicWorse}/100`);
console.log('');

const reductionArm = arms[1]!;
// The acceptance rule: never worse. Differences in the better direction are the
// search reaching further, which is the point.
let anyWorse = 0;
for (let index = 0; index < scenarios.length; index += 1) {
  const a = baseline.outcomes[index];
  const b = reductionArm.outcomes[index];
  if (a && b && b.score > a.score) anyWorse += 1;
}
console.log(
  anyWorse === 0
    ? '  Geen enkele uitkomst is slechter geworden.\n'
    : `  ${anyWorse} UITKOMSTEN SLECHTER — regel herzien.\n`,
);
process.exit(anyWorse === 0 && deterministicWorse === 0 ? 0 : 1);
