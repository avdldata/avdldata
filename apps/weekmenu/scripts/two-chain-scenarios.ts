/**
 * Is a second supermarket worth the trip?
 *
 * Two questions that are easy to confuse, measured apart:
 *
 *   Same basket, different shops.  One menu, priced in each store setup. This
 *   isolates the price difference between the chains, and nothing else. It is
 *   the number that answers "is Jumbo cheaper".
 *
 *   Free choice.  The optimizer plans the whole week per setup, menu included.
 *   This is what a user actually gets, and it is *not* a price comparison: two
 *   setups that pick different dishes are buying different food, so a lower
 *   total can simply mean a cheaper menu — or a shop that could not supply
 *   something and quietly cooked around it.
 *
 * Reporting only the second would flatter the result. Reporting only the first
 * would describe a product nobody uses.
 *
 *   pnpm data:scenarios              one week, all four setups, both questions
 *   pnpm data:scenarios -- --weeks 20   how often each setup wins
 */
import { optimiseWeek, type OptimizerInput } from '../src/domain/optimization/week-optimizer';
import { prepareOptimization } from '../src/domain/optimization/prepare';
import { evaluateWeek } from '../src/domain/optimization/evaluate-week';
import type { StoreCandidate } from '../src/domain/optimization/store-selection';
import type { Recipe } from '../src/domain/recipes/types';
import { loadRealChains, SNAPSHOT_DATE } from '../tests/support/real-data-store';
import { weekScenarios, type WeekScenario } from '../tests/support/week-scenarios';

const args = process.argv.slice(2);
const weekCount = Number(args[args.indexOf('--weeks') + 1] ?? 1);
const euro = (c: number): string => `€ ${(c / 100).toFixed(2)}`;

const fixture = loadRealChains(['ah', 'jumbo']);
const ah = fixture.chains.find((c) => c.chainId === 'ah')!.store;
const jumbo = fixture.chains.find((c) => c.chainId === 'jumbo')!.store;

interface Setup {
  readonly key: 'A' | 'B' | 'C' | 'D';
  readonly label: string;
  readonly stores: readonly StoreCandidate[];
  readonly maxStores: number;
}

const SETUPS: readonly Setup[] = [
  { key: 'A', label: 'alleen Albert Heijn', stores: [ah], maxStores: 1 },
  { key: 'B', label: 'alleen Jumbo', stores: [jumbo], maxStores: 1 },
  { key: 'C', label: 'beide, één winkel', stores: [ah, jumbo], maxStores: 1 },
  { key: 'D', label: 'beide, twee winkels', stores: [ah, jumbo], maxStores: 2 },
];

function inputFor(setup: Setup, scenario: WeekScenario): OptimizerInput {
  return {
    household: scenario.household,
    recipes: scenario.recipes(fixture.recipes),
    ingredients: fixture.ingredientIndex,
    stores: setup.stores,
    maxStores: setup.maxStores,
    conveniencePreference: scenario.conveniencePreference,
    budget: {},
    startDate: scenario.startDate,
    today: scenario.today,
  };
}

/** Let the optimizer choose everything, menu included. */
function planFreely(
  setup: Setup,
  scenario: WeekScenario,
): { option: ReturnType<typeof unwrap>; ms: number } | undefined {
  const started = performance.now();
  const result = optimiseWeek(inputFor(setup, scenario));
  const ms = performance.now() - started;
  if (result.status !== 'OK') return undefined;
  return { option: unwrap(result.plan), ms };
}

/**
 * Price one fixed menu, with no search at all.
 *
 * Not `lockedRecipeIds`: that runs the beam, and the beam only ever considers
 * the top slice of the ranked pool, so a dish this shop ranks poorly cannot be
 * priced at all — which is exactly the case a like-for-like comparison needs.
 * `evaluateWeek` is the same objective function the optimizer scores with, so
 * this is the production pricing path minus the part that chooses dishes.
 */
