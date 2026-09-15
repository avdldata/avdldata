/**
 * Import a PrijsProfeet shelf snapshot and build the identity crosswalk.
 *
 *   pnpm shelf:import data/external/shelf-snapshot.json
 *   pnpm shelf:import data/external/shelf-snapshot.json -- --no-save
 *   pnpm shelf:import -- --promotions-only     # crosswalk from what we have
 *
 * A shelf record is an ordinary product with a price, a barcode and a stable
 * key, published whether or not anything is on offer. That makes it the only
 * way to learn a product's identity *before* it turns up in a folder — and it
 * is the entire reason to fetch one.
 *
 * What this command does **not** do, ever: turn a shelf record into a discount.
 * Shelf records arrive as `ExternalShelfPrice`, a type nothing downstream of
 * the promotion engine accepts, and the crosswalk built here carries identities
 * and nothing else. There is no code path from this file to a lower price.
 *
 * The seven steps:
 *
 *   1. validate the raw snapshot against the schema
 *   2. select AH and Jumbo, count the rest
 *   3. recognise which records are shelf records
 *   4. normalise the identities
 *   5. build the crosswalk
 *   6. report enrichment, before and after
 *   7. write the crosswalk to disk
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildCrosswalk, eanIndex, stableIdIndex } from '../src/services/identity/crosswalk';
import {
  identitySourceBreakdown,
  toIdentityRecords,
} from '../src/services/identity/prijsprofeet-identities';
import { linkPromotions, toCandidate } from '../src/services/promotions/link-promotions';
import { loadPrijsProfeetSnapshot } from '../src/services/promotions/load-snapshot';
import {
  validateSnapshot,
  type PrijsProfeetRecord,
} from '../src/services/promotions/snapshot-schema';
import { retailerIdIndex } from '../tests/support/promotion-snapshot';
import { loadRealChains } from '../tests/support/real-data-store';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const noSave = argv.includes('--no-save');
const promotionsOnly = argv.includes('--promotions-only');
const inputPath = argv.find((a) => !a.startsWith('--')) ?? 'data/external/shelf-snapshot.json';

const PROMO_PATH = 'data/external/promotions-snapshot.json';
const CROSSWALK_PATH = 'data/external/identity-crosswalk.json';

const read = (path: string) => readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
const importedAt = new Date().toISOString();

/* ── 1–3. Validate, select, recognise ────────────────────────────────────── */

let shelfRecords: readonly PrijsProfeetRecord[] = [];
let shelfSource = '';
if (!promotionsOnly) {
  if (!existsSync(inputPath)) {
    console.error(`
  Geen schapmomentopname op ${inputPath}.

  Haal er een op met scripts/fetch-shelf-snapshot.ps1 (zie IDENTITY_BRIDGE.md),
  of draai met --promotions-only om de crosswalk te bouwen uit wat de
  promotiemomentopname al draagt.
`);
    process.exit(1);
  }
  const validated = validateSnapshot(JSON.parse(read(inputPath)), inputPath);
  shelfRecords = validated.records;
  shelfSource = validated.source;
}

const promoOutcome = loadPrijsProfeetSnapshot(PROMO_PATH, {
  readFile: (f) => readFileSync(f, 'utf8'),
  exists: existsSync,
});
const promoRecords =
  promoOutcome.status === 'LOADED'
    ? validateSnapshot(JSON.parse(read(PROMO_PATH)), PROMO_PATH).records
    : [];

console.log(`
IDENTITY BRIDGE — schapdata als identiteitsbron

  schapmomentopname   ${promotionsOnly ? '(overgeslagen: --promotions-only)' : `${shelfRecords.length} records uit ${inputPath}`}
  promotiemomentopname ${promoRecords.length} records uit ${PROMO_PATH}
  ingelezen           ${importedAt}
`);

