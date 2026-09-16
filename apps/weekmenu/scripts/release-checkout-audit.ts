/**
 * De kassabon narekenen.
 *
 *   pnpm release:checkout [pad-naar-demo.json]
 *
 * Takes the week that is actually stored for a household and checks its
 * arithmetic the way you would at the till: how many packs, what does the
 * register charge for that many, does the line add up, do the lines add up to
 * the shop, do the shops add up to the total.
 *
 * The register logic here is written out again from the promotion types rather
 * than imported from `priceForUnits`. Importing it would compare the engine
 * with itself and agree by construction; the point of this script is to have a
 * second opinion. Where the two disagree, one of them is wrong and the
 * difference is printed rather than absorbed.
 */
import { readFileSync } from 'node:fs';

interface Promotion {
  params:
    | { type: 'FIXED_PRICE'; unitPriceCents: number }
    | { type: 'PERCENT_OFF'; percent: number }
    | { type: 'ONE_PLUS_ONE' }
    | { type: 'N_FOR_X'; bundleSize: number; bundlePriceCents: number }
    | { type: 'BUY_NTH_DISCOUNT'; nth: number; percent: number };
  minUnits?: number;
  label?: string;
}

interface Line {
  offer: {
    productId: string;
    chainId: string;
    name: string;
    normalUnitPriceCents: number;
    unitPriceCents: number;
    packageAmount: { amount: number; unit: string };
    promotion?: Promotion;
  };
  units: number;
  lineTotalCents: number;
  promotionApplied: boolean;
  savingsCents: number;
}

/** What the register charges for `units` packs, worked out from scratch. */
function checkout(shelfCents: number, units: number, promotion?: Promotion): number {
  const plain = shelfCents * units;
  if (!promotion || units < (promotion.minUnits ?? 1)) return plain;

  const p = promotion.params;
  let promo: number;
  switch (p.type) {
    case 'FIXED_PRICE':
      promo = p.unitPriceCents * units;
      break;
    case 'PERCENT_OFF':
      // Per pack, rounded per pack — a shop does not charge half cents.
      promo = Math.round(shelfCents * (1 - p.percent / 100)) * units;
      break;
    case 'ONE_PLUS_ONE': {
      // You pay for every second pack: 1→1, 2→1, 3→2, 4→2.
      promo = Math.ceil(units / 2) * shelfCents;
      break;
    }
    case 'N_FOR_X': {
      const bundles = Math.floor(units / p.bundleSize);
      const loose = units - bundles * p.bundleSize;
      promo = bundles * p.bundlePriceCents + loose * shelfCents;
      break;
    }
    case 'BUY_NTH_DISCOUNT': {
      // Every nth pack in the row is discounted: 2e halve prijs, 3e gratis.
      const discounted = Math.floor(units / p.nth);
      const full = units - discounted;
      promo = full * shelfCents + discounted * Math.round(shelfCents * (1 - p.percent / 100));
      break;
    }
  }
  // A promotion may never cost more than the shelf.
  return Math.min(plain, promo);
}

const euro = (cents: number): string => `€ ${(cents / 100).toFixed(2).replace('.', ',')}`;

const path = process.argv[2] ?? '.data/e2e/demo.json';
const db = JSON.parse(readFileSync(path, 'utf8')) as {
  plans: Record<string, { startDate: string; generatedAt?: string; plan?: unknown }>;
};
const weeks = Object.values(db.plans).filter((week) => week.plan);
if (weeks.length === 0) {
  console.error(`Geen opgeslagen geprijsde week in ${path}.`);
  process.exit(1);
}

interface PricedPlan {
  recommendedOption: {
    chainIds: string[];
    groceryCents: number;
    promotionSavingsCents: number;
    assignments: {
      chainId: string;
      name: string;
      packaging: { totalCents: number; lines: Line[] };
    }[];
  };
  totals: { groceryCents: number };
}

