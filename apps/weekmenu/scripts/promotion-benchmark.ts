/**
 * What do promotions actually change?
 *
 * The same week, planned twice — once at shelf prices and once with promotions
 * in force — over fifty households and three store setups. Everything the
 * comparison reports is a difference between two runs that differ in exactly
 * one thing.
 *
 * ## Where the promotions come from
 *
 * If `data/external/promotions-snapshot.json` exists, it is used, and every
 * number below is a measurement.
 *
 * If it does not, the run falls back to a **model** and says so on every line.
 * PrijsProfeet is unreachable from this environment (see
 * PRIJSPROFEET_INTEGRATION.md), so there is no real promotion data to measure;
 * what the model buys is a sensitivity curve — at what share of the basket does
 * a second supermarket start to pay for itself — which is a bounded, honest
 * answer where a single invented figure would not be.
 *
 *   pnpm promo:bench                    one rate, fifty weeks
 *   pnpm promo:bench -- --sweep         a curve over several rates
 *   pnpm promo:bench -- --weeks 10 --rate 0.2
 */
import { optimiseWeek, type OptimizerInput } from '../src/domain/optimization/week-optimizer';
import type { StoreCandidate } from '../src/domain/optimization/store-selection';
import { promotionSavings } from '../src/domain/pricing/promotions';
import { reduceCandidates } from '../src/domain/ingestion/candidate-reduction';
import { applyPromotions } from '../src/services/promotions/apply-promotions';
import { linkPromotions, toCandidate } from '../src/services/promotions/link-promotions';
import type { ExternalPromotion, PromotionCandidate } from '../src/services/promotions/types';
import { loadRealChains, type RealChainId } from '../tests/support/real-data-store';
import { loadSnapshotFromDisk, retailerIdIndex } from '../tests/support/promotion-snapshot';
import { loadCrosswalks } from '../tests/support/identity-crosswalk';
import { identityCoverage } from '../src/services/promotions/load-snapshot';
import { weekScenarios, type WeekScenario } from '../tests/support/week-scenarios';
import { EVEN_MIX, modelPromotions } from '../tests/support/modelled-promotions';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  args.indexOf(name) !== -1 ? args[args.indexOf(name) + 1] : undefined;

const weekCount = Number(flag('--weeks') ?? 50);
const rates = args.includes('--sweep')
  ? [0.05, 0.1, 0.15, 0.2, 0.3, 0.4]
  : [Number(flag('--rate') ?? 0.15)];
const euro = (c: number): string => `€ ${(c / 100).toFixed(2)}`;

/*
 * A real snapshot takes over automatically.
 *
 * Present: every number below is a measurement, and the modelled path is not
 * used at all. Absent: the run falls back to the model and says so on every
 * screen. There is no flag for this, on purpose — a switch is something you can
 * forget to set, and reporting modelled numbers as real is the one mistake this
 * phase must not make.
 */
const snapshot = loadSnapshotFromDisk();
const REAL = snapshot.status === 'LOADED';
const realPromotions = snapshot.status === 'LOADED' ? snapshot.promotions : [];

const fixture = loadRealChains(['ah', 'jumbo']);
const ah = fixture.chains.find((c) => c.chainId === 'ah')!;
const jumbo = fixture.chains.find((c) => c.chainId === 'jumbo')!;
const retailerIdByProduct = retailerIdIndex(fixture.chains);

/*
 * The identity crosswalk, if there is one.
 *
 * It moves links from the retailer-id tier to the stable-id tier, which is
 * where they belong: an article number can be reissued and a base id is what
 * the source calls permanent. It does not, on this data, create any link that
 * was not already there — both sides carry the complete article number for
 * 100 % of records. See IDENTITY_BRIDGE.md.
 */
const identity = REAL ? loadCrosswalks(fixture.chains) : undefined;

