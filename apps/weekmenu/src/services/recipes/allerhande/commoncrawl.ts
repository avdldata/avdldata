import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import type { CrawlStore, HttpGet, HttpResponse } from './crawl';
import { extractRecipeJsonLd } from './jsonld';
import { allerhandeRecipeId } from './sitemap';

/**
 * Allerhande-recepten uit Common Crawl, in plaats van van ah.nl zelf.
 *
 * Common Crawl is een openbaar webarchief dat precies voor dit gebruik bestaat:
 * een index per crawl, en de pagina's zelf als WARC-records in bestanden die
 * met een byte-range te lezen zijn. Er gaat geen enkel verzoek naar AH. Wat we
 * binnenkrijgen is de pagina zoals Common Crawl hem zag, inclusief het
 * schema.org-recept dat de rest van de import al begrijpt.
 *
 * Twee beleefdheden, omdat het archief een gedeelde voorziening is:
 *   - één verzoek tegelijk, met een pauze ertussen;
 *   - bij 503/429 (de index is geregeld overbelast) wachten en het opnieuw
 *     proberen, met oplopende pauzes — zoals Common Crawl zelf vraagt. Blijft
 *     het misgaan, dan stopt de run; de volgende run gaat verder waar hij bleef.
 */

export interface CdxEntry {
  readonly url: string;
  readonly timestamp: string;
  readonly status: string;
  readonly mime?: string;
  readonly filename: string;
  readonly offset: number;
  readonly length: number;
}

export function parseCdxLines(text: string): CdxEntry[] {
  const entries: CdxEntry[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const raw = JSON.parse(trimmed) as Record<string, string>;
      if (!raw['url'] || !raw['filename'] || !raw['offset'] || !raw['length']) continue;
      entries.push({
        url: raw['url'],
        timestamp: raw['timestamp'] ?? '',
        status: raw['status'] ?? '',
        ...(raw['mime'] ? { mime: raw['mime'] } : {}),
        filename: raw['filename'],
        offset: Number(raw['offset']),
        length: Number(raw['length']),
      });
    } catch {
      // A malformed index line costs one capture, not the run.
    }
  }
  return entries;
}

/** Per recipe, the newest capture that was an actual page (200, HTML). */
export function newestRecipeCaptures(entries: readonly CdxEntry[]): Map<string, CdxEntry> {
  const newest = new Map<string, CdxEntry>();
  for (const entry of entries) {
    if (entry.status !== '200') continue;
    if (entry.mime && !entry.mime.includes('html')) continue;
    const id = allerhandeRecipeId(entry.url);
    if (!id) continue;
    const current = newest.get(id);
    if (!current || entry.timestamp > current.timestamp) newest.set(id, entry);
  }
  return newest;
}

/** 20260914122508 → 2026-09-14T12:25:08.000Z */
export function captureTimestampToIso(timestamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(timestamp);
  if (!m) return new Date(0).toISOString();
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)).toISOString();
}

function indexOfDoubleCrlf(bytes: Uint8Array, from = 0): number {
  for (let i = from; i + 3 < bytes.length; i += 1) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) {
      return i;
    }
  }
  return -1;
}

function headerMap(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of block.split('\r\n').slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) map.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return map;
}