let printed = 0;
let worstLineDrift = 0;
let promotionLines = 0;
const problems: string[] = [];

console.log(
  `\n  ${'product'.padEnd(44)} ${'winkel'.padEnd(6)} ${'pak'.padStart(4)} ${'n'.padStart(3)} ` +
    `${'regel'.padStart(8)} ${'nagerekend'.padStart(10)}  promotie`,
);

for (const stored of weeks) {
  const plan = stored.plan as PricedPlan;
  const option = plan.recommendedOption;
  const perChain = new Map<string, number>();

  for (const assignment of option.assignments) {
    for (const line of assignment.packaging.lines) {
      const expected = checkout(line.offer.normalUnitPriceCents, line.units, line.offer.promotion);
      const drift = Math.abs(expected - line.lineTotalCents);
      worstLineDrift = Math.max(worstLineDrift, drift);
      perChain.set(
        line.offer.chainId,
        (perChain.get(line.offer.chainId) ?? 0) + line.lineTotalCents,
      );
      if (line.promotionApplied) promotionLines += 1;

      if (drift > 1) {
        problems.push(
          `${line.offer.productId}: app ${euro(line.lineTotalCents)}, nagerekend ${euro(expected)}`,
        );
      }
      // Every promoted line is printed — those are the interesting ones — plus
      // enough ordinary ones to cover the brief's ten, spread over the chains.
      if (line.promotionApplied || printed < 12) {
        console.log(
          `  ${line.offer.name.slice(0, 44).padEnd(44)} ${line.offer.chainId.padEnd(6)} ` +
            `${String(line.offer.normalUnitPriceCents).padStart(4)} ${String(line.units).padStart(3)} ` +
            `${euro(line.lineTotalCents).padStart(8)} ${euro(expected).padStart(10)}  ` +
            `${line.offer.promotion?.label ?? ''}${drift > 0 ? `  ← ${drift} cent verschil` : ''}`,
        );
        printed += 1;
      }
    }
  }

  const sumLines = [...perChain.values()].reduce((a, b) => a + b, 0);
  const sumPackaging = option.assignments.reduce((sum, a) => sum + a.packaging.totalCents, 0);
  const totalDrift = Math.abs(sumLines - option.groceryCents);

  console.log(`\n  week van ${stored.startDate} — ${option.chainIds.join(' + ')}`);
  for (const [chain, cents] of [...perChain].sort()) {
    console.log(`    subtotaal ${chain.padEnd(8)} ${euro(cents).padStart(9)}`);
  }
  console.log(`    som van de regels        ${euro(sumLines).padStart(9)}`);
  console.log(`    som van de verpakkingen  ${euro(sumPackaging).padStart(9)}`);
  console.log(`    boodschappentotaal       ${euro(option.groceryCents).padStart(9)}`);
  console.log(`    weektotaal               ${euro(plan.totals.groceryCents).padStart(9)}`);
  console.log(`    aanbiedingsvoordeel      ${euro(option.promotionSavingsCents).padStart(9)}`);
  console.log(`    verschil regels ↔ totaal ${totalDrift} cent`);

  if (totalDrift > 1 || sumPackaging !== option.groceryCents) {
    problems.push(`week ${stored.startDate}: de regels tellen niet op tot het totaal`);
  }
}

console.log(`\n  weken nagerekend                 ${weeks.length}`);
console.log(`  regels met een aanbieding        ${promotionLines}`);
console.log(`  grootste verschil op een regel   ${worstLineDrift} cent`);

if (problems.length > 0) {
  console.log(`\n  REGELS DIE NIET KLOPPEN (${problems.length})`);
  for (const problem of problems) console.log(`    ${problem}`);
}

const ok = problems.length === 0 && worstLineDrift <= 1;
console.log(`\n  ${ok ? 'KASSACONTROLE AKKOORD' : 'KASSACONTROLE NIET AKKOORD'}\n`);
process.exit(ok ? 0 : 1);
