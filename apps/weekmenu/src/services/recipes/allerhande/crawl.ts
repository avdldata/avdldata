import { extractRecipeJsonLd, type JsonObject } from './jsonld';
import { isAllowed, parseRobots, robotsFromStatus, type RobotsPolicy } from './robots';
import { allerhandeRecipeId, parseSitemap } from './sitemap';

/**
 * The Allerhande importer's crawl loop: polite, resumable, and quick to stop.
 *
 * It runs on the owner's own machine, one request at a time, and it only ever
 * does what the site allows:
 *
 *   - robots.txt is read first and consulted before every request;
 *   - requests are spaced by at least `delayMs`, or the site's Crawl-delay if
 *     that is longer;
 *   - it identifies itself honestly — no borrowed browser User-Agent;
 *   - a 401/403 stops the whole run at once. That is the site saying no, and
 *     there is deliberately no retry, no disguise and no workaround;
 *   - a 429 is waited out once, as the site's Retry-After asks; a second one
 *     stops the run;
 *   - three server errors in a row stop the run, and so do five pages in a row
 *     without recipe data — that is what a challenge page or a redesign looks
 *     like, and hammering on is not the answer to either.
 *
 * Every recipe is stored as soon as it is read, so a stopped run resumes where
 * it left off and nothing is ever fetched twice.
 */

export interface HttpResponse {
  readonly status: number;
  header(name: string): string | null;
  text(): Promise<string>;
  /** The raw body, for archives that store compressed records. */
  bytes(): Promise<Uint8Array>;
}

export type HttpGet = (
  url: string,
  headers: Readonly<Record<string, string>>,
) => Promise<HttpResponse>;

export interface StoredAllerhandeRecipe {
  readonly recipeId: string;
  readonly url: string;
  /** When the content was observed: our fetch, or the archive's capture. */
  readonly fetchedAt: string;
  /** The page's own schema.org Recipe, exactly as published. */
  readonly recipe: JsonObject;
  /** Where it came from. Absent on records written before there was a choice. */
  readonly source?: 'website' | 'commoncrawl' | 'appie-api';
}

export interface CrawlStore {
  has(recipeId: string): boolean;
  save(record: StoredAllerhandeRecipe): void;
}

export interface CrawlOptions {
  readonly origin: string;
  readonly sitemapPath: string;
  readonly userAgent: string;
  /** The robots.txt product token that names us. */
  readonly productToken: string;
  readonly delayMs: number;
  /** Stop after this many new recipes; for a trial run. */
  readonly limit?: number;
  readonly http: HttpGet;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
  readonly store: CrawlStore;
  readonly log: (line: string) => void;
}

export type StopReason =
  | 'ROBOTS_UNAVAILABLE'
  | 'ROBOTS_DISALLOW'
  | 'SITEMAP_UNAVAILABLE'
  | 'BLOCKED'
  | 'RATE_LIMITED'
  | 'SERVER_ERRORS'
  | 'NO_RECIPE_DATA';

export interface CrawlCounts {
  /** Recipe pages the sitemap lists. */
  readonly listed: number;
  /** Newly fetched and stored this run. */
  readonly fetched: number;
  /** Already stored by an earlier run. */
  readonly alreadyStored: number;
  /** Disallowed by robots.txt, so never requested. */
  readonly disallowed: number;
  /** Pages that answered but carried no schema.org Recipe. */
  readonly withoutRecipe: number;
  /** 404/410: listed but gone. */
  readonly gone: number;
  readonly requests: number;
}

export type CrawlOutcome =
  | ({ readonly status: 'DONE' } & CrawlCounts)
  | ({
      readonly status: 'STOPPED';
      readonly reason: StopReason;
      readonly detail: string;
    } & CrawlCounts);

const MAX_RETRY_AFTER_MS = 10 * 60_000;
const MAX_CONSECUTIVE_SERVER_ERRORS = 3;
const MAX_CONSECUTIVE_WITHOUT_RECIPE = 5;

function retryAfterMs(value: string | null, now: Date): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now.getTime());
}

