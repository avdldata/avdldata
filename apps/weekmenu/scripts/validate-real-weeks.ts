/**
 * Twenty real weeks, checked line by line.
 *
 * The golden corpus proves the matcher on the examples it was tuned against.
 * This proves it on everything else: twenty different households, each planning
 * a real week from real Albert Heijn data, and every single shopping-list line
 * audited automatically.
 *
 * The check that matters is the last one. A line may only contain a product
 * whose match was auto-approved or manually approved — never one in review,
 * never one rejected. If a product nobody vouched for can end up in a basket,
 * the quality gate is decoration.
 *
 *   pnpm match:weeks
 */
import { readFileSync } from 'node:fs';
import { cents, quantity, type Cents } from '../src/domain/units';
import { buildIngredientIndex } from '../src/domain/ingredients/types';
import { normaliseRecipes } from '../src/domain/recipes/normalise';
import { optimiseWeek } from '../src/domain/optimization/week-optimizer';
import type { StoreCandidate } from '../src/domain/optimization/store-selection';
import type { ProductOffer } from '../src/domain/stores/types';
import { resolvePackage } from '../src/domain/ingestion/package-parser';
import { reduceCandidates } from '../src/domain/ingestion/candidate-reduction';
import { buildIngredientPhrases, matchProduct } from '../src/domain/ingestion/match-ingredient';
import { PRODUCT_MATCH_OVERRIDES } from '../src/data/matching/overrides';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';
import { DEMO_HOUSEHOLD } from '../src/data/seed/demo-household';
import type { ConveniencePreference } from '../src/domain/optimization/config';

interface RawProduct {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
}
const chains = JSON.parse(readFileSync('data/external/checkjebon-snapshot.json', 'utf8')) as {
  n?: string;
  c?: string;
  d?: RawProduct[];
}[];
const chain = chains.find((c) => c.n === 'ah')!;

const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);
const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);

/** Every product, with the matcher's verdict kept alongside it for auditing. */
const verdicts = new Map<string, { status: string; ingredientId: string; name: string }>();
const offers: ProductOffer[] = [];

for (const product of chain.d ?? []) {
  const productId = `ah:${product.l ?? product.n ?? ''}`;
  const name = product.n ?? '';
  const match = matchProduct({ productId, productName: name }, phrases, PRODUCT_MATCH_OVERRIDES);
  if (!match) continue;
  verdicts.set(productId, {
    status: match.status,
    ingredientId: match.canonicalIngredientId,
    name,
  });

  const approved = match.status === 'AUTO_APPROVED' || match.status === 'APPROVED';
  if (!approved) continue;

  const pack = resolvePackage(product.s, product.n);
  const price = product.p;
  if (pack.status !== 'OK') continue;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;

  const unitPrice = cents(Math.round(price * 100)) as Cents;
  offers.push({
    productId,
    chainId: 'ah',
    locationId: 'ah-shadow',
    ingredientId: match.canonicalIngredientId,
    name,
    brandName: chain.c ?? 'AH',
    isPrivateLabel: false,
    packageAmount: quantity(pack.info.totalAmount, pack.info.baseUnit),
    normalUnitPriceCents: unitPrice,
    unitPriceCents: unitPrice,
    pricePerBaseUnitCents: unitPrice / Math.max(1, pack.info.totalAmount),
    nutritionOrigin: 'ingredient',
  });
}

// Candidate reduction is applied here too, so what the audit checks is exactly
// what a real run would buy — a validation of a different pipeline validates
// nothing.
const reduction = reduceCandidates(offers);
const store: StoreCandidate = {
  location: {
    id: 'ah-shadow',
    chainId: 'ah',
    name: 'AH (schaduwmodus)',
    address: '',
    postalCode: '9711AA',
    city: 'Groningen',
    latitude: DEMO_HOUSEHOLD.location.latitude!,
    longitude: DEMO_HOUSEHOLD.location.longitude!,
    regionId: 'nl',
  },
  chain: { id: 'ah', name: chain.c ?? 'AH', logoUrl: '', colorHex: '#00a0e2' },
  distanceKm: 2.5,
  offers: reduction.kept,
};

/** Twenty households that differ in the ways the optimizer cares about. */
const CONVENIENCE: ConveniencePreference[] = ['laagste-prijs', 'gebalanceerd', 'gemak'];
const scenarios = Array.from({ length: 20 }, (_, index) => ({
  label: `week ${String(index + 1).padStart(2, '0')}`,
  members: DEMO_HOUSEHOLD.members.slice(0, 1 + (index % DEMO_HOUSEHOLD.members.length)),
  conveniencePreference: CONVENIENCE[index % CONVENIENCE.length]!,
  startDate: `2026-09-${String(7 + (index % 14)).padStart(2, '0')}`,
}));

const durations: number[] = [];
const problems: string[] = [];
let totalLines = 0;
let planned = 0;

