import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { CrawlStore, StoredAllerhandeRecipe } from './crawl';

/**
 * One JSON file per recipe, under a directory that git ignores.
 *
 * Plain files so a run can be stopped at any moment and resumed, and so the
 * owner can see exactly what was copied. Written via a temp file and a rename,
 * so an interrupted write never leaves half a recipe behind.
 */
export function fileStore(directory: string): CrawlStore & {
  all(): StoredAllerhandeRecipe[];
} {
  mkdirSync(directory, { recursive: true });
  const fileOf = (id: string) => join(directory, `${id}.json`);
  return {
    has: (id) => existsSync(fileOf(id)),
    save(record) {
      const target = fileOf(record.recipeId);
      writeFileSync(`${target}.tmp`, JSON.stringify(record, null, 2), 'utf8');
      renameSync(`${target}.tmp`, target);
    },
    all() {
      return readdirSync(directory)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map(
          (name) =>
            JSON.parse(readFileSync(join(directory, name), 'utf8')) as StoredAllerhandeRecipe,
        );
    },
  };
}
