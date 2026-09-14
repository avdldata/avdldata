/**
 * Plan a real week from real supermarket data.
 *
 * The end-to-end proof this phase exists to produce: recipes → canonical
 * ingredients → real products → real pack sizes → real prices → the packaging
 * optimizer → a shopping list with a total that traces back to the source.
 *
 * Shadow mode by design. The app itself still runs on the seeded demo data;
 * this is a separate entry point so that real data can be measured long before
 * anything depends on it.
 *
 *   pnpm data:week                (Albert Heijn)
 *   pnpm data:week -- --chain jumbo
 */
import { readFileSync } from 'node:fs';
import { cents, quantity, type Cents } from '../src/domain/units';
import { buildIngredientIndex } from '../src/domain/ingredients/types';
import { normaliseRecipes } from '../src/domain/recipes/normalise';
import { optimiseWeek } from '../src/domain/optimization/week-optimizer';
import type { StoreCandidate } from '../src/domain/optimization/store-selection';
import type { ProductOffer } from '../src/domain/stores/types';
import { parsePackage } from '../src/domain/ingestion/package-parser';
import { buildIngredientPhrases, matchProduct } from '../src/domain/ingestion/match-ingredient';
import { SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES } from '../src/data/seed/ingredients';
import { SEED_RECIPES } from '../src/data/seed/recipes';
import { DEMO_HOUSEHOLD } from '../src/data/seed/demo-household';

const args = process.argv.slice(2);
const chainArg = args.indexOf('--chain');
const wanted = chainArg !== -1 ? args[chainArg + 1]! : 'ah';
const fileArg = args.indexOf('--file');
const path = fileArg !== -1 ? args[fileArg + 1]! : 'data/external/checkjebon-snapshot.json';

interface RawProduct {
  n?: string;
  l?: string;
  p?: number;
  s?: string;
}
interface RawChain {
  n?: string;
  c?: string;
  u?: string;
  d?: RawProduct[];
}

const chains = JSON.parse(readFileSync(path, 'utf8')) as RawChain[];
const chain = chains.find((c) => c.n === wanted);
if (!chain) throw new Error(`no chain "${wanted}" in ${path}`);

const ingredientIndex = buildIngredientIndex(SEED_INGREDIENTS);
const recipes = normaliseRecipes(SEED_RECIPES, ingredientIndex);
const phrases = buildIngredientPhrases(SEED_INGREDIENTS, SEED_INGREDIENT_ALIASES);

// Only products that clear every gate: an auto-approved match, a real price and
// a package the optimizer can reason about. Anything short of that is excluded
// rather than guessed at — a product with no readable pack size would otherwise
// silently distort the whole week.
const offers: ProductOffer[] = [];
let rejectedPack = 0;
let rejectedMatch = 0;

for (const product of chain.d ?? []) {
  const name = product.n ?? '';
  const price = product.p;
  const match = matchProduct({ productId: product.l ?? name, productName: name }, phrases);
  if (!match || match.status !== 'AUTO_APPROVED') {
    rejectedMatch += 1;
    continue;
  }
  const pack = parsePackage(product.s);
  if (pack.status !== 'OK') {
    rejectedPack += 1;
    continue;
  }
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;

  // Euros arrive as a float; money becomes an integer immediately and stays one.
  const unitPrice = cents(Math.round(price * 100)) as Cents;
  const amount = quantity(pack.info.totalAmount, pack.info.baseUnit);

  offers.push({
    productId: `${wanted}:${product.l ?? name}`,
    chainId: wanted,
    locationId: `${wanted}-shadow`,
    ingredientId: match.canonicalIngredientId,
    name,
    brandName: chain.c ?? wanted,
    isPrivateLabel: false,
    packageAmount: amount,
    normalUnitPriceCents: unitPrice,
    unitPriceCents: unitPrice,
    pricePerBaseUnitCents: unitPrice / Math.max(1, pack.info.totalAmount),
    nutritionOrigin: 'ingredient',
  });
}

const store: StoreCandidate = {
  location: {
    id: `${wanted}-shadow`,
    chainId: wanted,
    name: `${chain.c ?? wanted} (schaduwmodus)`,
    address: '',
    postalCode: '9711AA',
    city: 'Groningen',
    latitude: DEMO_HOUSEHOLD.location.latitude!,
    longitude: DEMO_HOUSEHOLD.location.longitude!,
    regionId: 'nl',
  },
  chain: { id: wanted, name: chain.c ?? wanted, logoUrl: '', colorHex: '#666666' },
  distanceKm: 2.5,
  offers,
};

console.log(`\nEchte week — keten "${wanted}", bron Checkjebon-snapshot\n`);
console.log(`  aanbiedingen bruikbaar   ${offers.length}`);
console.log(`  afgewezen op matching    ${rejectedMatch}`);
console.log(`  afgewezen op verpakking  ${rejectedPack}`);
console.log(`  ingrediënten gedekt      ${new Set(offers.map((o) => o.ingredientId)).size}`);

const started = performance.now();
const result = optimiseWeek({
  household: DEMO_HOUSEHOLD,
  recipes,
  ingredients: ingredientIndex,
  stores: [store],
  maxStores: 1,
  conveniencePreference: 'gebalanceerd',
  budget: {},
  startDate: '2026-09-14',
  today: new Date('2026-09-14T09:00:00Z'),
});
const elapsed = performance.now() - started;

if (result.status !== 'OK') {
  console.log(`\n  GEEN WEEK: ${result.reason} — ${result.message}\n`);
  process.exit(1);
}

const plan = result.plan;
console.log(`  optimizer                ${elapsed.toFixed(0)} ms\n`);
console.log('  De week\n');
for (const day of plan.days) {
  console.log(`    ${day.date}  ${day.recipe.name}`);
}

console.log(`\n  Boodschappenlijst (${plan.recommendedOption.assignments.length} regels)\n`);
for (const assignment of plan.recommendedOption.assignments) {
  for (const line of assignment.packaging.lines) {
    console.log(
      `    ${(line.lineTotalCents / 100).toFixed(2).padStart(7)}  ${String(line.units).padStart(2)}x  ` +
        `${line.offer.name.slice(0, 52).padEnd(52)} ${line.offer.packageAmount.amount}${line.offer.packageAmount.unit}`,
    );
  }
}

if (plan.recommendedOption.unavailable.length > 0) {
  console.log(`\n  Niet te koop bij deze keten (${plan.recommendedOption.unavailable.length})`);
  for (const item of plan.recommendedOption.unavailable) console.log(`    ${item.ingredientId}`);
}

console.log(
  `\n  Boodschappen  € ${(plan.totals.groceryCents / 100).toFixed(2)}` +
    `   per persoon per maaltijd € ${(plan.totals.perPersonPerMealCents / 100).toFixed(2)}\n`,
);