export async function crawlAllerhande(options: CrawlOptions): Promise<CrawlOutcome> {
  const counts = {
    listed: 0,
    fetched: 0,
    alreadyStored: 0,
    disallowed: 0,
    withoutRecipe: 0,
    gone: 0,
    requests: 0,
  };
  const stop = (reason: StopReason, detail: string): CrawlOutcome => {
    options.log(`GESTOPT (${reason}): ${detail}`);
    return { status: 'STOPPED', reason, detail, ...counts };
  };
  const headers = { 'User-Agent': options.userAgent, Accept: 'text/html,application/xml' };
  const origin = new URL(options.origin).origin;
  const sameOrigin = (url: string): boolean => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  };

  // Raised to the site's Crawl-delay once robots.txt has been read.
  let delayMs = options.delayMs;
  let lastRequestAt: number | undefined;
  const get = async (url: string): Promise<HttpResponse | Error> => {
    const delay = delayMs;
    if (lastRequestAt !== undefined) {
      const wait = lastRequestAt + delay - options.now().getTime();
      if (wait > 0) await options.sleep(wait);
    }
    lastRequestAt = options.now().getTime();
    counts.requests += 1;
    try {
      return await options.http(url, headers);
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  };

  // ---- robots.txt ---------------------------------------------------------
  const robots = await get(`${origin}/robots.txt`);
  if (robots instanceof Error) return stop('ROBOTS_UNAVAILABLE', robots.message);
  const policy: RobotsPolicy =
    robots.status >= 200 && robots.status < 300
      ? parseRobots(await robots.text(), options.productToken)
      : robotsFromStatus(robots.status);
  delayMs = Math.max(options.delayMs, (policy.crawlDelaySeconds ?? 0) * 1000);
  if (policy.disallowAll) {
    return stop('ROBOTS_UNAVAILABLE', `robots.txt gaf status ${robots.status}`);
  }
  if (!isAllowed(policy, options.sitemapPath)) {
    return stop('ROBOTS_DISALLOW', `robots.txt verbiedt ${options.sitemapPath}`);
  }
  if (policy.crawlDelaySeconds !== undefined) {
    options.log(`robots.txt vraagt ${policy.crawlDelaySeconds} s tussen verzoeken`);
  }

  // ---- sitemap(s) ---------------------------------------------------------
  const recipeUrls = new Map<string, string>();
  const pending = [`${origin}${options.sitemapPath}`];
  const seenSitemaps = new Set<string>();
  while (pending.length > 0) {
    const url = pending.shift()!;
    if (seenSitemaps.has(url)) continue;
    seenSitemaps.add(url);
    const response = await get(url);
    if (response instanceof Error) return stop('SITEMAP_UNAVAILABLE', response.message);
    if (response.status === 401 || response.status === 403) {
      return stop('BLOCKED', `sitemap gaf ${response.status}`);
    }
    if (response.status < 200 || response.status >= 300) {
      return stop('SITEMAP_UNAVAILABLE', `sitemap gaf ${response.status}`);
    }
    const sitemap = parseSitemap(await response.text());
    for (const loc of sitemap.locations) {
      if (!sameOrigin(loc)) continue;
      if (sitemap.kind === 'index') {
        if (isAllowed(policy, new URL(loc).pathname)) pending.push(loc);
        continue;
      }
      const id = allerhandeRecipeId(loc);
      if (id && !recipeUrls.has(id)) recipeUrls.set(id, loc);
    }
  }
  counts.listed = recipeUrls.size;
  options.log(`${counts.listed} recepten in de sitemap`);

  // ---- recipe pages -------------------------------------------------------
  let serverErrorsInARow = 0;
  let withoutRecipeInARow = 0;
  for (const [id, url] of recipeUrls) {
    if (options.limit !== undefined && counts.fetched >= options.limit) break;
    if (options.store.has(id)) {
      counts.alreadyStored += 1;
      continue;
    }
    const path = new URL(url);
    if (!isAllowed(policy, `${path.pathname}${path.search}`)) {
      counts.disallowed += 1;
      continue;
    }

    let response = await get(url);
    if (!(response instanceof Error) && response.status === 429) {
      const wait = retryAfterMs(response.header('retry-after'), options.now());
      if (wait === undefined || wait > MAX_RETRY_AFTER_MS) {
        return stop('RATE_LIMITED', `429 zonder bruikbare Retry-After bij ${id}`);
      }
      options.log(`429: ${Math.round(wait / 1000)} s wachten, zoals gevraagd`);
      await options.sleep(wait);
      response = await get(url);
      if (!(response instanceof Error) && response.status === 429) {
        return stop('RATE_LIMITED', `opnieuw 429 bij ${id}`);
      }
    }

    if (response instanceof Error || response.status >= 500) {
      serverErrorsInARow += 1;
      const what = response instanceof Error ? response.message : `status ${response.status}`;
      options.log(`fout bij ${id}: ${what}`);
      if (serverErrorsInARow >= MAX_CONSECUTIVE_SERVER_ERRORS) {
        return stop('SERVER_ERRORS', `${serverErrorsInARow} fouten achter elkaar`);
      }
      continue;
    }
    serverErrorsInARow = 0;

    if (response.status === 401 || response.status === 403) {
      return stop('BLOCKED', `${response.status} bij ${id} — AH weigert deze verzoeken`);
    }
    if (response.status === 404 || response.status === 410) {
      counts.gone += 1;
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      counts.withoutRecipe += 1;
      continue;
    }

    const recipe = extractRecipeJsonLd(await response.text());
    if (!recipe) {
      counts.withoutRecipe += 1;
      withoutRecipeInARow += 1;
      if (withoutRecipeInARow >= MAX_CONSECUTIVE_WITHOUT_RECIPE) {
        return stop(
          'NO_RECIPE_DATA',
          `${withoutRecipeInARow} pagina's achter elkaar zonder receptdata — een blokkadepagina of een nieuwe site`,
        );
      }
      continue;
    }
    withoutRecipeInARow = 0;
    options.store.save({
      recipeId: id,
      url,
      fetchedAt: options.now().toISOString(),
      recipe,
      source: 'website',
    });
    counts.fetched += 1;
    if (counts.fetched % 25 === 0) {
      options.log(`${counts.fetched} opgehaald (${counts.alreadyStored} stonden er al)`);
    }
  }

  return { status: 'DONE', ...counts };
}
