/**
 * Fifty real weeks, checked line by line, in one shop or in two.
 *
 * The golden corpora prove the matcher on the examples it was tuned against.
 * This proves it on everything else: fifty different households, each planning
 * a real week from real supermarket data, and every shopping-list line audited
 * automatically.
 *
 * The check that matters most is the match verdict. A line may only contain a
 * product whose match was auto-approved or manually approved — never one in
 * review, never one rejected. If a product nobody vouched for can end up in a
 * basket, the quality gate is decoration.
 *
 * The rest of the checks are the ones a plausible-looking list can still fail.
 * A shopping list is believed on sight, so "it looks fine" is not evidence:
 * these assert the arithmetic instead.
 *
 *   pnpm match:weeks                        Albert Heijn, one shop
 *   pnpm match:weeks -- --chains ah,jumbo --max-stores 2
 *   pnpm match:weeks -- --weeks 50 --products
 */
import { optimiseWeek } from '../src/domain/optimization/week-optimizer';
import { describeProvenance } from '../src/domain/ingestion/provenance';
import { loadRealChains, type RealChainId } from '../tests/support/real-data-store';
import { weekScenarios } from '../tests/support/week-scenarios';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  args.indexOf(name) !== -1 ? args[args.indexOf(name) + 1] : undefined;

const chainIds = (flag('--chains') ?? 'ah').split(',').map((c) => c.trim()) as RealChainId[];
const maxStores = Number(flag('--max-stores') ?? 1);
const weekCount = Number(flag('--weeks') ?? 50);
const euro = (c: number): string => `€${(c / 100).toFixed(2)}`;

const fixture = loadRealChains(chainIds);
const scenarios = weekScenarios(weekCount);

const durations: number[] = [];
const problems: string[] = [];
const boughtProducts = new Map<string, { name: string; chain: string; times: number }>();
let totalLines = 0;
let planned = 0;
let twoShopWeeks = 0;

console.log(
  `\n${weekCount} echte weken — ${chainIds.join(' + ')}, ` +
    `maximaal ${maxStores} winkel${maxStores === 1 ? '' : 's'}\n`,
);
for (const chain of fixture.chains) {
  console.log(
    `  ${chain.chainId.padEnd(6)} ${String(chain.allOffers.length).padStart(4)} goedgekeurd, ` +
      `${String(chain.reducedOffers.length).padStart(4)} na reductie ` +
      `(${chain.removedCount} gedomineerd, ${chain.unconvertibleCount} niet om te rekenen)`,
  );
}
console.log('');

const head =
  '  ' +
  'scenario'.padEnd(10) +
  'leden'.padStart(7) +
  'gemak'.padStart(16) +
  'regels'.padStart(8) +
  'ontbreekt'.padStart(11) +
  'winkels'.padStart(10) +
  'totaal'.padStart(10) +
  'ms'.padStart(8);
console.log(head);
console.log('  ' + '-'.repeat(head.length - 2));

