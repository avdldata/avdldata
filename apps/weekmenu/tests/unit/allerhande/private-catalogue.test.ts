import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { convertAllerhandeRecipe } from '@/services/recipes/allerhande/convert';

/**
 * Private recipes reach the planner only when the owner points the app at them.
 *
 * No variable, no private recipes — which is what every test run, every CI
 * build and every deployment sees. With the variable, they join the library;
 * with a variable that points nowhere, the app says so instead of quietly
 * planning without them.
 */
const ingredients = buildIngredientIndex(SEED_INGREDIENTS);

function privateRecipeFile(): { path: string; id: string; cleanup: () => void } {
  const converted = convertAllerhandeRecipe(
    {
      recipeId: 'R-R9990002',
      url: 'https://www.ah.nl/allerhande/recept/R-R9990002/test',
      fetchedAt: '2026-09-24T10:00:00.000Z',
      recipe: {
        '@type': 'Recipe',
        name: 'Testrecept met kip',
        totalTime: 'PT25M',
        recipeYield: '2',
        recipeCategory: 'hoofdgerecht',
        recipeIngredient: [
          '300 g kipdijfilet',
          '1 ui',
          '400 g broccoli',
          '150 g rijst',
          '1 el olijfolie',
        ],
        recipeInstructions: [{ text: 'Kook de rijst.' }, { text: 'Bak de rest.' }],
      },
    },
    ingredients,
  );
  if (!converted.ok) throw new Error(JSON.stringify(converted.rejections));
  const directory = mkdtempSync(join(tmpdir(), 'private-recipes-'));
  const path = join(directory, 'recipes.json');
  const library = { ...converted.authored, id: 'kip-broccoli-rijst' }; // would collide
  const notPrivate = {
    ...converted.authored,
    id: 'ah-9990003',
    provenance: { ...converted.authored.provenance, licence: 'UNKNOWN' },
  };
  writeFileSync(path, JSON.stringify([converted.authored, library, notPrivate]), 'utf8');
  return {
    path,
    id: converted.authored.id,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function catalogue() {
  vi.resetModules();
  return (await import('@/services/catalogue')).getCatalogue();
}

describe('de privé-catalogus', () => {
  it('bestaat niet zonder de variabele', async () => {
    vi.stubEnv('WEEKMENU_PRIVATE_RECIPES', '');
    const recipes = (await catalogue()).recipes;
    expect(recipes.some((r) => r.provenance.licence === 'PRIVATE_USE')).toBe(false);
  });

  it('voegt privé-recepten toe als de eigenaar ernaar verwijst', async () => {
    const file = privateRecipeFile();
    try {
      vi.stubEnv('WEEKMENU_PRIVATE_RECIPES', file.path);
      const recipes = (await catalogue()).recipes;
      const imported = recipes.filter((r) => r.provenance.licence === 'PRIVATE_USE');

      expect(imported.map((r) => r.id)).toEqual([file.id]);
      // Een privé-recept overschrijft nooit een recept uit de bibliotheek, en
      // alleen wat de import als privé markeerde komt binnen.
      const library = recipes.find((r) => r.id === 'kip-broccoli-rijst');
      expect(library?.provenance.licence).not.toBe('PRIVATE_USE');
      expect(recipes.some((r) => r.id === 'ah-9990003')).toBe(false);
    } finally {
      file.cleanup();
    }
  });

  it('zegt het hardop als de variabele naar niets wijst', async () => {
    vi.stubEnv('WEEKMENU_PRIVATE_RECIPES', join(tmpdir(), 'bestaat-niet', 'recipes.json'));
    await expect(catalogue()).rejects.toThrow(/WEEKMENU_PRIVATE_RECIPES/);
  });
});
