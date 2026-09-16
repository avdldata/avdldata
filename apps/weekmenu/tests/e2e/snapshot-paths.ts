/**
 * Where the end-to-end runs get their price and promotion data.
 *
 * Four servers run against the same build, each with a different answer to
 * "what data do you have?", because three of the app's promises can only be
 * tested by taking something away: it must refuse to invent prices, it must say
 * when its prices are old, and it must keep working when the folder is missing.
 *
 * The paths live here rather than in the config so that the config, the global
 * setup that builds the fixtures and the tests that assert on them cannot drift
 * apart.
 */
export const REAL_PRICES = 'data/external/checkjebon-snapshot.json';

/**
 * A copy of the real snapshot, with its modification time set weeks back.
 *
 * The app reads the capture date off the file's mtime — that is the only
 * freshness we can honestly claim about a file someone dropped in a directory —
 * so ageing a copy is enough to reach the warning. The real snapshot keeps its
 * real date: a test that edits production data to make itself pass is not
 * evidence of anything.
 */
export const AGED_PRICES = '.data/e2e-verouderd/prijzen-van-weken-geleden.json';

/** How old the copy is made. Comfortably past the fourteen-day threshold. */
export const AGED_BY_DAYS = 40;

/** Paths that deliberately do not exist. */
export const MISSING_PRICES = 'data/external/bestaat-niet.json';
export const MISSING_PROMOTIONS = 'data/external/bestaat-ook-niet.json';

/** One data directory per server, so no two runs share a household. */
export const DATA_DIRS = {
  healthy: '.data/e2e',
  withoutPrices: '.data/e2e-kapot',
  agedPrices: '.data/e2e-verouderd',
  withoutPromotions: '.data/e2e-zonder-aanbiedingen',
} as const;
