import { describe, expect, it } from 'vitest';
import { readFreshness, STALE_AFTER_DAYS } from '@/features/planner/freshness';

/**
 * When the app admits its prices are old.
 *
 * The screen cannot be driven into this state in a test run — the committed
 * snapshot is days old, not weeks — so the rule is tested where it lives. That
 * is the whole reason it lives apart from the component.
 */
const captured = '2026-09-01T06:00:00.000Z';
const at = (iso: string) => readFreshness(captured, new Date(iso));

describe('how old the prices are', () => {
  it('counts whole days, so a fresh snapshot is zero days old', () => {
    expect(at('2026-09-01T23:59:00.000Z').ageDays).toBe(0);
    expect(at('2026-09-02T06:00:00.000Z').ageDays).toBe(1);
  });

  it('says nothing for the first fortnight', () => {
    expect(at('2026-09-15T06:00:00.000Z')).toEqual({ ageDays: 14, stale: false });
  });

  it('warns from the fifteenth day', () => {
    expect(at('2026-09-16T06:00:00.000Z')).toEqual({ ageDays: 15, stale: true });
    expect(at('2026-10-01T06:00:00.000Z').stale).toBe(true);
  });

  it('is quiet when there is no date, rather than guessing one', () => {
    expect(readFreshness(undefined, new Date())).toEqual({ ageDays: null, stale: false });
    expect(readFreshness('geen datum', new Date())).toEqual({ ageDays: null, stale: false });
  });

  it('does not call the future stale', () => {
    // A machine whose clock runs behind the snapshot file. Negative is not old.
    expect(at('2026-08-20T06:00:00.000Z')).toEqual({ ageDays: -12, stale: false });
  });

  it('keeps the threshold a stated number, not a magic one', () => {
    expect(STALE_AFTER_DAYS).toBe(14);
  });
});
