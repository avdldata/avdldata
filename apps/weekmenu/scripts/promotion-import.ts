/**
 * Import one PrijsProfeet snapshot, and say exactly what came in.
 *
 *   pnpm promo:import                                   # the canonical path
 *   pnpm promo:import data/external/whatever.json       # any export
 *   pnpm promo:import export.json -- --no-save          # report only
 *
 * The eight steps the brief asks for, in order:
 *
 *   1. validate against the schema
 *   2. select AH and Jumbo, count the rest
 *   3. normalise into our boundary types
 *   4. report identity coverage
 *   5. report promotion types
 *   6. link to our products
 *   7. store the snapshot at the canonical path
 *   8. draw no business conclusions
 *
 * Step 8 is the one worth spelling out. This command reports what the source
 * contains and how much of it we can use. It does not say whether promotions
 * are worth anything — that is `pnpm promo:bench` on a real snapshot, and until
 * one exists the answer stays "not measured". A number here is a count of
 * records, never a conclusion about money.
 *
 * Nothing touches the network.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { linkPromotions, toCandidate } from '../src/services/promotions/link-promotions';
import {
  DEFAULT_SNAPSHOT_PATH,
  identityCoverage,
  loadPrijsProfeetSnapshot,
  shelfCoverage,
} from '../src/services/promotions/load-snapshot';
import {
  comparePrices,
  eanIndexFromShelf,
  linkShelfPrices,
} from '../src/services/promotions/shelf-enrichment';
import { retailerIdIndex } from '../tests/support/promotion-snapshot';
import { loadRealChains } from '../tests/support/real-data-store';

/**
 * `pnpm promo:import x.json -- --date 2026-09-14` leaves a bare "--" in argv and
 * puts the flag's value right after it, so both have to be taken out before the
 * remaining word can be read as the path. Reading `argv[0]` blindly is how an
 * earlier script silently sampled nothing.
 */
const argv = process.argv.slice(2).filter((arg) => arg !== '--');
const FLAGS_WITH_VALUE = ['--date'];
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};
const consumed = new Set<number>();
for (const [index, arg] of argv.entries()) {
  if (arg.startsWith('--')) {
    consumed.add(index);
    if (FLAGS_WITH_VALUE.includes(arg)) consumed.add(index + 1);
  }
}
const positional = argv.filter((_, index) => !consumed.has(index));
const inputPath = positional[0] ?? DEFAULT_SNAPSHOT_PATH;
const noSave = argv.includes('--no-save');
const shoppingDate = flag('--date') ?? new Date().toISOString().slice(0, 10);

const REPORT_PATH = 'data/external/promotions-import-report.json';

/* ── 1. Validate ─────────────────────────────────────────────────────────── */

const outcome = loadPrijsProfeetSnapshot(inputPath, {
  readFile: (file) => readFileSync(file, 'utf8'),
  exists: (file) => existsSync(file),
});

if (outcome.status === 'ABSENT') {
  console.error(`
  Geen momentopname op ${inputPath}.

  De veldnamen in het schema zijn de geverifieerde officiële namen, dus een ruwe
  export uit de PrijsProfeet-API valideert zonder handmatige transformatie. Wat
  ontbreekt is de export zelf; PrijsProfeet is vanuit deze omgeving niet te
  bereiken (zie PRIJSPROFEET_INTEGRATION.md).

    pnpm promo:import <pad-naar-export.json>
`);
  process.exit(1);
}

const pct = (part: number, whole: number): string =>
  whole === 0 ? '   —' : `${((part / whole) * 100).toFixed(0).padStart(3)}%`;

console.log(`
PrijsProfeet-import — ${inputPath}
  bron ${outcome.source}${outcome.fetchedAt ? `, opgehaald ${outcome.fetchedAt}` : ''}
  ingelezen ${outcome.importedAt}
  peildatum voor actief/komend: ${shoppingDate}
`);

/* ── 2 & 3. Select, normalise, and say what each record was ──────────────── */

