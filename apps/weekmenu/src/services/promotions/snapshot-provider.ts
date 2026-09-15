import type { ExternalPromotion, PromotionProvider } from './types';

/**
 * Promotions come from a snapshot on disk, never from the optimizer's inner loop.
 *
 * Planning a week prices hundreds of candidate weeks. A network call anywhere
 * inside that is a thousand requests for one plan, so the shape is fixed:
 *
 *     provider.fetchPromotions()  →  snapshot  →  optimizer
 *
 * The snapshot is refreshed when it is older than `ttlMinutes`, and the
 * optimizer only ever reads what is already there. Nothing here is async at the
 * point of use.
 *
 * Two properties this deliberately has:
 *
 *   **Fetching never destroys what was there.** A new fetch is appended to the
 *   history, so "how often is this on offer, and at what price" stays
 *   answerable later. No deal score is computed yet — that needs a run of
 *   weeks, and inventing one from a single snapshot would be a number with no
 *   evidence behind it.
 *
 *   **A dead source is not a dead planner.** Every failure — offline, timeout,
 *   rate limit, garbage — leaves the last good snapshot in place and reports
 *   what happened. Promotions are an enhancement; the week still prices at
 *   Checkjebon shelf prices without them.
 */

export interface PromotionSnapshot {
  readonly fetchedAt: string;
  readonly source: string;
  readonly chainIds: readonly string[];
  readonly promotions: readonly ExternalPromotion[];
}

export interface PromotionHistoryEntry {
  readonly fetchedAt: string;
  readonly source: string;
  readonly count: number;
  readonly promotions: readonly ExternalPromotion[];
}

export type FetchOutcome =
  | { readonly status: 'FETCHED'; readonly snapshot: PromotionSnapshot }
  | { readonly status: 'CACHED'; readonly snapshot: PromotionSnapshot; readonly ageMinutes: number }
  | {
      /** The fetch failed but a usable snapshot is still in hand. */
      readonly status: 'STALE';
      readonly snapshot: PromotionSnapshot;
      readonly ageMinutes: number;
      readonly error: string;
    }
  | {
      /** No snapshot at all. The planner runs without promotions. */
      readonly status: 'UNAVAILABLE';
      readonly error: string;
    };

export interface PromotionStoreOptions {
  /** How long a snapshot stays fresh. Configurable, as the phase requires. */
  readonly ttlMinutes?: number;
  /** How many past fetches to keep. Enough to see a pattern, not a database. */
  readonly historyLimit?: number;
  /** Injected so tests are deterministic and the domain rule about clocks holds. */
  readonly now?: () => Date;
}

export const DEFAULT_PROMOTION_TTL_MINUTES = 6 * 60;

/**
 * Holds the current snapshot, refreshes it when it goes stale, keeps the past.
 *
 * In-memory here. Persisting it is a repository concern and deliberately not
 * this module's business — the shape it hands out is the same either way.
 */
export class PromotionStore {
  private current: PromotionSnapshot | undefined;
  private readonly past: PromotionHistoryEntry[] = [];
  private readonly ttlMinutes: number;
  private readonly historyLimit: number;
  private readonly now: () => Date;

  constructor(
    private readonly provider: PromotionProvider,
    options: PromotionStoreOptions = {},
  ) {
    this.ttlMinutes = options.ttlMinutes ?? DEFAULT_PROMOTION_TTL_MINUTES;
    this.historyLimit = options.historyLimit ?? 12;
    this.now = options.now ?? (() => new Date());
  }

  /** The snapshot the optimizer reads. Never triggers a fetch. */
  snapshot(): PromotionSnapshot | undefined {
    return this.current;
  }

  history(): readonly PromotionHistoryEntry[] {
    return this.past;
  }

  /**
   * Bring the snapshot up to date if it has gone stale.
   *
   * Call this before planning, not during. The outcome says what happened, so
   * a caller can tell "these promotions are six hours old" from "the source is
   * down and these are from yesterday" — a distinction that matters when the
   * plan is presented to someone.
   */
  async refresh(chainIds: readonly string[], force = false): Promise<FetchOutcome> {
    const age = this.ageMinutes();
    if (!force && this.current && age !== undefined && age < this.ttlMinutes) {
      return { status: 'CACHED', snapshot: this.current, ageMinutes: age };
    }

    try {
      const promotions = await this.provider.fetchPromotions(chainIds);
      const snapshot: PromotionSnapshot = {
        fetchedAt: this.now().toISOString(),
        source: this.provider.name,
        chainIds: [...chainIds],
        promotions: dedupe(promotions),
      };
      // Append, never overwrite: the previous observation is the only evidence
      // we will ever have about what this product used to cost.
      if (this.current) {
        this.past.push({
          fetchedAt: this.current.fetchedAt,
          source: this.current.source,
          count: this.current.promotions.length,
          promotions: this.current.promotions,
        });
        while (this.past.length > this.historyLimit) this.past.shift();
      }
      this.current = snapshot;
      return { status: 'FETCHED', snapshot };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.current) {
        return {
          status: 'STALE',
          snapshot: this.current,
          ageMinutes: age ?? Number.POSITIVE_INFINITY,
          error: message,
        };
      }
      return { status: 'UNAVAILABLE', error: message };
    }
  }

  private ageMinutes(): number | undefined {
    if (!this.current) return undefined;
    const fetched = Date.parse(this.current.fetchedAt);
    if (!Number.isFinite(fetched)) return undefined;
    return (this.now().getTime() - fetched) / 60_000;
  }
}

/**
 * The same promotion twice is one promotion.
 *
 * A feed that lists an offer per store, or that repeats it across pages, would
 * otherwise stack: two identical promotions on one product, each read as an
 * independent discount. Keyed on the source's own id, first occurrence wins so
 * the result stays deterministic.
 */
export function dedupe(promotions: readonly ExternalPromotion[]): ExternalPromotion[] {
  const seen = new Set<string>();
  const kept: ExternalPromotion[] = [];
  for (const promotion of promotions) {
    const key = `${promotion.chainId}|${promotion.externalPromotionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(promotion);
  }
  return kept;
}

/**
 * A provider that reads a JSON file instead of the network.
 *
 * This is how a saved response gets used without any connectivity, and it is
 * what the tests run against. `readFile` is injected so this module never
 * imports `node:fs` and stays usable anywhere.
 */
export function fileSnapshotProvider(
  name: string,
  readFile: () => string,
  parse: (raw: unknown) => readonly ExternalPromotion[],
): PromotionProvider {
  return {
    name,
    fetchPromotions: async (chainIds) => {
      const raw: unknown = JSON.parse(readFile());
      return parse(raw).filter((promotion) => chainIds.includes(promotion.chainId));
    },
  };
}