function priceMenu(
  setup: Setup,
  scenario: WeekScenario,
  menu: readonly string[],
): { option: ReturnType<typeof unwrap>; ms: number } | undefined {
  const prepared = prepareOptimization(inputFor(setup, scenario));
  if (prepared.status !== 'OK') return undefined;
  const byId = new Map(prepared.candidates.map((r) => [r.id, r]));
  const ordered = menu.map((id) => byId.get(id));
  if (ordered.some((r) => r === undefined)) return undefined;

  const started = performance.now();
  const priced = evaluateWeek({
    recipes: ordered as Recipe[],
    portionsByRecipe: prepared.portionsByRecipe,
    household: scenario.household,
    memberNutrition: prepared.memberNutrition,
    ingredients: fixture.ingredientIndex,
    stores: prepared.stores,
    matrixHome: prepared.home,
    maxStores: prepared.maxStores,
    extraStorePenalty: prepared.extraStorePenalty,
    budget: {},
    startDate: scenario.startDate,
    config: prepared.config,
    excluded: prepared.excluded,
  });
  const ms = performance.now() - started;
  if (!priced) return undefined;
  return { option: unwrap(priced.plan), ms };
}

function unwrap(weekPlan: {
  recommendedOption: {
    groceryCents: number;
    practicalTotalCents: number;
    chainIds: readonly string[];
    unavailable: readonly unknown[];
    trip: { estimatedTravelCostCents: number; estimatedDistanceKm: number };
  };
  days: readonly { recipe: { id: string; name: string } }[];
}) {
  return {
    grocery: weekPlan.recommendedOption.groceryCents,
    practical: weekPlan.recommendedOption.practicalTotalCents,
    travel: weekPlan.recommendedOption.trip.estimatedTravelCostCents,
    chains: weekPlan.recommendedOption.chainIds.join('+'),
    missing: weekPlan.recommendedOption.unavailable.length,
    menu: weekPlan.days.map((d) => d.recipe.id),
    names: weekPlan.days.map((d) => d.recipe.name),
  };
}

console.log(`\nTwee ketens naast elkaar — Checkjebon, momentopname ${SNAPSHOT_DATE}\n`);

/*
 * What is actually being counted, and why not "which setup won".
 *
 * A and C and D land on the same answer whenever one shop happens to be best,
 * so counting setup labels would hand every tie to whichever letter sorts
 * first and report a landslide that is really a draw. What matters is which
 * *shop* the week ends up at, and whether the second shop ever pays for the
 * detour — so that is what is tallied.
 */
interface Tally {
  cheapestChain: Record<string, number>;
  twoShopsUsed: number;
  twoShopsWorthIt: number;
  ahMinusJumbo: number[];
  bestSaving: number[];
  bestPracticalSaving: number[];
  menus: Set<string>;
  weeksMeasured: number;
  weeksSkipped: number;
}
const tally: Tally = {
  cheapestChain: {},
  twoShopsUsed: 0,
  twoShopsWorthIt: 0,
  ahMinusJumbo: [],
  bestSaving: [],
  bestPracticalSaving: [],
  menus: new Set(),
  weeksMeasured: 0,
  weeksSkipped: 0,
};