if (shelfRecords.length > 0) {
  const kinds = identitySourceBreakdown(shelfRecords);
  console.log('  Wat de schapmomentopname bevatte\n');
  console.log(`    als schaprecord herkend      ${String(kinds.shelf).padStart(7)}`);
  console.log(`    toch een promotie            ${String(kinds.promotion).padStart(7)}`);
  console.log(`    onbruikbaar (o.a. historisch) ${String(kinds.unknown).padStart(6)}`);
  console.log(
    '\n    Een schaprecord wordt nooit een korting: het krijgt een ander type en\n' +
      '    geen enkele stroomafwaartse stap accepteert dat type.\n',
  );
}

/* ── 4. Normalise identities ─────────────────────────────────────────────── */

const shelfIdentities = toIdentityRecords(shelfRecords, { kinds: ['shelf'] });
const promoIdentities = toIdentityRecords(promoRecords, { kinds: ['promotion'] });
const records = [...shelfIdentities, ...promoIdentities];

console.log('  Identiteiten uit beide bronnen\n');
console.log(`    uit schaprecords     ${String(shelfIdentities.length).padStart(7)}`);
console.log(`    uit promotierecords  ${String(promoIdentities.length).padStart(7)}`);
console.log(`    samen                ${String(records.length).padStart(7)}\n`);

/* ── 5. Build the crosswalk ──────────────────────────────────────────────── */

const fixture = loadRealChains(['ah', 'jumbo']);
interface RawChain {
  readonly n: string;
  readonly u?: string;
  readonly d: readonly { readonly l: string }[];
}
const catalogue = JSON.parse(read('data/external/checkjebon-snapshot.json')) as RawChain[];
const urlByProduct = new Map<string, string>();
for (const chain of catalogue) {
  if (chain.n !== 'ah' && chain.n !== 'jumbo') continue;
  for (const product of chain.d) {
    urlByProduct.set(`${chain.n}:${product.l}`, `${chain.u ?? ''}${product.l}`);
  }
}

const sourceFile = promotionsOnly ? PROMO_PATH : `${inputPath} + ${PROMO_PATH}`;
const crosswalks = fixture.chains.map((chain) =>
  buildCrosswalk({
    chainId: chain.chainId,
    offers: chain.allOffers,
    urlByProduct,
    records,
    source: shelfSource || 'PRIJSPROFEET',
    sourceFile,
    importedAt,
  }),
);

console.log('  Crosswalk\n');
const head =
  '    ' +
  'keten'.padEnd(8) +
  'producten'.padStart(11) +
  'records'.padStart(9) +
  'art.id'.padStart(8) +
  'url'.padStart(7) +
  'EAN'.padStart(7) +
  'naam+maat'.padStart(11) +
  'review'.padStart(8) +
  'ambigu'.padStart(8) +
  'conflict'.padStart(9);
console.log(head);
console.log('    ' + '-'.repeat(head.length - 4));
for (const cw of crosswalks) {
  const m = cw.metrics;
  console.log(
    '    ' +
      cw.retailer.padEnd(8) +
      String(m.catalogueProducts).padStart(11) +
      String(m.externalRecords).padStart(9) +
      String(m.byMethod.RETAILER_ARTICLE_ID).padStart(8) +
      String(m.byMethod.RETAILER_URL).padStart(7) +
      String(m.byMethod.EAN).padStart(7) +
      String(m.byMethod.NAME_PACKAGE).padStart(11) +
      String(m.byMethod.NEEDS_REVIEW).padStart(8) +
      String(m.ambiguous).padStart(8) +
      String(m.conflicting).padStart(9),
  );
}
console.log(
  '\n    Alleen sterke koppelingen worden automatisch toegepast. Ambigu en\n' +
    '    conflicterend worden geweigerd, niet opgelost: een verkeerde EAN in de\n' +
    '    crosswalk stuurt vanaf dat moment elke promotie die hem noemt verkeerd.\n',
);

/* ── 6. Enrichment, before and after ─────────────────────────────────────── */

const stableIds = stableIdIndex(crosswalks);
const eans = eanIndex(crosswalks);
const retailerIdByProduct = retailerIdIndex(fixture.chains);
const candidates =
  promoRecords.length > 0 && promoOutcome.status === 'LOADED'
    ? promoOutcome.promotions.map(toCandidate)
    : [];