function dechunk(body: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let position = 0;
  const decoder = new TextDecoder('latin1');
  while (position < body.length) {
    let lineEnd = position;
    while (lineEnd + 1 < body.length && !(body[lineEnd] === 13 && body[lineEnd + 1] === 10)) {
      lineEnd += 1;
    }
    const size = parseInt(decoder.decode(body.subarray(position, lineEnd)).split(';')[0]!, 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const start = lineEnd + 2;
    parts.push(body.subarray(start, start + size));
    position = start + size + 2;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * One WARC response record (as a gzip member) → the HTTP status and the page.
 *
 * Common Crawl normally stores the payload already decoded and renames the
 * original headers to `X-Crawler-Content-Encoding` / `X-Crawler-Transfer-
 * Encoding`. When a record still carries a live encoding it is undone here, so
 * either way what comes out is the HTML the site served.
 */
export function parseWarcResponse(
  record: Uint8Array,
): { status: number; html: string } | undefined {
  let bytes = record;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(gunzipSync(bytes));

  const warcEnd = indexOfDoubleCrlf(bytes);
  if (warcEnd === -1) return undefined;
  const warcHeaders = new TextDecoder('latin1').decode(bytes.subarray(0, warcEnd));
  if (!/^WARC-Type:\s*response\s*$/im.test(warcHeaders)) return undefined;

  // The record's own length, not "until the end": every WARC record is
  // followed by a blank line, and a compressed body with those two bytes
  // still attached does not decompress.
  const httpStart = warcEnd + 4;
  const declared = Number(/^Content-Length:\s*(\d+)\s*$/im.exec(warcHeaders)?.[1]);
  const message = Number.isFinite(declared)
    ? bytes.subarray(httpStart, httpStart + declared)
    : bytes.subarray(httpStart);
  const httpEnd = indexOfDoubleCrlf(message);
  if (httpEnd === -1) return undefined;
  const httpBlock = new TextDecoder('latin1').decode(message.subarray(0, httpEnd));
  const status = Number(/^HTTP\/[\d.]+\s+(\d{3})/.exec(httpBlock)?.[1] ?? 0);
  const headers = headerMap(httpBlock);

  let body = message.subarray(httpEnd + 4);
  if (/chunked/i.test(headers.get('transfer-encoding') ?? '')) body = dechunk(body);
  const encoding = (headers.get('content-encoding') ?? '').toLowerCase();
  try {
    if (encoding.includes('gzip')) body = new Uint8Array(gunzipSync(body));
    else if (encoding.includes('br')) body = new Uint8Array(brotliDecompressSync(body));
    else if (encoding.includes('deflate')) body = new Uint8Array(inflateSync(body));
  } catch {
    return undefined;
  }
  return { status, html: new TextDecoder('utf-8').decode(body) };
}

export interface ArchiveOptions {
  readonly indexOrigin: string;
  readonly dataOrigin: string;
  /** How many of the most recent crawls to search, newest capture wins. */
  readonly crawls: number;
  /** The URL pattern, Common Crawl style: `www.ah.nl/allerhande/recept/*`. */
  readonly urlPattern: string;
  readonly userAgent: string;
  readonly delayMs: number;
  readonly limit?: number;
  /** Attempts per request when the archive says it is busy. */
  readonly maxAttempts?: number;
  readonly http: HttpGet;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
  readonly store: CrawlStore;
  readonly log: (line: string) => void;
}

export interface ArchiveCounts {
  readonly crawlsSearched: readonly string[];
  /** Distinct recipes with a usable capture in the searched crawls. */
  readonly inArchive: number;
  readonly fetched: number;
  readonly alreadyStored: number;
  readonly withoutRecipe: number;
  readonly failed: number;
  readonly requests: number;
}

export type ArchiveOutcome =
  | ({ readonly status: 'DONE' } & ArchiveCounts)
  | ({
      readonly status: 'STOPPED';
      readonly reason: 'INDEX_UNAVAILABLE' | 'DATA_UNAVAILABLE';
      readonly detail: string;
    } & ArchiveCounts);

function retryAfterMs(response: HttpResponse): number | undefined {
  const value = response.header('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

export async function archiveAllerhande(options: ArchiveOptions): Promise<ArchiveOutcome> {
  const maxAttempts = options.maxAttempts ?? 5;
  const counts = {
    crawlsSearched: [] as string[],
    inArchive: 0,
    fetched: 0,
    alreadyStored: 0,
    withoutRecipe: 0,
    failed: 0,
    requests: 0,
  };
  const headers = { 'User-Agent': options.userAgent };
  let lastRequestAt: number | undefined;

  /** One polite request, retried with growing pauses while the archive is busy. */
  const get = async (
    url: string,
    extra: Record<string, string> = {},
  ): Promise<HttpResponse | Error> => {
    let last: HttpResponse | Error = new Error('geen poging gedaan');
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (lastRequestAt !== undefined) {
        const wait = lastRequestAt + options.delayMs - options.now().getTime();
        if (wait > 0) await options.sleep(wait);
      }
      lastRequestAt = options.now().getTime();
      counts.requests += 1;
      try {
        last = await options.http(url, { ...headers, ...extra });
      } catch (error) {
        last = error instanceof Error ? error : new Error(String(error));
      }
      const busy =
        last instanceof Error || last.status === 429 || last.status === 503 || last.status >= 500;
      if (!busy) return last;
      if (attempt === maxAttempts) break;
      const asked = last instanceof Error ? undefined : retryAfterMs(last);
      const backoff = Math.min(asked ?? 2 ** attempt * 1000, 120_000);
      options.log(`archief is bezig, ${Math.round(backoff / 1000)} s wachten (poging ${attempt})`);
      await options.sleep(backoff);
    }
    return last;
  };
  const describe = (response: HttpResponse | Error) =>
    response instanceof Error ? response.message : `status ${response.status}`;
  const stop = (
    reason: 'INDEX_UNAVAILABLE' | 'DATA_UNAVAILABLE',
    detail: string,
  ): ArchiveOutcome => {
    options.log(`GESTOPT (${reason}): ${detail}`);
    return { status: 'STOPPED', reason, detail, ...counts };
  };

  // ---- which crawls -------------------------------------------------------
  const info = await get(`${options.indexOrigin}/collinfo.json`);
  if (info instanceof Error || info.status !== 200) {
    return stop('INDEX_UNAVAILABLE', `collinfo.json: ${describe(info)}`);
  }
  const crawls = (JSON.parse(await info.text()) as { id: string; 'cdx-api': string }[]).slice(
    0,
    Math.max(1, options.crawls),
  );

  // ---- the index ------------------------------------------------------------
  const entries: CdxEntry[] = [];
  const pattern = encodeURIComponent(options.urlPattern);
  for (const crawl of crawls) {
    counts.crawlsSearched.push(crawl.id);
    const base = `${crawl['cdx-api']}?url=${pattern}&output=json`;
    const sizing = await get(`${base}&showNumPages=true`);
    if (sizing instanceof Error || (sizing.status !== 200 && sizing.status !== 404)) {
      return stop('INDEX_UNAVAILABLE', `${crawl.id}: ${describe(sizing)}`);
    }
    if (sizing.status === 404) continue; // no captures in this crawl
    let pages = 1;
    try {
      pages = Math.max(
        1,
        Number((JSON.parse(await sizing.text()) as { pages?: number }).pages ?? 1),
      );
    } catch {
      pages = 1;
    }
    for (let page = 0; page < pages; page += 1) {
      const response = await get(`${base}&page=${page}`);
      if (response instanceof Error || (response.status !== 200 && response.status !== 404)) {
        return stop('INDEX_UNAVAILABLE', `${crawl.id} pagina ${page}: ${describe(response)}`);
      }
      if (response.status === 200) entries.push(...parseCdxLines(await response.text()));
    }
    options.log(`${crawl.id}: ${pages} indexpagina's gelezen`);
  }

  const captures = newestRecipeCaptures(entries);
  counts.inArchive = captures.size;
  options.log(`${captures.size} verschillende recepten in het archief`);

  // ---- the records ----------------------------------------------------------
  const ids = [...captures.keys()].sort();
  let failedInARow = 0;
  for (const id of ids) {
    if (options.limit !== undefined && counts.fetched >= options.limit) break;
    if (options.store.has(id)) {
      counts.alreadyStored += 1;
      continue;
    }
    const capture = captures.get(id)!;
    const range = `bytes=${capture.offset}-${capture.offset + capture.length - 1}`;
    const response = await get(`${options.dataOrigin}/${capture.filename}`, { Range: range });
    if (response instanceof Error || (response.status !== 206 && response.status !== 200)) {
      counts.failed += 1;
      failedInARow += 1;
      if (failedInARow >= 3) {
        return stop(
          'DATA_UNAVAILABLE',
          `3 records achter elkaar niet te lezen (${describe(response)})`,
        );
      }
      continue;
    }
    failedInARow = 0;
    const page = parseWarcResponse(await response.bytes());
    const recipe = page && page.status === 200 ? extractRecipeJsonLd(page.html) : undefined;
    if (!recipe) {
      counts.withoutRecipe += 1;
      continue;
    }
    options.store.save({
      recipeId: id,
      url: capture.url,
      fetchedAt: captureTimestampToIso(capture.timestamp),
      recipe,
      source: 'commoncrawl',
    });
    counts.fetched += 1;
    if (counts.fetched % 250 === 0) options.log(`${counts.fetched} recepten opgeslagen`);
  }
  return { status: 'DONE', ...counts };
}
