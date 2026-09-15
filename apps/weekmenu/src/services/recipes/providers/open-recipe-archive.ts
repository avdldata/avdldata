import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CandidateIngredient,
  ExternalRecipeCandidate,
  RecipeCandidateProvider,
  RecipeSource,
} from '../candidate-types';

/**
 * Open Recipe Archive — 54.843 recipes from pre-1931 cookbooks, public domain.
 *
 * By far the largest corpus we can reach, and by far the freest licence. It is
 * also, for a Dutch weekday dinner planner, mostly unusable, and the census
 * says so with numbers rather than adjectives.
 *
 * The reason is in the data. A record's ingredients are a Markdown bullet list
 * written the way 1874 wrote them:
 *
 *     - one water squash
 *     - milk
 *     - salt
 *     - one spoonful of wheat flour
 *
 * No amounts for two of those, a "spoonful" for the third, and "one water
 * squash" for the fourth. A planner that has to add Monday's grams to
 * Wednesday's cannot do anything with that, and inventing the missing numbers
 * is precisely the kind of guess this project refuses everywhere else.
 *
 * So the adapter parses honestly and lets the scoring reject on missing
 * quantities. The corpus stays valuable for two things it is genuinely good at:
 * ingredient vocabulary, and a licence-safe fallback if the better-structured
 * corpora ever become unusable.
 */

export const ORA_SOURCE: RecipeSource = {
  id: 'open-recipe-archive',
  name: 'Open Recipe Archive',
  url: 'https://github.com/AdamBouhmad/open-recipe-archive',
  rights: 'PUBLIC_DOMAIN',
  licenseStated: 'public-domain (pre-1931 cookbooks)',
  attribution: 'Recept: Open Recipe Archive, publiek domein',
  mayReproduceText: true,
};

interface RawOraRecipe {
  readonly title?: string;
  readonly slug?: string;
  readonly collection?: string;
  readonly collection_name?: string;
  readonly culture?: string;
  readonly body?: string;
  readonly source_title?: string;
  readonly source_url?: string;
  readonly source_year?: string;
  readonly license?: string;
  readonly tags?: string[];
}

/** Leading amounts an 1870s cookbook actually writes. */
const WORD_NUMBERS: Readonly<Record<string, number>> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  half: 0.5,
};

/**
 * One bullet from the ingredients block.
 *
 * A quantity is only recorded when the line actually opens with one. "milk" on
 * its own gets no quantity and no unit, and stays that way: a default of one
 * would be a number nobody wrote.
 */
export function parseOraIngredient(line: string): CandidateIngredient {
  const rawText = line.replace(/^[-*]\s*/, '').trim();
  const match = /^(\d+(?:[./]\d+)?|[a-z]+)\s+(.*)$/i.exec(rawText);
  if (!match) return { rawText };

  const head = match[1]!.toLowerCase();
  const rest = match[2]!;
  let quantity: number | undefined;
  if (/^\d/.test(head)) {
    const fraction = /^(\d+)\/(\d+)$/.exec(head);
    quantity = fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(head);
  } else if (head in WORD_NUMBERS) {
    quantity = WORD_NUMBERS[head];
  }
  if (quantity === undefined || !Number.isFinite(quantity)) return { rawText };

  // "spoonful of wheat flour", "cups of milk", "pounds of beef"
  const unitMatch =
    /^(spoonfuls?|tablespoonfuls?|teaspoonfuls?|cupfuls?|cups?|pounds?|lbs?|ounces?|oz|pints?|quarts?|gills?|drams?)\s+(?:of\s+)?(.*)$/i.exec(
      rest,
    );
  if (unitMatch) {
    return {
      rawText,
      rawName: unitMatch[2]!.trim(),
      quantity,
      unit: unitMatch[1]!.toLowerCase(),
    };
  }
  return { rawText, rawName: rest.trim(), quantity };
}

export class OpenRecipeArchiveProvider implements RecipeCandidateProvider {
  readonly source = ORA_SOURCE;

  constructor(
    private readonly dir = 'data/recipes/candidates/open-recipe-archive',
    /** The census reads everything; selection can cap it to stay quick. */
    private readonly limitPerCollection = Number.POSITIVE_INFINITY,
  ) {}

  loadCandidates(): ExternalRecipeCandidate[] {
    if (!existsSync(this.dir)) return [];
    const out: ExternalRecipeCandidate[] = [];
    for (const file of readdirSync(this.dir).sort()) {
      if (!file.endsWith('.jsonl')) continue;
      const lines = readFileSync(join(this.dir, file), 'utf8').split('\n');
      let taken = 0;
      for (const line of lines) {
        if (line.trim() === '' || taken >= this.limitPerCollection) continue;
        let raw: RawOraRecipe;
        try {
          raw = JSON.parse(line) as RawOraRecipe;
        } catch {
          continue;
        }
        if (!raw.title || !raw.body) continue;
        taken += 1;

        const ingredientBlock = /##\s*Ingredients\s*\n([\s\S]*?)(?:\n##|$)/i.exec(raw.body);
        const directionBlock = /##\s*Directions\s*\n([\s\S]*?)(?:\n##|$)/i.exec(raw.body);
        const ingredients = (ingredientBlock?.[1] ?? '')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('-') || l.startsWith('*'))
          .map(parseOraIngredient);

        out.push({
          source: this.source.id,
          externalId: `${raw.collection ?? file.replace(/\.jsonl$/, '')}/${raw.slug ?? raw.title}`,
          sourceUrl: raw.source_url ?? this.source.url,
          rights: this.source.rights,
          title: raw.title,
          dietaryTags: [],
          tags: raw.tags ?? [],
          ingredients,
          ...(directionBlock
            ? {
                directions: directionBlock[1]!
                  .split('\n')
                  .map((l) => l.replace(/^\d+\.\s*/, '').trim())
                  .filter((l) => l !== ''),
              }
            : {}),
          ...(raw.culture ? { cuisine: raw.culture } : {}),
          attribution:
            `Recept: ${raw.source_title ?? 'onbekend'} (${raw.source_year ?? 'onbekend jaar'}), ` +
            'publiek domein, via Open Recipe Archive',
          raw: {
            collection: raw.collection,
            collectionName: raw.collection_name,
            sourceTitle: raw.source_title,
            sourceYear: raw.source_year,
            license: raw.license,
          },
        });
      }
    }
    return out;
  }
}
