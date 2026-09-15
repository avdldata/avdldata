import { existsSync, readFileSync } from 'node:fs';
import type {
  ExternalRecipeCandidate,
  RecipeCandidateProvider,
  RecipeSource,
} from '../candidate-types';
import { parseIngredientLine } from '../ingredient-line';

/**
 * recipe-dataset — 13.000 modern recipes, scraped from Epicurious.
 *
 * Structurally the second-best corpus we can reach: real ingredient lines with
 * real amounts, written the way a modern cook writes them ("2 Tbsp. finely
 * chopped sage"). Rich enough that the unit parser earns its keep.
 *
 * ## The licence is the problem, and it is not a small one
 *
 * The repository's README says the data was scraped from the Epicurious
 * website, uploaded to Kaggle by a third party, and re-published here with the
 * text unchanged. None of those steps creates a licence. Whatever the
 * repository states about its own terms, the underlying recipe text belongs to
 * Condé Nast, and a downstream repackaging cannot grant rights the packager
 * never had.
 *
 * So this corpus is classified `UNKNOWN`, which bars it from becoming a
 * production recipe at the type level rather than by anyone remembering. What
 * it is genuinely good for, and what it is used for here:
 *
 *   - discovering which ingredients modern dinners actually use, and how often
 *   - measuring how well the unit parser copes with real ingredient lines
 *
 * Both are analysis over facts, not reproduction of expression.
 */

export const EPICURIOUS_SOURCE: RecipeSource = {
  id: 'recipe-dataset',
  name: 'recipe-dataset (13k, Epicurious via Kaggle)',
  url: 'https://github.com/josephrmartinez/recipe-dataset',
  // Not the repository's own claim. The chain of title runs back to a scrape of
  // a commercial site, and a scrape does not create a licence to redistribute.
  rights: 'UNKNOWN',
  licenseStated: 'repo noemt CC BY-SA 3.0; onderliggende tekst is Epicurious-scrape',
  attribution: 'Analysebron: recipe-dataset (Epicurious via Kaggle) — niet voor publicatie',
  mayReproduceText: false,
};

/** One CSV row, honouring quotes and embedded newlines. */
function* parseCsv(text: string): Generator<string[]> {
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      yield row;
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/** The Ingredients column is a Python list literal. */
function parsePythonList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[')) return [];
  const out: string[] = [];
  for (const match of trimmed.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
    const item = (match[1] ?? match[2] ?? '').replace(/\\(['"\\])/g, '$1');
    if (item.trim() !== '') out.push(item.trim());
  }
  return out;
}

export class Epicurious13kProvider implements RecipeCandidateProvider {
  readonly source = EPICURIOUS_SOURCE;

  constructor(private readonly file = 'data/recipes/candidates/recipe-dataset/13k-recipes.csv') {}

  loadCandidates(): ExternalRecipeCandidate[] {
    if (!existsSync(this.file)) return [];
    const rows = parseCsv(readFileSync(this.file, 'utf8'));
    const header = rows.next().value as string[] | undefined;
    if (!header) return [];
    const col = (name: string) => header.indexOf(name);
    const titleAt = col('Title');
    const cleanedAt = col('Cleaned_Ingredients');
    const rawAt = col('Ingredients');
    const idAt = 0;

    const out: ExternalRecipeCandidate[] = [];
    for (const row of rows) {
      const title = (row[titleAt] ?? '').trim();
      if (title === '') continue;
      const lines = parsePythonList(row[cleanedAt] ?? row[rawAt] ?? '');
      if (lines.length === 0) continue;
      out.push({
        source: this.source.id,
        externalId: row[idAt] ?? title,
        sourceUrl: this.source.url,
        rights: this.source.rights,
        title,
        dietaryTags: [],
        tags: [],
        ingredients: lines.map(parseIngredientLine),
        // Instructions are deliberately not carried. The licence does not
        // allow reproducing them, and a field that exists is a field that
        // eventually gets rendered.
        attribution: this.source.attribution,
        raw: {},
      });
    }
    return out;
  }
}
