/**
 * How old the price data is, and whether that is worth saying out loud.
 *
 * Separate from the component that shows it, because the rule is a claim about
 * grocery prices rather than about layout, and a claim deserves a test that
 * does not need a browser.
 */

/**
 * After two weeks a grocery snapshot has stopped being this week's prices.
 *
 * Arbitrary but stated: promotions run for a week, and ordinary shelf prices
 * move slowly, so a fortnight is where "roughly right" turns into "probably
 * wrong somewhere". The planner keeps working — the data is still internally
 * consistent — but the reader is told.
 */
export const STALE_AFTER_DAYS = 14;

export interface Freshness {
  /** Whole days between the capture and now; null when there is no usable date. */
  readonly ageDays: number | null;
  readonly stale: boolean;
}

export function readFreshness(capturedAt: string | undefined, now: Date): Freshness {
  if (!capturedAt) return { ageDays: null, stale: false };
  const captured = new Date(capturedAt);
  if (Number.isNaN(captured.getTime())) return { ageDays: null, stale: false };
  // Floor, so a snapshot is "0 days old" for its whole first day. A clock that
  // runs ahead of the file gives a negative age, which is not stale either.
  const ageDays = Math.floor((now.getTime() - captured.getTime()) / 86_400_000);
  return { ageDays, stale: ageDays > STALE_AFTER_DAYS };
}