console.log(
  `\nTwintig echte AH-weken — ${offers.length} goedgekeurd, ` +
    `${reduction.kept.length} na reductie (${reduction.removed.length} gedomineerd)\n`,
);
const head =
  '  ' +
  'scenario'.padEnd(10) +
  'leden'.padStart(7) +
  'gemak'.padStart(16) +
  'regels'.padStart(8) +
  'ontbreekt'.padStart(11) +
  'totaal'.padStart(10) +
  'ms'.padStart(8);
console.log(head);
console.log('  ' + '-'.repeat(head.length - 2));

for (const scenario of scenarios) {
  const started = performance.now();
  const result = optimiseWeek({
    household: { ...DEMO_HOUSEHOLD, members: scenario.members },
    recipes,
    ingredients: ingredientIndex,
    stores: [store],
    maxStores: 1,
    conveniencePreference: scenario.conveniencePreference,
    budget: {},
    startDate: scenario.startDate,
    today: new Date(`${scenario.startDate}T09:00:00Z`),
  });
  const elapsed = performance.now() - started;
  durations.push(elapsed);

  if (result.status !== 'OK') {
    problems.push(`${scenario.label}: geen week (${result.reason})`);
    continue;
  }
  planned += 1;

  const lines = result.plan.recommendedOption.assignments.flatMap((a) => a.packaging.lines);
  totalLines += lines.length;

  // The audit: every line, against the matcher's own verdict.
  for (const line of lines) {
    const verdict = verdicts.get(line.offer.productId);
    if (!verdict) {
      problems.push(`${scenario.label}: ${line.offer.name} heeft geen match-oordeel`);
      continue;
    }
    if (verdict.status !== 'AUTO_APPROVED' && verdict.status !== 'APPROVED') {
      problems.push(
        `${scenario.label}: ${line.offer.name} is ${verdict.status} en staat tóch op de lijst`,
      );
    }
    if (line.offer.ingredientId !== verdict.ingredientId) {
      problems.push(`${scenario.label}: ${line.offer.name} koppelt aan een ander ingredient`);
    }
    if (line.offer.packageAmount.amount <= 0) {
      problems.push(`${scenario.label}: ${line.offer.name} heeft geen geldige verpakking`);
    }
    if (line.offer.unitPriceCents <= 0) {
      problems.push(`${scenario.label}: ${line.offer.name} heeft geen geldige prijs`);
    }
  }

  console.log(
    '  ' +
      scenario.label.padEnd(10) +
      String(scenario.members.length).padStart(7) +
      scenario.conveniencePreference.padStart(16) +
      String(lines.length).padStart(8) +
      String(result.plan.recommendedOption.unavailable.length).padStart(11) +
      `€${(result.plan.totals.groceryCents / 100).toFixed(2)}`.padStart(10) +
      elapsed.toFixed(0).padStart(8),
  );
}

durations.sort((a, b) => a - b);
const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
const p95 = durations[Math.min(durations.length - 1, Math.ceil(0.95 * durations.length) - 1)]!;

console.log(`\n  weken gepland        ${planned}/20`);
console.log(`  boodschappenregels   ${totalLines}`);
console.log(`  latency gemiddeld    ${mean.toFixed(0)} ms`);
console.log(`  latency p95          ${p95.toFixed(0)} ms`);
console.log(`  latency slechtste    ${durations.at(-1)!.toFixed(0)} ms`);

// Every distinct product the twenty weeks actually bought, for a human to read.
if (process.argv.includes('--products')) {
  const bought = new Map<string, string>();
  for (const [id, v] of verdicts)
    if (v.status === 'AUTO_APPROVED' || v.status === 'APPROVED') bought.set(id, v.name);
  const used = new Map<string, string>();
  for (const scenario of scenarios) {
    const result = optimiseWeek({
      household: { ...DEMO_HOUSEHOLD, members: scenario.members },
      recipes,
      ingredients: ingredientIndex,
      stores: [store],
      maxStores: 1,
      conveniencePreference: scenario.conveniencePreference,
      budget: {},
      startDate: scenario.startDate,
      today: new Date(`${scenario.startDate}T09:00:00Z`),
    });
    if (result.status !== 'OK') continue;
    for (const a of result.plan.recommendedOption.assignments)
      for (const l of a.packaging.lines)
        used.set(l.offer.productId, `${l.offer.ingredientId}\t${l.offer.name}`);
  }
  console.log(`\n  ${used.size} verschillende producten gekocht over twintig weken\n`);
  for (const v of [...used.values()].sort()) console.log(`    ${v}`);
}

if (problems.length === 0) {
  console.log('\n  Geen enkel product op een lijst dat niet goedgekeurd is.\n');
} else {
  console.log(`\n  ${problems.length} PROBLEMEN\n`);
  for (const problem of problems.slice(0, 20)) console.log(`    ${problem}`);
  console.log('');
}

process.exit(problems.length > 0 ? 1 : 0);