for (const scenario of scenarios) {
  const started = performance.now();
  const result = optimiseWeek({
    household: scenario.household,
    recipes: scenario.recipes(fixture.recipes),
    ingredients: fixture.ingredientIndex,
    stores: fixture.stores,
    maxStores,
    conveniencePreference: scenario.conveniencePreference,
    budget: {},
    startDate: scenario.startDate,
    today: scenario.today,
  });
  const elapsed = performance.now() - started;
  durations.push(elapsed);

  if (result.status !== 'OK') {
    problems.push(`${scenario.label}: geen week (${result.reason})`);
    continue;
  }
  planned += 1;

  const option = result.plan.recommendedOption;
  if (option.locationIds.length > 1) twoShopWeeks += 1;
  const lines = option.assignments.flatMap((a) => a.packaging.lines);
  totalLines += lines.length;

  const fail = (message: string): number => problems.push(`${scenario.label}: ${message}`);

  if (option.locationIds.length > maxStores) {
    fail(`${option.locationIds.length} winkels terwijl er ${maxStores} mocht(en)`);
  }

  for (const line of lines) {
    const source = fixture.provenance.get(line.offer.productId);
    if (!source) {
      fail(`${line.offer.name} heeft geen herkomst`);
      continue;
    }
    if (source.matchStatus !== 'AUTO_APPROVED' && source.matchStatus !== 'APPROVED') {
      fail(`${line.offer.name} is ${source.matchStatus} en staat tóch op de lijst`);
    }
    if (line.offer.packageAmount.amount <= 0) fail(`${line.offer.name}: verpakking ≤ 0`);
    if (line.offer.unitPriceCents <= 0) fail(`${line.offer.name}: prijs ≤ 0`);
    if (!Number.isInteger(line.lineTotalCents)) fail(`${line.offer.name}: regeltotaal geen cent`);
    if (line.lineTotalCents !== line.units * line.offer.unitPriceCents && !line.offer.promotion) {
      fail(`${line.offer.name}: regeltotaal klopt niet met stuksprijs × aantal`);
    }
    // The unit the shop sells in must be the unit the recipe measures in, or
    // the numbers in this line mean two different things. This is the check
    // that would have caught 186 peppers.
    const ingredient = fixture.ingredientIndex.get(line.offer.ingredientId);
    if (ingredient && line.offer.packageAmount.unit !== ingredient.baseUnit) {
      fail(`${line.offer.name}: ${line.offer.packageAmount.unit} ≠ ${ingredient.baseUnit}`);
    }
    // Seven dinners for at most three people. Twenty of anything is a mistake.
    if (line.units > 20) fail(`${line.units}x ${line.offer.name} — onwaarschijnlijk veel`);

    const key = line.offer.productId;
    const seen = boughtProducts.get(key);
    if (seen) seen.times += 1;
    else boughtProducts.set(key, { name: line.offer.name, chain: line.offer.chainId, times: 1 });
  }

  for (const assignment of option.assignments) {
    const { requiredAmount, purchasedAmount, lines: packLines } = assignment.packaging;
    if (purchasedAmount < requiredAmount - 1e-6) {
      fail(`${assignment.ingredientId}: koopt minder dan nodig`);
    }
    const largest = Math.max(...packLines.map((l) => l.offer.packageAmount.amount));
    if (purchasedAmount >= requiredAmount + largest) {
      fail(`${assignment.ingredientId}: koopt meer dan één verpakking te veel`);
    }
    // Assignments must respect the shops the week actually visits.
    if (!option.locationIds.includes(assignment.locationId)) {
      fail(`${assignment.ingredientId}: toegewezen aan een winkel die niet bezocht wordt`);
    }
  }

  const summed = lines.reduce((total, line) => total + line.lineTotalCents, 0);
  if (summed !== option.groceryCents) {
    fail(`regels tellen op tot ${euro(summed)}, totaal zegt ${euro(option.groceryCents)}`);
  }

  console.log(
    '  ' +
      scenario.label.padEnd(10) +
      String(scenario.household.members.length).padStart(7) +
      scenario.conveniencePreference.padStart(16) +
      String(lines.length).padStart(8) +
      String(option.unavailable.length).padStart(11) +
      option.chainIds.join('+').padStart(10) +
      euro(option.groceryCents).padStart(10) +
      elapsed.toFixed(0).padStart(8),
  );
}

durations.sort((a, b) => a - b);
const at = (q: number): number =>
  durations[Math.min(durations.length - 1, Math.ceil(q * durations.length) - 1)]!;
const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;

console.log(`\n  weken gepland        ${planned}/${weekCount}`);
console.log(`  waarvan twee winkels ${twoShopWeeks}`);
console.log(`  boodschappenregels   ${totalLines}`);
console.log(`  verschillende producten gekocht  ${boughtProducts.size}`);
console.log(`\n  latency gemiddeld    ${mean.toFixed(0)} ms`);
console.log(`  latency mediaan      ${at(0.5).toFixed(0)} ms`);
console.log(`  latency p95          ${at(0.95).toFixed(0)} ms`);
console.log(`  latency slechtste    ${durations.at(-1)!.toFixed(0)} ms`);

if (problems.length === 0) {
  console.log(`\n  Geen enkel probleem gevonden over ${totalLines} regels.\n`);
} else {
  console.log(`\n  ${problems.length} PROBLEMEN\n`);
  for (const problem of problems.slice(0, 40)) console.log(`    ${problem}`);
  if (problems.length > 40) console.log(`    ... en nog ${problems.length - 40}`);
  console.log('');
}

/*
 * Every distinct product these weeks actually bought, with its origin.
 *
 * This is the list a person reads to check semantics — the thing no automatic
 * check can do, because "is a jar of sun-dried tomatoes a reasonable answer to
 * 200 g of tomato" is a judgement, not an assertion.
 */
if (args.includes('--products')) {
  console.log(`  De ${boughtProducts.size} producten die deze weken gekocht zijn\n`);
  const rows = [...boughtProducts.entries()].sort(
    (a, b) => b[1].times - a[1].times || a[0].localeCompare(b[0]),
  );
  for (const [productId, product] of rows) {
    const source = fixture.provenance.get(productId);
    console.log(
      `    ${String(product.times).padStart(3)}x  [${product.chain}] ${product.name.slice(0, 54)}`,
    );
    if (source) console.log(`          ${describeProvenance(source)}`);
  }
  console.log('');
}

process.exit(problems.length > 0 ? 1 : 0);
