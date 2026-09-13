import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIVERSITY_CONFIG,
  type DiversityConfig,
} from '@/domain/optimization/config';
import {
  isNearDuplicate,
  varietyScore,
  violationsIfAdded,
  weekDiversityViolations,
} from '@/domain/optimization/diversity';
import { makeRecipe } from '../support/builders';

const config: DiversityConfig = DEFAULT_DIVERSITY_CONFIG;

// Distinct second tags keep these from tripping the near-duplicate rule, so
// each test exercises exactly the rule it names.
const PROTEINS = ['rund', 'varken', 'vis', 'ei'] as const;
const EXTRA_TAGS = ['snel', 'budget', 'comfortfood', 'ovenschotel'] as const;
const CUISINES = ['aziatisch', 'indiaas', 'mexicaans', 'grieks'] as const;
let seq = 0;
const distinct = () => {
  const i = seq++ % EXTRA_TAGS.length;
  return { protein: PROTEINS[i]!, tag: EXTRA_TAGS[i]!, cuisine: CUISINES[i]! };
};

const pasta = (id: string) => {
  const d = distinct();
  return makeRecipe(id, { tags: ['pasta', d.tag], cuisine: 'italiaans', primaryProtein: d.protein });
};
const kip = (id: string) => {
  const d = distinct();
  return makeRecipe(id, { tags: ['rijst', d.tag], cuisine: d.cuisine, primaryProtein: 'kip' });
};
const soep = (id: string) => {
  const d = distinct();
  return makeRecipe(id, { tags: ['soep', d.tag], cuisine: 'nederlands', primaryProtein: 'geen' });
};

describe('variety rules', () => {
  it('refuses the same dish twice in one week', () => {
    const violations = violationsIfAdded([pasta('a')], pasta('a'), config);
    expect(violations[0]?.rule).toBe('DUPLICATE_RECIPE');
  });

  it('allows two pasta dishes but not three', () => {
    expect(violationsIfAdded([pasta('a')], pasta('b'), config)).toHaveLength(0);
    expect(
      violationsIfAdded([pasta('a'), pasta('b')], pasta('c'), config).map((v) => v.rule),
    ).toContain('TOO_MUCH_PASTA');
  });

  it('allows three dishes with the same protein but not four', () => {
    const chosen = [kip('a'), kip('b'), kip('c')];
    expect(violationsIfAdded(chosen.slice(0, 2), kip('c'), config)).toHaveLength(0);
    expect(violationsIfAdded(chosen, kip('d'), config).map((v) => v.rule)).toContain(
      'TOO_MUCH_SAME_PROTEIN',
    );
  });

  it('allows only one soup per week', () => {
    expect(violationsIfAdded([], soep('a'), config)).toHaveLength(0);
    expect(violationsIfAdded([soep('a')], soep('b'), config).map((v) => v.rule)).toContain(
      'TOO_MUCH_SOUP',
    );
  });

  it('breaks up a run of the same cuisine', () => {
    const a = makeRecipe('a', { cuisine: 'italiaans', primaryProtein: 'kip' });
    const b = makeRecipe('b', { cuisine: 'italiaans', primaryProtein: 'vis' });
    const cRecipe = makeRecipe('c', { cuisine: 'italiaans', primaryProtein: 'rund' });
    expect(violationsIfAdded([a, b], cRecipe, config).map((v) => v.rule)).toContain(
      'TOO_MANY_CONSECUTIVE_CUISINE',
    );
  });

  it('spots near-duplicates that differ only in name', () => {
    const a = makeRecipe('a', { cuisine: 'italiaans', primaryProtein: 'kip', tags: ['pasta', 'snel'] });
    const b = makeRecipe('b', { cuisine: 'italiaans', primaryProtein: 'kip', tags: ['pasta', 'snel'] });
    expect(isNearDuplicate(a, b, config.nearDuplicateTagOverlap)).toBe(true);
    expect(violationsIfAdded([a], b, config).map((v) => v.rule)).toContain('NEAR_DUPLICATE');
  });

  it('does not call two different proteins a near-duplicate', () => {
    const a = makeRecipe('a', { cuisine: 'italiaans', primaryProtein: 'kip', tags: ['pasta'] });
    const b = makeRecipe('b', { cuisine: 'italiaans', primaryProtein: 'vis', tags: ['pasta'] });
    expect(isNearDuplicate(a, b, config.nearDuplicateTagOverlap)).toBe(false);
  });

  it('scores a monotonous week below a varied one', () => {
    const monotonous = [pasta('a'), pasta('b'), pasta('c')];
    const varied = [pasta('a'), kip('b'), soep('c')];
    expect(varietyScore(varied)).toBeGreaterThan(varietyScore(monotonous));
  });

  it('reports every violation in a finished week', () => {
    const week = [pasta('a'), pasta('b'), pasta('c'), kip('d')];
    const violations = weekDiversityViolations(week, config);
    expect(violations.map((v) => v.rule)).toContain('TOO_MUCH_PASTA');
  });

  it('is configurable', () => {
    const strict: DiversityConfig = { ...config, maxPastaDishes: 1 };
    expect(violationsIfAdded([pasta('a')], pasta('b'), strict).map((v) => v.rule)).toContain(
      'TOO_MUCH_PASTA',
    );
  });
});
