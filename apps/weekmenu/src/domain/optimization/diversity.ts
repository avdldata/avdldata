import type { Recipe } from '../recipes/types';
import type { DiversityConfig } from './config';

export interface DiversityViolation {
  readonly rule:
    | 'DUPLICATE_RECIPE'
    | 'NEAR_DUPLICATE'
    | 'TOO_MUCH_PASTA'
    | 'TOO_MUCH_SOUP'
    | 'TOO_MUCH_SAME_PROTEIN'
    | 'TOO_MANY_CONSECUTIVE_CUISINE'
    | 'TOO_MUCH_SAME_CUISINE';
  readonly detail: string;
}

/**
 * Would adding `candidate` after `chosen` break a variety rule?
 *
 * Used as a hard gate during the beam search (cheap and keeps the search space
 * small) and re-checked on the finished week so the score can report on it.
 */
export function violationsIfAdded(
  chosen: readonly Recipe[],
  candidate: Recipe,
  config: DiversityConfig,
): DiversityViolation[] {
  const violations: DiversityViolation[] = [];

  if (chosen.some((r) => r.id === candidate.id)) {
    violations.push({ rule: 'DUPLICATE_RECIPE', detail: candidate.name });
    return violations; // no point checking the rest
  }

  if (chosen.some((r) => isNearDuplicate(r, candidate, config.nearDuplicateTagOverlap))) {
    violations.push({ rule: 'NEAR_DUPLICATE', detail: candidate.name });
  }

  if (candidate.tags.includes('pasta')) {
    const pastaCount = chosen.filter((r) => r.tags.includes('pasta')).length;
    if (pastaCount + 1 > config.maxPastaDishes) {
      violations.push({ rule: 'TOO_MUCH_PASTA', detail: `${pastaCount + 1} pastagerechten` });
    }
  }

  if (candidate.tags.includes('soep')) {
    const soupCount = chosen.filter((r) => r.tags.includes('soep')).length;
    if (soupCount + 1 > config.maxSoupDishes) {
      violations.push({ rule: 'TOO_MUCH_SOUP', detail: `${soupCount + 1} soepen` });
    }
  }

  if (candidate.primaryProtein !== 'geen') {
    const proteinCount = chosen.filter((r) => r.primaryProtein === candidate.primaryProtein).length;
    if (proteinCount + 1 > config.maxSamePrimaryProtein) {
      violations.push({
        rule: 'TOO_MUCH_SAME_PROTEIN',
        detail: `${proteinCount + 1}× ${candidate.primaryProtein}`,
      });
    }
  }

  let consecutive = 0;
  for (let i = chosen.length - 1; i >= 0; i -= 1) {
    if (chosen[i]!.cuisine === candidate.cuisine) consecutive += 1;
    else break;
  }
  if (consecutive + 1 > config.maxConsecutiveSameCuisine) {
    violations.push({
      rule: 'TOO_MANY_CONSECUTIVE_CUISINE',
      detail: `${consecutive + 1}× ${candidate.cuisine} achter elkaar`,
    });
  }

  const cuisineCount = chosen.filter((r) => r.cuisine === candidate.cuisine).length;
  if (cuisineCount + 1 > config.maxSameCuisine) {
    violations.push({
      rule: 'TOO_MUCH_SAME_CUISINE',
      detail: `${cuisineCount + 1}× ${candidate.cuisine}`,
    });
  }

  return violations;
}

export function isNearDuplicate(a: Recipe, b: Recipe, overlapThreshold: number): boolean {
  if (a.cuisine !== b.cuisine || a.primaryProtein !== b.primaryProtein) return false;
  const tagsA = new Set(a.tags);
  const tagsB = new Set(b.tags);
  if (tagsA.size === 0 || tagsB.size === 0) return false;
  let shared = 0;
  for (const tag of tagsA) if (tagsB.has(tag)) shared += 1;
  const overlap = shared / Math.min(tagsA.size, tagsB.size);
  return overlap >= overlapThreshold;
}

/** All variety problems in a finished week. */
export function weekDiversityViolations(
  recipes: readonly Recipe[],
  config: DiversityConfig,
): DiversityViolation[] {
  const violations: DiversityViolation[] = [];
  const seen: Recipe[] = [];
  for (const recipe of recipes) {
    violations.push(...violationsIfAdded(seen, recipe, config));
    seen.push(recipe);
  }
  return violations;
}

/** A 0–1 measure of how varied the week is; 1 is perfectly varied. */
export function varietyScore(recipes: readonly Recipe[]): number {
  if (recipes.length === 0) return 1;
  const cuisines = new Set(recipes.map((r) => r.cuisine)).size;
  const proteins = new Set(recipes.map((r) => r.primaryProtein)).size;
  const carbs = new Set(
    recipes.map(
      (r) =>
        r.tags.find((t) =>
          ['pasta', 'rijst', 'aardappelen', 'brood', 'noedels', 'wraps'].includes(t),
        ) ?? 'overig',
    ),
  ).size;
  const max = recipes.length;
  return (cuisines / max + proteins / max + carbs / max) / 3;
}

/**
 * The arrangement of these dishes that breaks the fewest variety rules.
 *
 * Only "no more than N of the same cuisine in a row" depends on the order; every
 * other rule counts over the whole set. So a week can carry a repetition penalty
 * purely because of the order it happened to be built in — a penalty nobody
 * chose and the user cannot see the point of.
 *
 * Branch and bound over the permutations, pruning as soon as the partial
 * arrangement has already broken as many rules as the best complete one found.
 * Adding a dish can only add violations, so that bound is sound, and with seven
 * dishes the search is exact rather than merely good.
 *
 * Exactness matters beyond tidiness: the benchmark compares this optimizer with
 * an exhaustive solver that calls the very same function. An earlier version
 * bailed out and returned the caller's own order when no clean arrangement
 * existed, which made the answer depend on who was asking — and let the
 * heuristic "beat" the exhaustive optimum on two seeds. A comparison where the
 * two sides disagree about the score measures nothing.
 */
export function bestOrdering(
  recipes: readonly Recipe[],
  config: DiversityConfig,
  maxNodes = 200_000,
): readonly Recipe[] {
  if (recipes.length < 2) return recipes;

  // Sorted by id so the answer depends on the set alone, never on the order it
  // arrived in.
  const pool = [...recipes].sort((a, b) => a.id.localeCompare(b.id));
  let best: readonly Recipe[] = pool;
  let bestViolations = weekDiversityViolations(pool, config).length;
  if (bestViolations === 0) return pool;

  const used = new Array<boolean>(pool.length).fill(false);
  const current: Recipe[] = [];
  let nodes = 0;

  const walk = (violationsSoFar: number): boolean => {
    if (nodes > maxNodes) return false;
    nodes += 1;

    if (current.length === pool.length) {
      if (violationsSoFar < bestViolations) {
        bestViolations = violationsSoFar;
        best = [...current];
      }
      return bestViolations === 0;
    }

    for (let index = 0; index < pool.length; index += 1) {
      if (used[index]) continue;
      const candidate = pool[index]!;
      const added = violationsIfAdded(current, candidate, config).length;
      // More dishes can only add violations, so a partial arrangement that is
      // already this bad cannot become better than the incumbent.
      if (violationsSoFar + added >= bestViolations) continue;

      used[index] = true;
      current.push(candidate);
      const done = walk(violationsSoFar + added);
      current.pop();
      used[index] = false;
      if (done) return true;
    }
    return false;
  };

  walk(0);
  return best;
}