for (const [week, scenario] of weekScenarios(weekCount).entries()) {
  // The reference menu comes from the richest setup: both shops, either or
  // both. Any other choice would hand one setup its favourite week.
  const reference = planFreely(SETUPS[3]!, scenario);
  if (!reference) {
    console.log(`  week ${week}: geen referentieweek (D leverde niets op) — overgeslagen`);
    tally.weeksSkipped += 1;
    continue;
  }
  const menu = reference.option.menu;

  const sameBasket = new Map<string, ReturnType<typeof unwrap>>();
  const freeChoice = new Map<string, ReturnType<typeof unwrap>>();
  let incomplete = false;
  for (const setup of SETUPS) {
    const pinned = priceMenu(setup, scenario, menu);
    const free = planFreely(setup, scenario);
    if (!pinned || !free) {
      console.log(
        `  week ${week}: opstelling ${setup.key} leverde geen week op ` +
          `(${pinned ? 'vrije keuze' : 'vastgezet menu'}) — week overgeslagen`,
      );
      incomplete = true;
      break;
    }
    sameBasket.set(setup.key, pinned.option);
    freeChoice.set(setup.key, free.option);
  }
  if (incomplete) {
    tally.weeksSkipped += 1;
    continue;
  }
  tally.weeksMeasured += 1;

  const best = (source: Map<string, ReturnType<typeof unwrap>>): string =>
    [...source.entries()].sort(
      (a, b) => a[1].practical - b[1].practical || a[0].localeCompare(b[0]),
    )[0]![0];

  const a = sameBasket.get('A')!;
  const b = sameBasket.get('B')!;
  const d = sameBasket.get('D')!;
  const bestPinned = sameBasket.get(best(sameBasket))!;

  tally.menus.add(menu.join('|'));
  tally.cheapestChain[bestPinned.chains] = (tally.cheapestChain[bestPinned.chains] ?? 0) + 1;
  if (d.chains.includes('+')) {
    tally.twoShopsUsed += 1;
    if (d.practical < Math.min(a.practical, b.practical)) tally.twoShopsWorthIt += 1;
  }
  tally.ahMinusJumbo.push(a.grocery - b.grocery);
  tally.bestSaving.push(a.grocery - bestPinned.grocery);
  tally.bestPracticalSaving.push(a.practical - bestPinned.practical);

  if (weekCount === 1) {
    console.log('  Het menu (vastgezet voor alle vier de opstellingen)\n');
    for (const name of reference.option.names) console.log(`    ${name}`);

    for (const [title, source] of [
      ['Zelfde mandje, andere winkels', sameBasket],
      ['Vrije keuze — ander menu per opstelling, dus geen prijsvergelijking', freeChoice],
    ] as const) {
      console.log(`\n  ${title}\n`);
      const header =
        '    ' +
        'opstelling'.padEnd(26) +
        'boodschappen'.padStart(13) +
        'reis'.padStart(9) +
        'praktisch'.padStart(11) +
        'winkels'.padStart(10) +
        'mist'.padStart(6);
      console.log(header);
      console.log('    ' + '-'.repeat(header.length - 4));
      for (const setup of SETUPS) {
        const row = source.get(setup.key)!;
        console.log(
          '    ' +
            `${setup.key}  ${setup.label}`.padEnd(26) +
            euro(row.grocery).padStart(13) +
            euro(row.travel).padStart(9) +
            euro(row.practical).padStart(11) +
            row.chains.padStart(10) +
            String(row.missing).padStart(6),
        );
      }
    }

    const winner = best(sameBasket);
    console.log(
      `\n  Zelfde mandje: ${winner} is het goedkoopst, ` +
        `${euro(a.grocery - sameBasket.get(winner)!.grocery)} bruto` +
        ` en ${euro(a.practical - sameBasket.get(winner)!.practical)} na reiskosten,` +
        ` tegenover alleen Albert Heijn.\n`,
    );
  }
}

if (weekCount > 1) {
  const mean = (xs: number[]): number =>
    xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
  const median = (xs: number[]): number => {
    if (xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  };

  console.log(
    `  ${tally.weeksMeasured} weken gemeten, ${tally.weeksSkipped} overgeslagen, ` +
      `${tally.menus.size} verschillende menu's\n`,
  );

  console.log('  Waar de week uiteindelijk gekocht wordt (zelfde mandje)\n');
  for (const [chains, count] of [...Object.entries(tally.cheapestChain)].sort(
    (x, y) => y[1] - x[1],
  )) {
    console.log(`    ${chains.padEnd(12)} ${String(count).padStart(3)} van ${tally.weeksMeasured}`);
  }
  console.log(
    `\n    twee winkels toegestaan en ook gebruikt   ${tally.twoShopsUsed} van ${tally.weeksMeasured}`,
  );
  console.log(
    `    en dan ook echt goedkoper dan één winkel  ${tally.twoShopsWorthIt} van ${tally.weeksMeasured}`,
  );

  console.log('\n  Prijsverschil per week, hetzelfde mandje\n');
  const spread = tally.ahMinusJumbo;
  const ahCheaper = spread.filter((x) => x < 0).length;
  console.log(
    `    Albert Heijn min Jumbo        gem. ${euro(mean(spread))}   mediaan ${euro(median(spread))}` +
      `   (AH goedkoper in ${ahCheaper} van ${spread.length})`,
  );
  console.log('\n  Besparing tegenover alleen Albert Heijn\n');
  console.log(
    `    bruto (alleen boodschappen)   gem. ${euro(mean(tally.bestSaving))}   mediaan ${euro(median(tally.bestSaving))}`,
  );
  console.log(
    `    praktisch (incl. reis)        gem. ${euro(mean(tally.bestPracticalSaving))}   mediaan ${euro(median(tally.bestPracticalSaving))}`,
  );
  console.log('');
}
