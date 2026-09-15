/**
 * The staging model for recipes that come from somewhere else.
 *
 * Nothing in here is a production recipe. A candidate is a *claim* by an
 * external corpus that some dish exists and is made of certain things, and the
 * pipeline's whole job is to decide which of those claims are good enough to
 * become a `Recipe` — with our nutrition, our canonical ingredients and our
 * portion model.
 *
 * Three separations are deliberate.
 *
 * **Source-neutral.** Nothing downstream of a provider knows whether a
 * candidate came from a GitHub repo, a CSV or an API. Adding a corpus is one
 * adapter and nothing else.
 *
 * **Licence travels with the data.** Every candidate carries where it came
 * from and under what terms, permanently. A corpus that cannot be published
 * commercially must still be usable for analysis, and the only way to keep both
 * true is to never lose the label.
 *
 * **External nutrition is not authoritative.** It is kept as a validation
 * signal and never as a value. Our own canonical nutrition is what the planner
 * uses, computed from canonical ingredients and normalised quantities.
 */

/** What we are allowed to do with a corpus. Ordered from freest to most bound. */
export type SourceRights =
  /** No copyright, or expired. Usable anywhere, attribution polite not required. */
  | 'PUBLIC_DOMAIN'
  /** Explicitly dedicated to the public domain. */
  | 'CC0'
  /** Attribution required. */
  | 'CC_BY'
  /** Attribution required and derivatives must share alike. */
  | 'CC_BY_SA'
  /** Research and education only. Never a production recipe. */
  | 'NON_COMMERCIAL_RESEARCH'
  /** We could not establish the terms. Never a production recipe. */
  | 'UNKNOWN';

/**
 * May a corpus supply a recipe that ships in the product?
 *
 * `UNKNOWN` and `NON_COMMERCIAL_RESEARCH` are barred at this boundary rather
 * than by a reviewer remembering: a licence problem that depends on someone
 * noticing is a licence problem waiting to happen.
 */
export function mayBecomeProduction(rights: SourceRights): boolean {
  return rights !== 'UNKNOWN' && rights !== 'NON_COMMERCIAL_RESEARCH';
}

/** Whether a corpus may be *published* commercially, which is a stricter test. */
export function mayBePublishedCommercially(rights: SourceRights): boolean {
  return rights === 'PUBLIC_DOMAIN' || rights === 'CC0' || rights === 'CC_BY';
}

export interface RecipeSource {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly rights: SourceRights;
  /** The licence exactly as the corpus states it, before our classification. */
  readonly licenseStated: string;
  /** What has to appear wherever a recipe from this corpus is shown. */
  readonly attribution: string;
  /**
   * Whether the corpus's own instruction text may be reproduced.
   *
   * False for anything we cannot licence, and then the recipe needs its own
   * instructions written from the normalised structure — with the lineage kept.
   */
  readonly mayReproduceText: boolean;
}

/** One ingredient line, as the corpus wrote it. */
export interface CandidateIngredient {
  /** The whole line, untouched. The only field guaranteed to exist. */
  readonly rawText: string;
  /** The corpus's own name field, when it has one separate from the line. */
  readonly rawName?: string;
  readonly quantity?: number;
  readonly unit?: string;
  /** "finely chopped", "drained", "room temperature". */
  readonly preparation?: string;
}

/** One recipe, as a corpus describes it. Nothing computed, nothing corrected. */
export interface ExternalRecipeCandidate {
  readonly source: string;
  readonly externalId: string;
  readonly sourceUrl: string;
  readonly rights: SourceRights;
  readonly title: string;
  readonly servings?: number;
  readonly prepMinutes?: number;
  readonly cookMinutes?: number;
  readonly cuisine?: string;
  readonly mealType?: string;
  readonly dietaryTags: readonly string[];
  readonly tags: readonly string[];
  readonly ingredients: readonly CandidateIngredient[];
  /** Only when the licence allows reproducing it. */
  readonly directions?: readonly string[];
  readonly attribution: string;
  /** Whatever else the corpus said, so nothing is silently discarded. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/**
 * Everything a corpus adapter has to do.
 *
 * Loading from disk rather than the network, on purpose: the download is a
 * separate step with its own script, so the census and the selection can be
 * re-run a hundred times without touching anyone's servers.
 */
export interface RecipeCandidateProvider {
  readonly source: RecipeSource;
  loadCandidates(): ExternalRecipeCandidate[];
}
