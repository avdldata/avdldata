import type { ManualOverride } from '@/domain/ingestion/match-ingredient';

/**
 * Decisions a human made about a specific product.
 *
 * These outrank every automatic rule and are never recomputed. That is the
 * whole point: someone looked at a product, decided, and that decision has to
 * survive the next import, the next vocabulary change, and the next rewrite of
 * the matcher. An approval that quietly disappears when a rule changes is worse
 * than no review flow at all, because the reviewer's time is spent twice.
 *
 * Keyed by the external product id, which for the Checkjebon source is the
 * chain-prefixed link suffix — stable across imports, unlike the display name.
 *
 * Empty today, and that is the honest state: the review queue exists
 * (`pnpm match:review`) and nothing has been reviewed by hand yet. Entries
 * belong here as they are decided, one line each.
 */
export const PRODUCT_MATCH_OVERRIDES: readonly ManualOverride[] = [
  /*
   * Baby corn is corn, and it is the only corn Albert Heijn's feed carries in a
   * form a recipe can use — everything else matching "mais" is popcorn, a snack
   * or a bread. The automatic rules cannot know that "baby" is acceptable here
   * and not elsewhere, so a human decided it once and it stays decided.
   */
  {
    productId: 'ah:wi397324/valle-del-sole-baby-mais',
    canonicalIngredientId: 'mais',
    status: 'APPROVED',
  },
];
