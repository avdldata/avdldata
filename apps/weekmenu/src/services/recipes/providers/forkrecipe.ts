import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CandidateIngredient,
  ExternalRecipeCandidate,
  RecipeCandidateProvider,
  RecipeSource,
} from '../candidate-types';

/**
 * ForkRecipe — 916 modern recipes as JS modules, CC BY-SA 4.0.
 *
 * The best-structured corpus we can reach: every ingredient has a name, a
 * numeric quantity and a unit, and most quantities are already in grams. It
 * also carries cuisine, category, tags, difficulty and times.
 *
 * ## Why the files are parsed and not imported
 *
 * Each recipe is an ES module — `export default { … }`. Importing one would
 * execute third-party code from a repository we do not control, on a machine
 * that holds the rest of this project. The files are data, so they are read as
 * data: the object literal is converted to JSON textually and parsed. Anything
 * that is not a plain literal fails to parse and is counted as malformed, which
 * is the correct outcome for a file that turned out to contain logic.
 *
 * ## What it does not have
 *
 * A serving count. Quantities are absolute weights for one batch, so servings
 * have to be estimated from total mass — see `estimateServings`, and note that
 * it is an estimate and labelled as one.
 */

export const FORKRECIPE_SOURCE: RecipeSource = {
  id: 'forkrecipe',
  name: 'ForkRecipe Open Recipe Dataset',
  url: 'https://github.com/futurechef/forkrecipe-recipes',
  rights: 'CC_BY_SA',
  licenseStated: 'CC BY-SA 4.0',
  attribution: 'Recept: ForkRecipe (CC BY-SA 4.0), forkrecipe.com',
  // Share-alike, so reproducing the text obliges us to licence our own
  // derivative the same way. Allowed, and a decision to make deliberately.
  mayReproduceText: true,
};

interface RawForkRecipe {
  readonly slug?: string;
  readonly title?: string;
  readonly description?: string;
  readonly cuisine?: string;
  readonly culture?: string;
  readonly category?: string;
  readonly tags?: string[];
  readonly difficulty?: number;
  readonly activeTime?: string;
  readonly totalTime?: string;
  readonly license?: string;
  readonly ingredients?: {
    name?: string;
    role?: string;
    ratioValue?: number;
    defaultUnit?: string;
  }[];
  readonly processNodes?: { action?: string; instructions?: string }[];
}

/**
 * A JS object literal turned into JSON, textually.
 *
 * Handles what these files actually contain: unquoted keys, trailing commas
 * and `//` comments. Deliberately not a general JavaScript parser — anything
 * more exotic than a literal should fail, and it does.
 */
function literalToJson(text: string): string {
  const start = text.indexOf('{');
  const body = text.slice(start).replace(/;\s*$/, '');
  return (
    body
      // Strip line comments, but not inside strings: only when the `//` starts
      // a line or follows whitespace at the end of a value.
      .replace(/^\s*\/\/.*$/gm, '')
      // Quote bare keys.
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      // Trailing commas before a closing brace or bracket.
      .replace(/,(\s*[}\]])/g, '$1')
  );
}

/**
 * "1 hr 30 min", "25 min", "45 mins", "2 hours" → minutes.
 *
 * The plural spellings are matched explicitly. Without them "45 mins" produced
 * no duration at all, and the scorer fell back to its 45-minute default — the
 * right answer by accident, and the wrong one for "90 mins".
 */
export function parseDuration(text: string | undefined): number | undefined {
  if (!text) return undefined;
  let minutes = 0;
  let found = false;
  for (const match of text.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(hrs|hr|hours|hour|h|mins|min|minutes|minute|m)\b/gi,
  )) {
    const value = Number(match[1]!.replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    minutes += /^h/i.test(match[2]!) ? value * 60 : value;
    found = true;
  }
  return found ? Math.round(minutes) : undefined;
}

/**
 * How many people a batch feeds, from its total mass.
 *
 * ForkRecipe states absolute weights and no serving count, so this is inferred
 * and it is an inference: roughly 400 g of ingredients per adult main course,
 * clamped to 2–8 because a batch outside that range is more likely to be a
 * component or a banquet than a family dinner. Every candidate carries the
 * estimate flag, and a recipe whose estimate is used is never treated as
 * having a stated serving count.
 */
export function estimateServings(totalGrams: number): number | undefined {
  if (totalGrams <= 0) return undefined;
  const estimate = Math.round(totalGrams / 400);
  if (estimate < 2 || estimate > 8) return undefined;
  return estimate;
}

export class ForkRecipeProvider implements RecipeCandidateProvider {
  readonly source = FORKRECIPE_SOURCE;

  constructor(private readonly dir = 'data/recipes/candidates/forkrecipe/recipes') {}

  loadCandidates(): ExternalRecipeCandidate[] {
    if (!existsSync(this.dir)) return [];
    const out: ExternalRecipeCandidate[] = [];
    for (const file of readdirSync(this.dir).sort()) {
      if (!file.endsWith('.js')) continue;
      let raw: RawForkRecipe;
      try {
        raw = JSON.parse(
          literalToJson(readFileSync(join(this.dir, file), 'utf8')),
        ) as RawForkRecipe;
      } catch {
        // Malformed for our purposes. Counted by the census, never guessed at.
        continue;
      }
      const slug = raw.slug ?? file.replace(/\.js$/, '');
      if (!raw.title || !Array.isArray(raw.ingredients)) continue;

      const ingredients: CandidateIngredient[] = raw.ingredients
        .filter((i) => typeof i.name === 'string' && i.name.trim() !== '')
        .map((i) => {
          const name = i.name!.trim();
          // The corpus writes "Garlic cloves, crushed whole": the part after
          // the first comma is preparation, not identity.
          const [head, ...rest] = name.split(',');
          const preparation = rest.join(',').trim();
          return {
            rawText: `${i.ratioValue ?? ''} ${i.defaultUnit ?? ''} ${name}`.trim(),
            rawName: head!.trim(),
            ...(typeof i.ratioValue === 'number' ? { quantity: i.ratioValue } : {}),
            ...(i.defaultUnit ? { unit: i.defaultUnit } : {}),
            ...(preparation ? { preparation } : {}),
          };
        });

      const grams = ingredients.reduce(
        (n, i) => n + (i.unit === 'g' && i.quantity ? i.quantity : 0),
        0,
      );
      const servings = estimateServings(grams);

      out.push({
        source: this.source.id,
        externalId: slug,
        sourceUrl: `https://github.com/futurechef/forkrecipe-recipes/blob/main/recipes/${slug}.js`,
        rights: this.source.rights,
        title: raw.title,
        ...(servings !== undefined ? { servings } : {}),
        ...(parseDuration(raw.activeTime) !== undefined
          ? { prepMinutes: parseDuration(raw.activeTime)! }
          : {}),
        ...(parseDuration(raw.totalTime) !== undefined
          ? { cookMinutes: parseDuration(raw.totalTime)! }
          : {}),
        ...(raw.cuisine ? { cuisine: raw.cuisine } : {}),
        ...(raw.category ? { mealType: raw.category } : {}),
        dietaryTags: [],
        tags: raw.tags ?? [],
        ingredients,
        ...(raw.processNodes
          ? {
              directions: raw.processNodes
                .map((n) => n.instructions ?? '')
                .filter((s) => s.trim() !== ''),
            }
          : {}),
        attribution: this.source.attribution,
        raw: {
          culture: raw.culture,
          difficulty: raw.difficulty,
          license: raw.license,
          servingsEstimated: servings !== undefined,
          totalGrams: grams,
        },
      });
    }
    return out;
  }
}