/**
 * The days a real snapshot can actually say something about.
 *
 * The fifty scenarios are spread over three months so that seasonal and weekday
 * rules see variety. A real promotion folder covers one week. Left alone, that
 * means forty-eight of the fifty weeks fall outside every window and the
 * comparison measures the calendar instead of the promotions.
 *
 * So with a real snapshot the shopping dates are moved inside the window that
 * the snapshot covers. Everything else about a scenario — the household, the
 * catalogue slice, the convenience preference — is a function of the run number
 * and is untouched, and the ON and OFF runs of a week share the same date. The
 * comparison stays like for like; only the calendar is made relevant.
 */
function coveredDates(promotions: readonly ExternalPromotion[]): {
  days: string[];
  perDay: Map<string, number>;
  dropped: string[];
} {
  const perDay = new Map<string, number>();
  for (const promotion of promotions) {
    if (!promotion.validFrom || !promotion.validUntil) continue;
    const cursor = new Date(`${promotion.validFrom}T00:00:00Z`);
    const end = new Date(`${promotion.validUntil}T00:00:00Z`);
    // A folder longer than a month is a data problem, not a range to walk.
    for (let guard = 0; cursor <= end && guard < 60; guard += 1) {
      const day = cursor.toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  /*
   * Only the days the folder actually covers.
   *
   * The real snapshot runs from 9 September to 6 October, but that range is not
   * one folder: 4.400 offers are in force in the middle week and about seventy
   * in the last, which are the tail of a handful of long-running offers. Ask
   * the planner to shop on 3 October and it is not measuring a quiet week, it
   * is measuring a folder that has expired.
   *
   * A snapshot is one folder period, so the days kept are the ones carrying at
   * least a quarter of the peak day's offers. The threshold is stated rather
   * than tuned, the dropped days are printed, and both numbers appear in the
   * report — picking the single best day would flatter the result exactly as
   * much as including a month of tail would flatten it.
   */
  const peak = Math.max(0, ...perDay.values());
  const days = [...perDay.keys()].filter((day) => (perDay.get(day) ?? 0) >= peak * 0.25).sort();
  const dropped = [...perDay.keys()].filter((day) => !days.includes(day)).sort();
  return { days, perDay, dropped };
}

const coverage = REAL
  ? coveredDates(realPromotions)
  : { days: [], perDay: new Map<string, number>(), dropped: [] };
const snapshotDays = coverage.days;

interface Setup {
  readonly key: 'AH' | 'JUMBO' | 'BEIDE';
  readonly label: string;
  readonly chains: readonly RealChainId[];
  readonly maxStores: number;
}
const SETUPS: readonly Setup[] = [
  { key: 'AH', label: 'alleen Albert Heijn', chains: ['ah'], maxStores: 1 },
  { key: 'JUMBO', label: 'alleen Jumbo', chains: ['jumbo'], maxStores: 1 },
  { key: 'BEIDE', label: 'AH + Jumbo', chains: ['ah', 'jumbo'], maxStores: 2 },
];

/**
 * Normalised promotion candidates, computed once.
 *
 * `toCandidate` parses a package and a promotion text per record. With a real
 * snapshot that is 5.190 records, and the run asks for them six times a week
 * over fifty weeks — a million and a half parses to produce the same 5.190
 * answers. The modelled path still builds a fresh draw per week, so the cache
 * is keyed by the list it was handed rather than assuming there is only one.
 */
const candidateCache = new Map<readonly ExternalPromotion[], readonly PromotionCandidate[]>();
let candidateCacheHits = 0;
let candidateCacheMisses = 0;
let candidateMs = 0;
/** Time spent linking, applying and reducing: the promotion resolution cost. */
let resolutionMs = 0;

function candidatesFor(promotions: readonly ExternalPromotion[]): readonly PromotionCandidate[] {
  const hit = candidateCache.get(promotions);
  if (hit) {
    candidateCacheHits += 1;
    return hit;
  }
  const started = performance.now();
  const candidates = promotions.map(toCandidate);
  candidateMs += performance.now() - started;
  candidateCacheMisses += 1;
  candidateCache.set(promotions, candidates);
  return candidates;
}

function promotionsFor(
  scenario: WeekScenario,
  weekIndex: number,
  rate: number,
): readonly ExternalPromotion[] {
  // With a real snapshot the same promotions apply to every week; which of them
  // are in force is decided per week by the shopping date, not here.
  if (REAL) return realPromotions;

  // A different draw per week, so fifty weeks are fifty promotion folders and
  // not the same one fifty times. A week-long folder, the way Dutch chains actually run them, so the
  // validity filter is exercised on a realistic window rather than a single day.
  const end = new Date(`${scenario.startDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const window = { validFrom: scenario.startDate, validUntil: end.toISOString().slice(0, 10) };
  return [
    ...modelPromotions(ah.reducedOffers, {
      rate,
      mix: EVEN_MIX,
      seed: 1000 + weekIndex,
      ...window,
    }),
    ...modelPromotions(jumbo.reducedOffers, {
      rate,
      mix: EVEN_MIX,
      // A different seed per chain: if both chains promoted exactly the same
      // products, a second shop could never help, and the comparison would be
      // measuring the seed rather than the shops.
      seed: 7000 + weekIndex,
      ...window,
    }),
  ];
}

/** Offers for one setup, with promotions attached or deliberately not. */
function storesFor(
  setup: Setup,
  scenario: WeekScenario,
  promotions: readonly ExternalPromotion[],
  enabled: boolean,
): { stores: StoreCandidate[]; applied: number } {
  let applied = 0;
  const stores = setup.chains.map((chainId) => {
    const chain = fixture.chains.find((c) => c.chainId === chainId)!;
    if (!enabled) return chain.store;

    /*
     * Promotions are attached to every matched offer, and only then is the
     * candidate set reduced.
     *
     * The order matters and the real snapshot proved it. `reduceCandidates`
     * already refuses to drop a promoted product — its price depends on how
     * many you buy, so no single comparison can rule it out — but that guard is
     * useless if reduction runs first, because nothing is promoted yet. Linking
     * against the reduced set instead lost 26 of the 57 promotions that reach
     * our catalogue at all: 46 %, all of them silently.
     *
     * The OFF baseline is untouched by this. With no promotions to attach,
     * reducing the same offers gives exactly the set `chain.store` already
     * carries, so the two runs still differ in one thing only.
     */
    const started = performance.now();
    const linked = linkPromotions({
      chainId,
      candidates: candidatesFor(promotions),
      offers: chain.allOffers,
      retailerIdByProduct,
      ...(identity
        ? {
            stableIdByProduct: identity.stableIdByProduct,
            gtinByProduct: identity.gtinByProduct,
          }
        : {}),
    }).linked;
    const resolved = applyPromotions(chain.allOffers, linked, {
      shoppingDate: scenario.startDate,
    });
    const store = { ...chain.store, offers: reduceCandidates(resolved.offers).kept };
    resolutionMs += performance.now() - started;
    applied += resolved.applied;
    return store;
  });
  return { stores, applied };
}

interface Outcome {
  readonly grocery: number;
  readonly practical: number;
  readonly chains: string;
  readonly menu: string;
  readonly missing: number;
  readonly promotionSavings: number;
  readonly linesOnPromotion: number;
  readonly lines: number;
  readonly ms: number;
}

/** The scenario, with its date moved into the snapshot's window when there is one. */
function dated(scenario: WeekScenario, index: number): WeekScenario {
  if (!REAL || snapshotDays.length === 0) return scenario;
  const startDate = snapshotDays[index % snapshotDays.length]!;
  return { ...scenario, startDate, today: new Date(`${startDate}T09:00:00Z`) };
}

function plan(setup: Setup, scenario: WeekScenario, stores: StoreCandidate[]): Outcome | undefined {
  const input: OptimizerInput = {
    household: scenario.household,
    recipes: scenario.recipes(fixture.recipes),
    ingredients: fixture.ingredientIndex,
    stores,
    maxStores: setup.maxStores,
    conveniencePreference: scenario.conveniencePreference,
    budget: {},
    startDate: scenario.startDate,
    today: scenario.today,
  };
  const started = performance.now();
  const result = optimiseWeek(input);
  const ms = performance.now() - started;
  if (result.status !== 'OK') return undefined;

  const option = result.plan.recommendedOption;
  const lines = option.assignments.flatMap((a) => a.packaging.lines);
  let saved = 0;
  let onPromotion = 0;
  for (const line of lines) {
    const amount = promotionSavings(line.offer, line.units);
    if (amount > 0) {
      saved += amount;
      onPromotion += 1;
    }
  }
  return {
    grocery: option.groceryCents,
    practical: option.practicalTotalCents,
    chains: option.chainIds.join('+'),
    menu: result.plan.days.map((d) => d.recipe.id).join('|'),
    missing: option.unavailable.length,
    promotionSavings: saved,
    linesOnPromotion: onPromotion,
    lines: lines.length,
    ms,
  };
}

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
const quantile = (xs: number[], q: number): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
};

if (snapshot.status === 'ABSENT') console.log(`\n  ${snapshot.message}`);

console.log(
  REAL
    ? `\nREAL SNAPSHOT RESULTS — promoties AAN vs UIT\n` +
        `  bron ${snapshot.status === 'LOADED' ? snapshot.source : ''}, ` +
        `${realPromotions.length} aanbiedingen uit ${snapshot.status === 'LOADED' ? snapshot.sourceFile : ''}\n`
    : '\nSYNTHETIC PROMOTION SENSITIVITY TEST — geen echte promoties\n' +
        '  PrijsProfeet is vanuit deze omgeving niet bereikbaar (zie PRIJSPROFEET_INTEGRATION.md).\n' +
        '  Dit is een TECHNISCHE gevoeligheidstest, geen productmeting. Hij bewijst dat de\n' +
        '  promotie-engine werkt, dat de optimizer op promoties reageert, en dat menu- en\n' +
        '  winkelkeuze kunnen veranderen. Hij zegt NIETS over wat echte promoties opleveren.\n' +
        '  REAL PROMOTION VALUE: NOT YET MEASURED.\n',
);

if (REAL) {
  console.log(
    `  De momentopname dekt ${snapshotDays.length} folderdag(en): ` +
      `${snapshotDays[0] ?? '—'} t/m ${snapshotDays.at(-1) ?? '—'} ` +
      `(${Math.max(0, ...coverage.perDay.values())} aanbiedingen op de drukste dag).\n` +
      (coverage.dropped.length > 0
        ? `  ${coverage.dropped.length} dagen buiten de folder overgeslagen ` +
          `(${coverage.dropped[0]} t/m ${coverage.dropped.at(-1)}, ` +
          `${Math.min(...coverage.dropped.map((d) => coverage.perDay.get(d) ?? 0))}–` +
          `${Math.max(...coverage.dropped.map((d) => coverage.perDay.get(d) ?? 0))} aanbiedingen per dag):\n` +
          '  dat is de staart van een handvol langlopende acties, geen folder.\n'
        : '') +
      '  De winkeldata van de scenario\u2019s liggen binnen dat venster; huishoudens en\n' +
      '  receptkeuzes blijven exact dezelfde als in de no-promotions baseline.\n',
  );
  if (identity) {
    const links = identity.crosswalks.reduce((n, c) => n + c.links.length, 0);
    console.log(
      `  Identity crosswalk: ${links} producten verrijkt uit ${identity.sources.join(' + ')}\n` +
        `    ${identity.stableIdByProduct.size} met base_product_id, ${identity.gtinByProduct.size} met EAN\n`,
    );
  }
  console.log('  Wat de momentopname draagt\n');
  for (const row of identityCoverage(realPromotions)) {
    console.log(
      `    ${row.retailer.padEnd(8)} ${String(row.records).padStart(5)} records, ` +
        `stable ${row.withStableId}, retailer ${row.withRetailerId}, GTIN ${row.withGtin}`,
    );
  }
  console.log('');
}

for (const rate of rates) {
  const savings: Record<string, number[]> = { AH: [], JUMBO: [], BEIDE: [] };
  const practicalOff: Record<string, number[]> = { AH: [], JUMBO: [], BEIDE: [] };
  const practicalOn: Record<string, number[]> = { AH: [], JUMBO: [], BEIDE: [] };
  const missingOn: Record<string, number[]> = { AH: [], JUMBO: [], BEIDE: [] };
  const winsOff: Record<string, number> = {};
  const winsOn: Record<string, number> = {};
  const multiStoreOff: number[] = [];
  const multiStoreOn: number[] = [];
  const grossOff: number[] = [];
  const grossOn: number[] = [];
  const menuChanges = { same: 0, one: 0, more: 0 };
  const promotionCounts: number[] = [];
  const lineCounts: number[] = [];
  const promotionShare: number[] = [];
  const perChainSavings: Record<string, number> = { ah: 0, jumbo: 0 };
  const latencyOn: number[] = [];
  const latencyOff: number[] = [];
  let measured = 0;

  for (const [weekIndex, raw] of weekScenarios(weekCount).entries()) {
    const scenario = dated(raw, weekIndex);
    const promotions = promotionsFor(scenario, weekIndex, rate);
    const off = new Map<string, Outcome>();
    const on = new Map<string, Outcome>();
    let complete = true;

    for (const setup of SETUPS) {
      const plain = storesFor(setup, scenario, promotions, false);
      const promoted = storesFor(setup, scenario, promotions, true);
      const a = plan(setup, scenario, plain.stores);
      const b = plan(setup, scenario, promoted.stores);
      if (!a || !b) {
        complete = false;
        break;
      }
      off.set(setup.key, a);
      on.set(setup.key, b);
      latencyOff.push(a.ms);
      latencyOn.push(b.ms);
    }
    if (!complete) continue;
    measured += 1;

    for (const setup of SETUPS) {
      const a = off.get(setup.key)!;
      const b = on.get(setup.key)!;
      savings[setup.key]!.push(b.promotionSavings);
      practicalOff[setup.key]!.push(a.practical);
      practicalOn[setup.key]!.push(b.practical);
      missingOn[setup.key]!.push(b.missing);
    }

    const bestOff = [...off.entries()].sort((x, y) => x[1].practical - y[1].practical)[0]!;
    const bestOn = [...on.entries()].sort((x, y) => x[1].practical - y[1].practical)[0]!;
    winsOff[bestOff[1].chains] = (winsOff[bestOff[1].chains] ?? 0) + 1;
    winsOn[bestOn[1].chains] = (winsOn[bestOn[1].chains] ?? 0) + 1;

    // The product question: what does a second shop save, with and without.
    multiStoreOff.push(off.get('AH')!.practical - off.get('BEIDE')!.practical);
    multiStoreOn.push(on.get('AH')!.practical - on.get('BEIDE')!.practical);
    // Gross is the shopping bill alone; practical adds the trip and the cost of
    // a second stop. Reported apart because the second shop is the one place
    // where the two answer differently, and only one of them is what you pay.
    grossOff.push(off.get('AH')!.grocery - off.get('BEIDE')!.grocery);
    grossOn.push(on.get('AH')!.grocery - on.get('BEIDE')!.grocery);

    const before = off.get('BEIDE')!.menu.split('|');
    const after = on.get('BEIDE')!.menu.split('|');
    const changed = before.filter((id) => !after.includes(id)).length;
    if (changed === 0) menuChanges.same += 1;
    else if (changed === 1) menuChanges.one += 1;
    else menuChanges.more += 1;

    const both = on.get('BEIDE')!;
    promotionCounts.push(both.linesOnPromotion);
    lineCounts.push(both.lines);
    promotionShare.push(both.lines === 0 ? 0 : both.linesOnPromotion / both.lines);
    for (const chainId of ['ah', 'jumbo'] as const) {
      const single = on.get(chainId === 'ah' ? 'AH' : 'JUMBO')!;
      perChainSavings[chainId]! += single.promotionSavings;
    }
  }

  console.log(
    `\n${'='.repeat(78)}\n  ${REAL ? 'Echte promoties' : `Gemodelleerd, ${(rate * 100).toFixed(0)}% van het assortiment in de aanbieding`}` +
      `  —  ${measured} weken\n`,
  );

  console.log('  Gemiddelde week, praktische kosten\n');
  const header =
    '    ' +
    'opstelling'.padEnd(24) +
    'zonder'.padStart(11) +
    'met'.padStart(11) +
    'verschil'.padStart(11) +
    'mist'.padStart(8);
  console.log(header);
  console.log('    ' + '-'.repeat(header.length - 4));
  for (const setup of SETUPS) {
    const a = mean(practicalOff[setup.key]!);
    const b = mean(practicalOn[setup.key]!);
    console.log(
      '    ' +
        setup.label.padEnd(24) +
        euro(a).padStart(11) +
        euro(b).padStart(11) +
        euro(a - b).padStart(11) +
        mean(missingOn[setup.key]!).toFixed(1).padStart(8),
    );
  }
  // Two shops routinely cost more and miss less. Without that last column the
  // difference reads as a loss instead of as the trade it is.

  console.log('\n  Wat twee winkels opleveren tegenover alleen Albert Heijn\n');
  const savingHeader =
    '    ' +
    ''.padEnd(24) +
    'gem.'.padStart(10) +
    'mediaan'.padStart(10) +
    'p75'.padStart(9) +
    'p90'.padStart(9) +
    'max'.padStart(9);
  console.log(savingHeader);
  console.log('    ' + '-'.repeat(savingHeader.length - 4));
  for (const [label, values] of [
    ['bruto, zonder promoties', grossOff],
    ['bruto, met promoties', grossOn],
    ['praktisch, zonder promoties', multiStoreOff],
    ['praktisch, met promoties', multiStoreOn],
  ] as const) {
    console.log(
      '    ' +
        label.padEnd(24) +
        euro(mean(values)).padStart(10) +
        euro(quantile(values, 0.5)).padStart(10) +
        euro(quantile(values, 0.75)).padStart(9) +
        euro(quantile(values, 0.9)).padStart(9) +
        euro(Math.max(0, ...values)).padStart(9),
    );
  }

  console.log('\n  Hoeveel weken halen welke praktische besparing met twee winkels\n');
  for (const threshold of [100, 250, 500, 750, 1000]) {
    const withoutPromotions = multiStoreOff.filter((v) => v >= threshold).length;
    const withPromotions = multiStoreOn.filter((v) => v >= threshold).length;
    console.log(
      `    ≥ ${euro(threshold).padEnd(8)} zonder ${String(withoutPromotions).padStart(3)}/${measured}` +
        `   met ${String(withPromotions).padStart(3)}/${measured}`,
    );
  }

  console.log('\n  Waar de week gekocht wordt\n');
  const chainKeys = [...new Set([...Object.keys(winsOff), ...Object.keys(winsOn)])].sort();
  console.log('    ' + 'winkels'.padEnd(14) + 'zonder'.padStart(9) + 'met'.padStart(7));
  for (const key of chainKeys) {
    console.log(
      '    ' +
        key.padEnd(14) +
        String(winsOff[key] ?? 0).padStart(9) +
        String(winsOn[key] ?? 0).padStart(7),
    );
  }

  console.log('\n  Promotiegebruik, AH + Jumbo\n');
  console.log(`    toegepaste promoties per week      ${mean(promotionCounts).toFixed(1)}`);
  console.log(`    aandeel gekochte regels in actie   ${(mean(promotionShare) * 100).toFixed(1)}%`);
  console.log(
    `    weken met minstens één promotie    ${promotionCounts.filter((n) => n > 0).length}/${measured}`,
  );
  console.log(`    promotievoordeel per week          ${euro(mean(savings.BEIDE!))}`);
  console.log(
    `    waarvan bij AH alleen              ${euro(perChainSavings.ah! / Math.max(1, measured))}`,
  );
  console.log(
    `    waarvan bij Jumbo alleen           ${euro(perChainSavings.jumbo! / Math.max(1, measured))}`,
  );

  console.log('\n  Promotievoordeel per week, verdeling\n');
  const distHeader =
    '    ' +
    'opstelling'.padEnd(24) +
    'gem.'.padStart(10) +
    'mediaan'.padStart(10) +
    'p75'.padStart(9) +
    'p90'.padStart(9) +
    'max'.padStart(9);
  console.log(distHeader);
  console.log('    ' + '-'.repeat(distHeader.length - 4));
  for (const setup of SETUPS) {
    const values = savings[setup.key]!;
    console.log(
      '    ' +
        setup.label.padEnd(24) +
        euro(mean(values)).padStart(10) +
        euro(quantile(values, 0.5)).padStart(10) +
        euro(quantile(values, 0.75)).padStart(9) +
        euro(quantile(values, 0.9)).padStart(9) +
        euro(Math.max(0, ...values)).padStart(9),
    );
  }

  console.log('\n  Verandert het menu door promoties?\n');
  console.log(`    zelfde menu           ${menuChanges.same}/${measured}`);
  console.log(`    1 gerecht anders      ${menuChanges.one}/${measured}`);
  console.log(`    2 of meer anders      ${menuChanges.more}/${measured}`);

  console.log('\n  Latency, per weekplanning\n');
  for (const [label, values] of [
    ['zonder promoties', latencyOff],
    ['met promoties', latencyOn],
  ] as const) {
    console.log(
      `    ${label.padEnd(20)} gem. ${mean(values).toFixed(0).padStart(4)} ms` +
        `   mediaan ${quantile(values, 0.5).toFixed(0).padStart(4)} ms` +
        `   p95 ${quantile(values, 0.95).toFixed(0).padStart(4)} ms` +
        `   slechtste ${Math.max(0, ...values)
          .toFixed(0)
          .padStart(5)} ms`,
    );
  }

  const resolutions = candidateCacheHits + candidateCacheMisses;
  console.log('\n  Promotieresolutie, buiten de optimizer om\n');
  console.log(
    `    normaliseren (toCandidate)         ${candidateMs.toFixed(0)} ms totaal, ` +
      `${candidateCacheMisses}x berekend`,
  );
  console.log(
    `    cache hit rate                     ` +
      `${resolutions === 0 ? '—' : `${((candidateCacheHits / resolutions) * 100).toFixed(1)}%`} ` +
      `(${candidateCacheHits}/${resolutions})`,
  );
  console.log(
    `    koppelen + toepassen + reduceren   ${resolutionMs.toFixed(0)} ms totaal, ` +
      `${(resolutionMs / Math.max(1, measured)).toFixed(1)} ms per week`,
  );
  console.log(
    `    verpakkingsregels per week         ${mean(lineCounts).toFixed(1)} ` +
      `(waarvan ${mean(promotionCounts).toFixed(1)} in de aanbieding)`,
  );
}

if (!REAL) {
  console.log(
    '\n  SYNTHETIC PROMOTION SENSITIVITY TEST — nogmaals, expliciet.\n' +
      '  Bovenstaande promoties zijn gemodelleerd. Ze mogen niet gebruikt worden om te\n' +
      '  concluderen hoeveel echte promoties financieel opleveren.\n' +
      '  REAL PROMOTION VALUE: NOT YET MEASURED.\n\n' +
      '  Zet een export in data/external/promotions-snapshot.json (contract:\n' +
      '  PRIJSPROFEET_SNAPSHOT_SCHEMA.md) en dit script draait automatisch de echte\n' +
      '  benchmark, met dezelfde 50 scenario\u2019s.\n',
  );
}
