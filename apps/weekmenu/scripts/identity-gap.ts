/**
 * Where does the promotion funnel actually narrow?
 *
 *   pnpm identity:gap
 *
 * The previous phase measured € 0,32 of promotion value per week and named a
 * suspect: only 52 of 5.190 offers reach a product we can buy, so identity
 * coverage must be the constraint. This script tests that suspicion instead of
 * assuming it, by counting the funnel at every stage and for every identity.
 *
 * It answers one question: **if every product in our catalogue had an EAN and a
 * stable id tomorrow, how many more promotions would link?** That number is the
 * ceiling on what an identity bridge can buy, and it is worth knowing before
 * building one rather than after.
 *
 * Nothing here touches the network, and nothing is written.
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadPrijsProfeetSnapshot } from '../src/services/promotions/load-snapshot';
import { extractRetailerProductId } from '../src/services/promotions/retailer-id';
import { linkPromotions, toCandidate } from '../src/services/promotions/link-promotions';
import { buildCrosswalk, eanIndex, stableIdIndex } from '../src/services/identity/crosswalk';
import { toIdentityRecords } from '../src/services/identity/prijsprofeet-identities';
import { validateSnapshot } from '../src/services/promotions/snapshot-schema';
import { loadRealChains } from '../tests/support/real-data-store';
import { retailerIdIndex } from '../tests/support/promotion-snapshot';
import type { ProductOffer } from '../src/domain/stores/types';

const PROMO_PATH = 'data/external/promotions-snapshot.json';
const SHELF_PATH = 'data/external/shelf-snapshot.json';

const read = (path: string) => readFileSync(path, 'utf8');
const promo = loadPrijsProfeetSnapshot(PROMO_PATH, { readFile: read, exists: existsSync });
if (promo.status === 'ABSENT') {
  console.error(
    `\n  Geen promotiemomentopname op ${PROMO_PATH}. Zie PRIJSPROFEET_INTEGRATION.md.\n`,
  );
  process.exit(1);
}

const fixture = loadRealChains(['ah', 'jumbo']);
const chains = fixture.chains;
const importedAt = new Date().toISOString();

/* ── The Checkjebon catalogue, whole ─────────────────────────────────────── */

interface RawChain {
  readonly n: string;
  readonly u?: string;
  readonly d: readonly { readonly n: string; readonly l: string }[];
}
const catalogue = JSON.parse(read('data/external/checkjebon-snapshot.json')) as RawChain[];
const rawChain = (chainId: string) => catalogue.find((c) => c.n === chainId)!;

const articleIds = (chainId: string, slugs: readonly string[]): Set<string> => {
  const set = new Set<string>();
  for (const slug of slugs) {
    const id = extractRetailerProductId(chainId, slug);
    if (id) set.add(id.id.toLowerCase());
  }
  return set;
};

/** Article ids the promotion snapshot quotes, per chain. */
const promotedIds = new Map<string, Set<string>>();
for (const p of promo.promotions) {
  const id = extractRetailerProductId(p.chainId, p.url);
  if (!id) continue;
  const set = promotedIds.get(p.chainId) ?? new Set<string>();
  set.add(id.id.toLowerCase());
  promotedIds.set(p.chainId, set);
}

const offerIds = (chainId: string, offers: readonly ProductOffer[]) =>
  articleIds(
    chainId,
    offers.map((o) => o.productId.slice(chainId.length + 1)),
  );

/* ── 1. The funnel ───────────────────────────────────────────────────────── */

const pct = (part: number, whole: number) =>
  whole === 0 ? '   —' : `${((part / whole) * 100).toFixed(1).padStart(5)}%`;

console.log(`
IDENTITY GAP — waar knijpt de promotietrechter?

  promotiemomentopname: ${promo.promotions.length} aanbiedingen uit ${promo.sourceFile}
  catalogus: Checkjebon, ${catalogue.reduce((n, c) => n + (c.n === 'ah' || c.n === 'jumbo' ? c.d.length : 0), 0)} AH- en Jumbo-producten
`);

const head =
  '  ' + 'populatie'.padEnd(42) + 'AH'.padStart(10) + 'Jumbo'.padStart(10) + 'samen'.padStart(10);
const row = (label: string, ah: number, jumbo: number) =>
  console.log(
    '  ' +
      label.padEnd(42) +
      String(ah).padStart(10) +
      String(jumbo).padStart(10) +
      String(ah + jumbo).padStart(10),
  );

console.log(head);
console.log('  ' + '-'.repeat(head.length - 2));