const linkCount = (chainId: string, enriched: boolean): number => {
  const chain = fixture.chains.find((c) => c.chainId === chainId)!;
  return linkPromotions({
    chainId,
    candidates,
    offers: chain.allOffers,
    retailerIdByProduct,
    ...(enriched ? { stableIdByProduct: stableIds, gtinByProduct: eans } : {}),
  }).linked.length;
};

console.log('  Verrijking per keten\n');
const enrichHead =
  '    ' +
  'keten'.padEnd(8) +
  'producten'.padStart(11) +
  'EAN voor'.padStart(10) +
  'EAN na'.padStart(9) +
  'base voor'.padStart(11) +
  'base na'.padStart(9) +
  'links voor'.padStart(12) +
  'links na'.padStart(10);
console.log(enrichHead);
console.log('    ' + '-'.repeat(enrichHead.length - 4));
const summary: Record<string, unknown>[] = [];
for (const chain of fixture.chains) {
  const links = crosswalks.find((c) => c.retailer === chain.chainId)!.links;
  const eanAfter = links.filter((l) => l.ean).length;
  const baseAfter = links.filter((l) => l.prijsprofeetBaseProductId).length;
  const before = linkCount(chain.chainId, false);
  const after = linkCount(chain.chainId, true);
  const total = chain.allOffers.length;
  const pct = (n: number) => `${((n / Math.max(1, total)) * 100).toFixed(1)}%`;
  console.log(
    '    ' +
      chain.chainId.padEnd(8) +
      String(total).padStart(11) +
      '0'.padStart(10) +
      `${eanAfter}`.padStart(9) +
      '0'.padStart(11) +
      `${baseAfter}`.padStart(9) +
      String(before).padStart(12) +
      String(after).padStart(10),
  );
  console.log(
    '    ' +
      ''.padEnd(8) +
      ''.padStart(11) +
      '0,0%'.padStart(10) +
      pct(eanAfter).padStart(9) +
      '0,0%'.padStart(11) +
      pct(baseAfter).padStart(9),
  );
  summary.push({
    retailer: chain.chainId,
    catalogueProducts: total,
    eanBefore: 0,
    eanAfter,
    baseProductIdBefore: 0,
    baseProductIdAfter: baseAfter,
    promotionLinksBefore: before,
    promotionLinksAfter: after,
    metrics: crosswalks.find((c) => c.retailer === chain.chainId)!.metrics,
  });
}

const before = fixture.chains.reduce((n, c) => n + linkCount(c.chainId, false), 0);
const after = fixture.chains.reduce((n, c) => n + linkCount(c.chainId, true), 0);
console.log(`
    Promotiekoppelingen samen: ${before} zonder crosswalk, ${after} met.
`);
if (after === before) {
  console.log(
    '    Geen verschil, en dat is geen storing. Beide kanten dragen het\n' +
      '    winkelartikelnummer al voor 100 %, en dat nummer is binnen een keten\n' +
      '    uniek. Een EAN of base_product_id is daar een tweede naam voor; hij\n' +
      '    verplaatst de koppeling naar een stabielere tier, maar hij maakt geen\n' +
      '    koppeling die er nog niet was. Zie IDENTITY_BRIDGE.md.\n',
  );
}

/* ── 7. Store ────────────────────────────────────────────────────────────── */

if (noSave) {
  console.log('  --no-save: niets weggeschreven.\n');
} else {
  mkdirSync(dirname(resolve(CROSSWALK_PATH)), { recursive: true });
  writeFileSync(
    CROSSWALK_PATH,
    `${JSON.stringify(
      {
        source: shelfSource || 'PRIJSPROFEET',
        sourceFile,
        importedAt,
        summary,
        links: crosswalks.flatMap((c) => c.links),
        review: crosswalks.flatMap((c) => c.review),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`  Crosswalk in ${CROSSWALK_PATH}\n`);
}
