/**
 * Plan a real week from real supermarket data, in one shop or in two.
 *
 * The end-to-end proof this phase exists to produce: recipes → canonical
 * ingredients → real products → real pack sizes → real prices → the packaging
 * optimizer → a shopping list whose every line traces back to a source.
 *
 * Shadow mode by design. The app itself still runs on the seeded demo data;
 * this is a separate entry point so real data can be measured long before
 * anything depends on it.
 *
 *   pnpm data:week                          Albert Heijn alone
 *   pnpm data:week -- --chain jumbo         Jumbo alone
 *   pnpm data:week -- --chains ah,jumbo     both, one shop allowed
 *   pnpm data:week -- --chains ah,jumbo --max-stores 2
 *   pnpm data:week -- --scenarios           all four store scenarios, compared
 */
import { optimiseWeek } from '../src/domain/optimization/week-optimizer';
import { describeProvenance } from '../src/domain/ingestion/provenance';
import { DEMO_HOUSEHOLD } from '../src/data/seed/demo-household';
import {
  loadRealChains,
  SNAPSHOT_DATE,
  SNAPSHOT_SOURCE,
  type RealChainId,
} from '../tests/support/real-data-store';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  args.indexOf(name) !== -1 ? args[args.indexOf(name) + 1] : undefined;

const chainIds = (flag('--chains') ?? flag('--chain') ?? 'ah')
  .split(',')
  .map((c) => c.trim()) as RealChainId[];
const maxStores = Number(flag('--max-stores') ?? 1);
const euro = (c: number): string => `€ ${(c / 100).toFixed(2)}`;

const fixture = loadRealChains(chainIds);

console.log(`\nEchte week — ${SNAPSHOT_SOURCE}, momentopname ${SNAPSHOT_DATE}\n`);
for (const chain of fixture.chains) {
  console.log(
    `  ${chain.chainId.padEnd(6)} ${String(chain.reducedOffers.length).padStart(5)} aanbiedingen ` +
      `(${chain.removedCount} door reductie weg), ` +
      `${new Set(chain.reducedOffers.map((o) => o.ingredientId)).size} ingrediënten, ` +
      `${chain.store.distanceKm} km`,
  );
}

function planWeek(stores: readonly (typeof fixture.stores)[number][], limit: number) {
  const started = performance.now();
  const result = optimiseWeek({
    household: DEMO_HOUSEHOLD,
    recipes: fixture.recipes,
    ingredients: fixture.ingredientIndex,
    stores,
    maxStores: limit,
    conveniencePreference: 'gebalanceerd',
    budget: {},
    startDate: '2026-09-14',
    today: new Date('2026-09-14T09:00:00Z'),
  });
  return { result, ms: performance.now() - started };
}

/*
 * The four store scenarios, as calculations rather than as claims.
 *
 * Each one is the same week planned under a different set of shops, so the
 * comparison is like for like. Which of A–D actually happens is decided by the
 * data, not chosen here: the optimizer weighs groceries against travel and the
 * extra-shop allowance, and whichever comes out cheapest wins.
 */
if (args.includes('--scenarios')) {
  const ah = fixture.chains.find((c) => c.chainId === 'ah')?.store;
  const jumbo = fixture.chains.find((c) => c.chainId === 'jumbo')?.store;
  if (!ah || !jumbo) throw new Error('scenario-vergelijking vraagt om --chains ah,jumbo');

  const scenarios: { label: string; stores: (typeof ah)[]; limit: number }[] = [
    { label: 'A  alleen Albert Heijn', stores: [ah], limit: 1 },
    { label: 'B  alleen Jumbo', stores: [jumbo], limit: 1 },
    { label: 'C  beide, één winkel toegestaan', stores: [ah, jumbo], limit: 1 },
    { label: 'D  beide, twee winkels toegestaan', stores: [ah, jumbo], limit: 2 },
  ];

  console.log('\n  Winkelscenarios — dezelfde week, andere winkelkeuze\n');
  const header =
    '    ' +
    'scenario'.padEnd(34) +
    'boodschappen'.padStart(13) +
    'reis'.padStart(9) +
    'praktisch'.padStart(11) +
    'winkels'.padStart(9) +
    'mist'.padStart(6) +
    'ms'.padStart(7);
  console.log(header);
  console.log('    ' + '-'.repeat(header.length - 4));

  let cheapest = { label: '', practical: Number.POSITIVE_INFINITY };
  for (const scenario of scenarios) {
    const { result, ms } = planWeek(scenario.stores, scenario.limit);
    if (result.status !== 'OK') {
      console.log(`    ${scenario.label.padEnd(34)} GEEN WEEK: ${result.reason}`);
      continue;
    }
    const option = result.plan.recommendedOption;
    const practical = option.practicalTotalCents;
    if (practical < cheapest.practical) cheapest = { label: scenario.label, practical };
    console.log(
      '    ' +
        scenario.label.padEnd(34) +
        euro(option.groceryCents).padStart(13) +
        euro(option.trip.estimatedTravelCostCents).padStart(9) +
        euro(practical).padStart(11) +
        option.chainIds.join('+').padStart(9) +
        String(option.unavailable.length).padStart(6) +
        ms.toFixed(0).padStart(7),
    );
  }
  console.log(`\n    goedkoopst: ${cheapest.label.trim()}\n`);
  process.exit(0);
}

const { result, ms } = planWeek(fixture.stores, maxStores);
if (result.status !== 'OK') {
  console.log(`\n  GEEN WEEK: ${result.reason} — ${result.message}\n`);
  process.exit(1);
}

const plan = result.plan;
const option = plan.recommendedOption;
console.log(`  optimizer                ${ms.toFixed(0)} ms\n`);
console.log('  De week\n');
for (const day of plan.days) console.log(`    ${day.date}  ${day.recipe.name}`);

console.log(`\n  Boodschappenlijst — ${option.chainIds.join(' + ')}\n`);
for (const assignment of option.assignments) {
  for (const line of assignment.packaging.lines) {
    const source = fixture.provenance.get(line.offer.productId);
    console.log(
      `    ${euro(line.lineTotalCents).padStart(8)}  ${String(line.units).padStart(2)}x  ` +
        `[${line.offer.chainId}] ${line.offer.name.slice(0, 48)}`,
    );
    if (source) {
      console.log(`              ${describeProvenance(source)}`);
      if (source.productUrl) console.log(`              ${source.productUrl}`);
    } else {
      // Never silently: a line whose origin is unknown is worth shouting about.
      console.log('              HERKOMST ONBEKEND');
    }
  }
}

if (option.unavailable.length > 0) {
  console.log(`\n  Niet te koop (${option.unavailable.length})`);
  for (const item of option.unavailable) console.log(`    ${item.ingredientId}`);
}

console.log(
  `\n  Boodschappen ${euro(option.groceryCents)}` +
    `   reis ${euro(option.trip.estimatedTravelCostCents)}` +
    `   praktisch ${euro(option.practicalTotalCents)}` +
    `   per persoon per maaltijd ${euro(plan.totals.perPersonPerMealCents)}\n`,
);
