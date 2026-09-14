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
import { DEMO_HOUSEHOLD } from '../src/data/seed/demo-household';
import { loadRealChains, SNAPSHOT_DATE } from '../tests/support/real-data-store';

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

/**
 * Rotate the catalogue so successive weeks are genuinely different menus.
 *
 * Not a random sample: the same rotation is applied to every setup within a
 * week, so the four setups always face the identical choice. Determinism is the
 * whole point — a comparison that resamples per setup measures the sampler.
 */
function rotate<T>(items: readonly T[], by: number): T[] {
  const at = ((by % items.length) + items.length) % items.length;
  return [...items.slice(at), ...items.slice(0, at)];
}

function inputFor(setup: Setup, recipes: readonly Recipe[]): OptimizerInput {
  return {
    household: DEMO_HOUSEHOLD,
    recipes,
    ingredients: fixture.ingredientIndex,
    stores: setup.stores,
    maxStores: setup.maxStores,
    conveniencePreference: 'gebalanceerd',
    budget: {},
    startDate: '2026-09-14',
    today: new Date('2026-09-14T09:00:00Z'),
  };
}

/** Let the optimizer choose everything, menu included. */
function planFreely(
  setup: Setup,
  recipes: readonly Recipe[],
): { option: ReturnType<typeof unwrap>; ms: number } | undefined {
  const started = performance.now();
  const result = optimiseWeek(inputFor(setup, recipes));
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
  recipes: readonly Recipe[],
  menu: readonly string[],
): { option: ReturnType<typeof unwrap>; ms: number } | undefined {
  const prepared = prepareOptimization(inputFor(setup, recipes));
  if (prepared.status !== 'OK') return undefined;
  const byId = new Map(prepared.candidates.map((r) => [r.id, r]));
  const ordered = menu.map((id) => byId.get(id));
  if (ordered.some((r) => r === undefined)) return undefined;

  const started = performance.now();
  const priced = evaluateWeek({
    recipes: ordered as Recipe[],
    portionsByRecipe: prepared.portionsByRecipe,
    household: DEMO_HOUSEHOLD,
    memberNutrition: prepared.memberNutrition,
    ingredients: fixture.ingredientIndex,
    stores: prepared.stores,
    matrixHome: prepared.home,
    maxStores: prepared.maxStores,
    extraStorePenalty: prepared.extraStorePenalty,
    budget: {},
    startDate: '2026-09-14',
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

interface Tally {
  sameBasketWins: Record<string, number>;
  freeChoiceWins: Record<string, number>;
  grossSaving: number[];
  practicalSaving: number[];
  weeksMeasured: number;
  weeksSkipped: number;
}
const tally: Tally = {
  sameBasketWins: { A: 0, B: 0, C: 0, D: 0 },
  freeChoiceWins: { A: 0, B: 0, C: 0, D: 0 },
  grossSaving: [],
  practicalSaving: [],
  weeksMeasured: 0,
  weeksSkipped: 0,
};

for (let week = 0; week < weekCount; week += 1) {
  const recipes = rotate(fixture.recipes, week * 3);

  // The reference menu comes from the richest setup: both shops, either or
  // both. Any other choice would hand one setup its favourite week.
  const reference = planFreely(SETUPS[3]!, recipes);
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
    const pinned = priceMenu(setup, recipes, menu);
    const free = planFreely(setup, recipes);
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
  tally.sameBasketWins[best(sameBasket)] = (tally.sameBasketWins[best(sameBasket)] ?? 0) + 1;
  tally.freeChoiceWins[best(freeChoice)] = (tally.freeChoiceWins[best(freeChoice)] ?? 0) + 1;

  const a = sameBasket.get('A')!;
  const bestPinned = sameBasket.get(best(sameBasket))!;
  tally.grossSaving.push(a.grocery - bestPinned.grocery);
  tally.practicalSaving.push(a.practical - bestPinned.practical);

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

  console.log(`  ${tally.weeksMeasured} weken gemeten, ${tally.weeksSkipped} overgeslagen\n`);
  console.log('  Wie wint, per vraag\n');
  const header =
    '    ' + 'opstelling'.padEnd(26) + 'zelfde mandje'.padStart(15) + 'vrije keuze'.padStart(14);
  console.log(header);
  console.log('    ' + '-'.repeat(header.length - 4));
  for (const setup of SETUPS) {
    console.log(
      '    ' +
        `${setup.key}  ${setup.label}`.padEnd(26) +
        String(tally.sameBasketWins[setup.key] ?? 0).padStart(15) +
        String(tally.freeChoiceWins[setup.key] ?? 0).padStart(14),
    );
  }
  console.log('\n  Besparing tegenover alleen Albert Heijn, zelfde mandje\n');
  console.log(
    `    bruto (alleen boodschappen)   gem. ${euro(mean(tally.grossSaving))}   mediaan ${euro(median(tally.grossSaving))}`,
  );
  console.log(
    `    praktisch (incl. reis)        gem. ${euro(mean(tally.practicalSaving))}   mediaan ${euro(median(tally.practicalSaving))}`,
  );
  console.log('');
}
