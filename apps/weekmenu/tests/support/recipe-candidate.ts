import type { ExternalRecipeCandidate } from '@/services/recipes/candidate-types';
import { parseIngredientLine } from '@/services/recipes/ingredient-line';

/**
 * A candidate built from ingredient lines, for tests that care about one rule.
 *
 * Defaults are deliberately neutral — public domain, no cuisine, no category —
 * so a test that does not set a field is not quietly relying on it.
 */
export function candidate(
  title: string,
  lines: readonly string[],
  overrides: Partial<ExternalRecipeCandidate> = {},
): ExternalRecipeCandidate {
  return {
    source: 'test',
    externalId: title.toLowerCase().replace(/\s+/g, '-'),
    sourceUrl: 'https://example.invalid/test',
    rights: 'PUBLIC_DOMAIN',
    title,
    dietaryTags: [],
    tags: [],
    ingredients: lines.map(parseIngredientLine),
    attribution: 'test',
    raw: {},
    ...overrides,
  };
}
