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
    const proteinCount = chosen.filter(
      (r) => r.primaryProtein === candidate.primaryProtein,
    ).length;
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
    recipes.map((r) => r.tags.find((t) => ['pasta', 'rijst', 'aardappelen', 'brood', 'noedels', 'wraps'].includes(t)) ?? 'overig'),
  ).size;
  const max = recipes.length;
  return (cuisines / max + proteins / max + carbs / max) / 3;
}
