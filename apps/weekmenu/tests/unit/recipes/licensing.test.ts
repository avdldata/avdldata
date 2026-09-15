import { describe, expect, it } from 'vitest';
import {
  mayBecomeProduction,
  mayBePublishedCommercially,
  type SourceRights,
} from '@/services/recipes/candidate-types';
import { EPICURIOUS_SOURCE } from '@/services/recipes/providers/epicurious-13k';
import { FORKRECIPE_SOURCE } from '@/services/recipes/providers/forkrecipe';
import { ORA_SOURCE } from '@/services/recipes/providers/open-recipe-archive';

/**
 * The licence gate, tested as a gate.
 *
 * A licence problem that depends on someone remembering is a licence problem
 * waiting to happen, so the rule lives in one function and this file pins every
 * value it can be given. The `ALL_RIGHTS` list is exhaustive by construction:
 * adding a new `SourceRights` member without deciding what it may do breaks
 * compilation here rather than shipping quietly.
 */
const ALL_RIGHTS: readonly SourceRights[] = [
  'PUBLIC_DOMAIN',
  'CC0',
  'CC_BY',
  'CC_BY_SA',
  'NON_COMMERCIAL_RESEARCH',
  'UNKNOWN',
];

describe('mayBecomeProduction', () => {
  it('bars exactly the two categories we cannot licence', () => {
    expect(mayBecomeProduction('UNKNOWN')).toBe(false);
    expect(mayBecomeProduction('NON_COMMERCIAL_RESEARCH')).toBe(false);
  });

  it('admits the four we can', () => {
    for (const rights of ['PUBLIC_DOMAIN', 'CC0', 'CC_BY', 'CC_BY_SA'] as const) {
      expect(mayBecomeProduction(rights), rights).toBe(true);
    }
  });

  it('has an answer for every member of the union', () => {
    for (const rights of ALL_RIGHTS) {
      expect(typeof mayBecomeProduction(rights), rights).toBe('boolean');
      expect(typeof mayBePublishedCommercially(rights), rights).toBe('boolean');
    }
  });
});

describe('mayBePublishedCommercially', () => {
  it('is stricter than production use: share-alike does not pass', () => {
    expect(mayBecomeProduction('CC_BY_SA')).toBe(true);
    expect(mayBePublishedCommercially('CC_BY_SA')).toBe(false);
  });

  it('never permits publication where production use is already barred', () => {
    for (const rights of ALL_RIGHTS) {
      if (!mayBecomeProduction(rights)) {
        expect(mayBePublishedCommercially(rights), rights).toBe(false);
      }
    }
  });
});

describe('the corpora we actually read', () => {
  it('classifies the Epicurious scrape as UNKNOWN, whatever the repo claims', () => {
    expect(EPICURIOUS_SOURCE.rights).toBe('UNKNOWN');
    expect(EPICURIOUS_SOURCE.mayReproduceText).toBe(false);
    expect(mayBecomeProduction(EPICURIOUS_SOURCE.rights)).toBe(false);
    // The repository's own statement is kept, so the disagreement is visible
    // rather than erased.
    expect(EPICURIOUS_SOURCE.licenseStated).toMatch(/CC BY-SA 3\.0/);
  });

  it('keeps the public-domain archive free and the share-alike corpus bound', () => {
    expect(mayBePublishedCommercially(ORA_SOURCE.rights)).toBe(true);
    expect(mayBecomeProduction(FORKRECIPE_SOURCE.rights)).toBe(true);
    expect(mayBePublishedCommercially(FORKRECIPE_SOURCE.rights)).toBe(false);
  });

  it('carries an attribution string for every source', () => {
    for (const source of [ORA_SOURCE, FORKRECIPE_SOURCE, EPICURIOUS_SOURCE]) {
      expect(source.attribution.trim(), source.id).not.toBe('');
      expect(source.url, source.id).toMatch(/^https:\/\//);
    }
  });
});