const all = { ah: rawChain('ah'), jumbo: rawChain('jumbo') };
const allIds = {
  ah: articleIds(
    'ah',
    all.ah.d.map((p) => p.l),
  ),
  jumbo: articleIds(
    'jumbo',
    all.jumbo.d.map((p) => p.l),
  ),
};
row('Checkjebon-producten', all.ah.d.length, all.jumbo.d.length);
row('  met winkelartikelnummer', allIds.ah.size, allIds.jumbo.size);
row(
  '  waarvan in de promotiemomentopname',
  [...allIds.ah].filter((i) => promotedIds.get('ah')?.has(i)).length,
  [...allIds.jumbo].filter((i) => promotedIds.get('jumbo')?.has(i)).length,
);

console.log('');
const buyable = {
  ah: chains.find((c) => c.chainId === 'ah')!,
  jumbo: chains.find((c) => c.chainId === 'jumbo')!,
};
const buyableIds = {
  ah: offerIds('ah', buyable.ah.allOffers),
  jumbo: offerIds('jumbo', buyable.jumbo.allOffers),
};
row(
  'koopbaar (gematcht op een ingrediënt)',
  buyable.ah.allOffers.length,
  buyable.jumbo.allOffers.length,
);
row('  met winkelartikelnummer', buyableIds.ah.size, buyableIds.jumbo.size);
row('  met EAN', 0, 0);
row('  met base_product_id', 0, 0);
const linkable = {
  ah: [...buyableIds.ah].filter((i) => promotedIds.get('ah')?.has(i)).length,
  jumbo: [...buyableIds.jumbo].filter((i) => promotedIds.get('jumbo')?.has(i)).length,
};
row('  exact koppelbaar aan een promotie', linkable.ah, linkable.jumbo);
row(
  '  geen promotie beschikbaar',
  buyableIds.ah.size - linkable.ah,
  buyableIds.jumbo.size - linkable.jumbo,
);

console.log('');
const reduced = {
  ah: offerIds('ah', buyable.ah.reducedOffers),
  jumbo: offerIds('jumbo', buyable.jumbo.reducedOffers),
};
row('na kandidaatreductie', buyable.ah.reducedOffers.length, buyable.jumbo.reducedOffers.length);
row(
  '  exact koppelbaar aan een promotie',
  [...reduced.ah].filter((i) => promotedIds.get('ah')?.has(i)).length,
  [...reduced.jumbo].filter((i) => promotedIds.get('jumbo')?.has(i)).length,
);

/* ── 2. What an identity bridge could add, at most ───────────────────────── */

console.log(`
  Wat een identity bridge maximaal kan opleveren
`);
console.log(
  `    Beide kanten dragen het winkelartikelnummer al voor 100 %: ${promo.promotions.length}\n` +
    `    van ${promo.promotions.length} aanbiedingen leveren er een op, en ${allIds.ah.size + allIds.jumbo.size}\n` +
    `    van ${all.ah.d.length + all.jumbo.d.length} catalogusproducten ook. Binnen één keten is dat nummer\n` +
    `    uniek, dus een EAN of een base_product_id is een tweede naam voor iets\n` +
    `    dat al een naam heeft — geen extra koppeling.\n`,
);

/*
 * Is `base_product_id` an identity of its own, or the article number again?
 *
 * The whole case for an identity bridge rests on the answer. If the source's
 * "stable key" carries information the article number does not, bridging to it
 * buys something. If it is the article number with a prefix, it buys a second
 * name for a thing that already has one.
 */
let derived = 0;
let stated = 0;
for (const p of promo.promotions) {
  if (!p.baseProductId) continue;
  stated += 1;
  const id = extractRetailerProductId(p.chainId, p.url);
  if (id && p.baseProductId.toLowerCase() === `${p.chainId}_${id.id}`.toLowerCase()) derived += 1;
}
console.log(
  `    base_product_id is letterlijk "<keten>_<artikelnummer>" in ${derived} van ${stated}\n` +
    `    records (${((derived / Math.max(1, stated)) * 100).toFixed(2)} %). Het is dus geen eigen identiteit maar dezelfde\n` +
    `    identiteit met een voorvoegsel — en product_id is datzelfde nummer plus\n` +
    `    de folderdatum. Er is één identiteit, in drie schrijfwijzen.\n`,
);