console.log('  Wat het bestand bevatte\n');
console.log(`    records                       ${String(outcome.total).padStart(7)}`);
console.log(`    dubbel (zelfde aanbod)        ${String(outcome.duplicatesDropped).padStart(7)}`);
for (const [use, count] of Object.entries(outcome.byUse)) {
  console.log(`    ${use.padEnd(30)}${String(count).padStart(7)}`);
}
const skipped = Object.entries(outcome.skippedRetailers);
if (skipped.length > 0) {
  console.log(
    '\n    ketens buiten deze fase: ' +
      skipped.map(([chain, count]) => `${chain} ${count}`).join(', '),
  );
  console.log(
    '    (een keten die we wél dekken maar hier verschijnt, is een spelling die\n' +
      '     RETAILER_ALIASES nog niet kent — één regel in prijsprofeet-adapter.ts)',
  );
}
console.log(
  `\n    → ${outcome.promotions.length} promoties, ${outcome.shelfPrices.length} schapprijzen\n` +
    '      historische records worden geteld en verder niet gebruikt; een promotie\n' +
    '      zonder venster is niet te dateren en wordt daarom niet toegepast.\n',
);

/* ── 4. Identity coverage ────────────────────────────────────────────────── */

console.log('  Identiteitsdekking — promoties\n');
const head =
  '    ' +
  'keten'.padEnd(8) +
  'records'.padStart(9) +
  'base_id'.padStart(9) +
  'winkel-id'.padStart(11) +
  'EAN'.padStart(7) +
  'product_id'.padStart(12) +
  'pakket'.padStart(8) +
  'normprijs'.padStart(11) +
  'tekst'.padStart(7) +
  'typecode'.padStart(10);
console.log(head);
console.log('    ' + '-'.repeat(head.length - 4));
const coverage = identityCoverage(outcome.promotions, shoppingDate);
for (const row of coverage) {
  console.log(
    '    ' +
      row.retailer.padEnd(8) +
      String(row.records).padStart(9) +
      pct(row.withStableId, row.records).padStart(9) +
      pct(row.withRetailerId, row.records).padStart(11) +
      pct(row.withGtin, row.records).padStart(7) +
      pct(row.withProductId, row.records).padStart(12) +
      pct(row.withPackage, row.records).padStart(8) +
      pct(row.withRegularPrice, row.records).padStart(11) +
      pct(row.withPromotionText, row.records).padStart(7) +
      pct(row.withTypeCode, row.records).padStart(10),
  );
}

console.log('\n  Geldigheid op de peildatum (uit het venster, niet uit is_current_deal)\n');
for (const row of coverage) {
  console.log(
    `    ${row.retailer.padEnd(8)} actief ${String(row.active).padStart(6)}` +
      `   komend ${String(row.upcoming).padStart(6)}` +
      `   verlopen ${String(row.expired).padStart(6)}`,
  );
}

const shelfRows = shelfCoverage(outcome.shelfPrices);
if (shelfRows.length > 0) {
  console.log('\n  Identiteitsdekking — schapprijzen\n');
  for (const row of shelfRows) {
    console.log(
      `    ${row.retailer.padEnd(8)} ${String(row.records).padStart(7)} records` +
        `   base_id ${pct(row.withStableId, row.records)}` +
        `   winkel-id ${pct(row.withRetailerId, row.records)}` +
        `   EAN ${pct(row.withEan, row.records)}` +
        `   prijs ${pct(row.withPrice, row.records)}`,
    );
  }
}

/* ── 5. Promotion types ──────────────────────────────────────────────────── */

