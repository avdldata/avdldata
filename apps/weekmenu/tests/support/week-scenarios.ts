import { DEMO_HOUSEHOLD } from '@/data/seed/demo-household';
import type { ConveniencePreference } from '@/domain/optimization/config';
import type { Household } from '@/domain/household/types';
import type { Recipe } from '@/domain/recipes/types';

/**
 * A run of households that differ in the ways the optimizer actually cares
 * about, so that fifty "weeks" are fifty different planning problems.
 *
 * The first version of this rotated the recipe list instead, which looked like
 * variation and produced the same menu fifty times over: the optimizer sorts
 * its own pool, so the order it is handed makes no difference. Household size,
 * convenience preference and the calendar date do change the answer — portions,
 * the weight on effort, and which days the diversity rules compare.
 *
 * Household size alone still only produces a handful of distinct menus, because
 * the catalogue is small and the optimizer is deterministic — so each run also
 * draws its own slice of the catalogue. That is not artificial: nobody plans
 * every week from every recipe they own. `subset` says how large the slice is,
 * and the slice is a function of the run number, so it reproduces exactly.
 *
 * Deterministic and seedless: run number `n` always describes the same
 * household and the same catalogue slice, so a bad week can be reproduced by
 * its number alone.
 */
export interface WeekScenario {
  readonly label: string;
  readonly household: Household;
  readonly conveniencePreference: ConveniencePreference;
  readonly startDate: string;
  readonly today: Date;
  /** Which recipes this household is choosing from this week. */
  readonly recipes: (all: readonly Recipe[]) => Recipe[];
}

/**
 * A small deterministic generator, so a run number reproduces a slice exactly.
 * xorshift32: no dependencies, no clock, and good enough to shuffle a list.
 */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  let state = seed >>> 0 || 0x2545f491;
  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const CONVENIENCE: readonly ConveniencePreference[] = [
  'laagste-prijs',
  'gebalanceerd',
  'gemak',
] as const;

export function weekScenarios(count: number, subset = 0.7): WeekScenario[] {
  return Array.from({ length: count }, (_, index) => {
    const members = DEMO_HOUSEHOLD.members.slice(0, 1 + (index % DEMO_HOUSEHOLD.members.length));
    // Spread over three months so the seasonal and weekday rules see variety,
    // and so no two consecutive runs share a start date.
    const month = 9 + Math.floor(index / 28);
    const day = 1 + ((index * 3) % 28);
    const startDate = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return {
      label: `week ${String(index + 1).padStart(2, '0')}`,
      household: { ...DEMO_HOUSEHOLD, members },
      conveniencePreference: CONVENIENCE[index % CONVENIENCE.length]!,
      startDate,
      today: new Date(`${startDate}T09:00:00Z`),
      recipes: (all) =>
        // Run 0 gets the whole catalogue, so the default case stays the one a
        // reader can check by hand against `pnpm data:week`.
        index === 0
          ? [...all]
          : shuffled(all, index * 2654435761).slice(
              0,
              Math.max(12, Math.round(all.length * subset)),
            ),
    };
  });
}