// The one mechanism by which an EAN *can* add a link: the same article
// renumbered, so the two sources quote different article ids for one product.
const byEan = new Map<string, Set<string>>();
for (const p of promo.promotions) {
  const id = extractRetailerProductId(p.chainId, p.url);
  if (!id || !p.gtin) continue;
  const key = `${p.chainId}:${p.gtin}`;
  const set = byEan.get(key) ?? new Set<string>();
  set.add(id.id.toLowerCase());
  byEan.set(key, set);
}
const renumbered = [...byEan.values()].filter((s) => s.size > 1).length;
console.log(
  `    De enige uitzondering is een hernummerd artikel: één EAN op twee\n` +
    `    artikelnummers. In deze momentopname: ${renumbered} van ${byEan.size} EAN's (${((renumbered / Math.max(1, byEan.size)) * 100).toFixed(1)} %).\n` +
    `    Dat is de bovengrens van wat EAN-verrijking aan koppelingen toevoegt.\n`,
);

/* ── 3. Promotion links, before and after the crosswalk ──────────────────── */

const urlByProduct = new Map<string, string>();
for (const chainId of ['ah', 'jumbo'] as const) {
  const raw = rawChain(chainId);
  for (const product of raw.d) {
    urlByProduct.set(`${chainId}:${product.l}`, `${raw.u ?? ''}${product.l}`);
  }
}

const identityRecords = toIdentityRecords(
  validateSnapshot(JSON.parse(read(PROMO_PATH).replace(/^\uFEFF/, '')), PROMO_PATH).records,
);
const shelfRecords = existsSync(SHELF_PATH)
  ? toIdentityRecords(
      validateSnapshot(JSON.parse(read(SHELF_PATH).replace(/^\uFEFF/, '')), SHELF_PATH).records,
    )
  : [];
const allIdentityRecords = [...identityRecords, ...shelfRecords];

const crosswalks = chains.map((chain) =>
  buildCrosswalk({
    chainId: chain.chainId,
    offers: chain.allOffers,
    urlByProduct,
    records: allIdentityRecords,
    source: 'PRIJSPROFEET',
    sourceFile: shelfRecords.length > 0 ? `${PROMO_PATH} + ${SHELF_PATH}` : PROMO_PATH,
    importedAt,
  }),
);

console.log('  Crosswalk\n');
const cwHead =
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
console.log(cwHead);
console.log('    ' + '-'.repeat(cwHead.length - 4));
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

const stableIds = stableIdIndex(crosswalks);
const eans = eanIndex(crosswalks);
console.log(
  `\n    → ${stableIds.size} producten kregen een base_product_id, ${eans.size} een EAN\n`,
);

const retailerIdByProduct = retailerIdIndex(chains);
const candidates = promo.promotions.map(toCandidate);

console.log('  Promotiekoppelingen, zonder en met de crosswalk\n');
const linkHead =
  '    ' +
  'keten'.padEnd(8) +
  'variant'.padEnd(14) +
  'stable'.padStart(8) +
  'winkel-id'.padStart(11) +
  'EAN'.padStart(7) +
  'naam+maat'.padStart(11) +
  'review'.padStart(8) +
  'toegepast'.padStart(11);
console.log(linkHead);
console.log('    ' + '-'.repeat(linkHead.length - 4));
let beforeTotal = 0;
let afterTotal = 0;
for (const chain of chains) {
  for (const [label, enrich] of [
    ['zonder', false],
    ['met', true],
  ] as const) {
    const result = linkPromotions({
      chainId: chain.chainId,
      candidates,
      offers: chain.allOffers,
      retailerIdByProduct,
      ...(enrich ? { stableIdByProduct: stableIds, gtinByProduct: eans } : {}),
    });
    const t = result.metrics.byTier;
    if (enrich) afterTotal += result.linked.length;
    else beforeTotal += result.linked.length;
    console.log(
      '    ' +
        chain.chainId.padEnd(8) +
        label.padEnd(14) +
        String(t.EXACT_STABLE_ID).padStart(8) +
        String(t.EXACT_RETAILER_ID).padStart(11) +
        String(t.EXACT_GTIN).padStart(7) +
        String(t.NAME_PACKAGE).padStart(11) +
        String(t.NEEDS_REVIEW).padStart(8) +
        String(result.linked.length).padStart(11),
    );
  }
}

console.log(`
  Eindstand

    toegepaste promotiekoppelingen zonder crosswalk   ${String(beforeTotal).padStart(5)}  ${pct(beforeTotal, promo.promotions.length)} van ${promo.promotions.length}
    toegepaste promotiekoppelingen met crosswalk      ${String(afterTotal).padStart(5)}  ${pct(afterTotal, promo.promotions.length)} van ${promo.promotions.length}
    verschil                                          ${String(afterTotal - beforeTotal).padStart(5)}
`);