console.log('\n  Promotietypen\n');
const candidates = outcome.promotions.map(toCandidate);
for (const chainId of coverage.map((c) => c.retailer)) {
  const rows = candidates.filter((c) => c.chainId === chainId);
  const byType = new Map<string, number>();
  for (const candidate of rows) {
    const key = candidate.params?.type ?? `NIET: ${candidate.unsupportedReason}`;
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  console.log(
    `    ${chainId.toUpperCase()} — ${rows.filter((c) => c.params).length}/${rows.length} leesbaar`,
  );
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${type.padEnd(30)} ${count}`);
  }
}
console.log(
  '\n    Alles wat niet met zekerheid te structureren is blijft UNSUPPORTED_PROMOTION:\n' +
    '    bewaard met tekst en herkomst, maar niet meegerekend. Fail closed.',
);

/* ── 6. Link to our products ─────────────────────────────────────────────── */

const fixture = loadRealChains(['ah', 'jumbo']);
const retailerIdByProduct = retailerIdIndex(fixture.chains);

// Shelf records are used here for exactly one thing: they carry the EAN that
// Checkjebon lacks, which is what makes the GTIN tier reachable at all. They
// never become a promotion.
const allOffers = fixture.chains.flatMap((chain) => [...chain.reducedOffers]);
const shelfLinks = linkShelfPrices(outcome.shelfPrices, allOffers, retailerIdByProduct);
const gtinByProduct = eanIndexFromShelf(shelfLinks);

console.log('\n  Koppeling aan onze producten\n');
const linkHead =
  '    ' +
  'keten'.padEnd(8) +
  'aangeboden'.padStart(11) +
  'base_id'.padStart(9) +
  'winkel-id'.padStart(11) +
  'EAN'.padStart(7) +
  'naam+maat'.padStart(11) +
  'review'.padStart(8) +
  'niet'.padStart(7);
console.log(linkHead);
console.log('    ' + '-'.repeat(linkHead.length - 4));

const linkSummary: Record<string, unknown>[] = [];
for (const chain of fixture.chains) {
  const result = linkPromotions({
    chainId: chain.chainId,
    candidates,
    offers: chain.reducedOffers,
    retailerIdByProduct,
    gtinByProduct,
  });
  const t = result.metrics.byTier;
  console.log(
    '    ' +
      chain.chainId.padEnd(8) +
      String(result.metrics.fetched).padStart(11) +
      String(t.EXACT_STABLE_ID).padStart(9) +
      String(t.EXACT_RETAILER_ID).padStart(11) +
      String(t.EXACT_GTIN).padStart(7) +
      String(t.NAME_PACKAGE).padStart(11) +
      String(t.NEEDS_REVIEW).padStart(8) +
      String(result.metrics.rejected.NO_CANDIDATE_PRODUCT).padStart(7),
  );
  linkSummary.push({ ...result.metrics });
}

if (shelfLinks.length > 0) {
  console.log('\n  Schapprijs tegenover onze catalogusprijs\n');
  for (const row of comparePrices(shelfLinks)) {
    console.log(
      `    ${row.chainId.padEnd(8)} ${String(row.compared).padStart(6)} vergeleken` +
        `   gelijk ${pct(row.identical, row.compared)}` +
        `   ≤1 cent ${pct(row.withinOneCent, row.compared)}` +
        `   >5% verschil ${String(row.differsOverFivePercent).padStart(5)}` +
        `   mediaan ${row.medianAbsDiffCents} ct`,
    );
  }
  console.log(
    '\n    Verschillen worden gerapporteerd, niet opgelost: welke van de twee\n' +
      '    bronnen gelijk heeft is hiervandaan niet te bepalen, en de prijs van de\n' +
      '    ander overnemen maakt ze het eens zonder een van beide juist te maken.',
  );
}

/* ── 7. Store the snapshot ───────────────────────────────────────────────── */

const canonical = resolve(DEFAULT_SNAPSHOT_PATH);
if (noSave) {
  console.log('\n  --no-save: niets weggeschreven.\n');
} else {
  if (resolve(inputPath) !== canonical) {
    mkdirSync(dirname(canonical), { recursive: true });
    copyFileSync(inputPath, canonical);
    console.log(`\n  Opgeslagen als ${DEFAULT_SNAPSHOT_PATH}`);
  } else {
    console.log(`\n  Al op de vaste plek (${DEFAULT_SNAPSHOT_PATH})`);
  }
  mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        sourceFile: inputPath,
        source: outcome.source,
        fetchedAt: outcome.fetchedAt ?? null,
        importedAt: outcome.importedAt,
        shoppingDate,
        total: outcome.total,
        duplicatesDropped: outcome.duplicatesDropped,
        byUse: outcome.byUse,
        skippedRetailers: outcome.skippedRetailers,
        promotions: outcome.promotions.length,
        shelfPrices: outcome.shelfPrices.length,
        identityCoverage: coverage,
        shelfCoverage: shelfRows,
        linking: linkSummary,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`  Rapport in ${REPORT_PATH}`);
}

/* ── 8. No business conclusions ──────────────────────────────────────────── */

console.log(`
  Wat hierboven staat zijn tellingen, geen conclusie.

  Of promoties de weekprijs meetbaar verlagen is een aparte meting:

    pnpm promo:bench     50 weken, ON tegenover OFF, op deze momentopname

  Zolang die niet op echte data gedraaid is blijft de stand in
  PROMOTION_VALUE_BENCHMARK.md: REAL PROMOTION VALUE — NOT YET MEASURED.
`);
