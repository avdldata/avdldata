import { expect, test, type Page } from '@playwright/test';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';

/**
 * A rule you set is a rule the app keeps.
 *
 * Every test here sets something through the ordinary screens — a diet, an
 * allergy, a cuisine you never want, one supermarket — asks for a week, and
 * then checks the seven dishes against the recipe library. Not against what the
 * page says about itself: a screen that claims "vegetarisch" while serving
 * chicken is exactly the failure this is for.
 *
 * Each test puts the household back as it found it, because they share one demo
 * account with every other suite in this directory.
 */
const INGREDIENTS = buildIngredientIndex(SEED_INGREDIENTS);
const RECIPES = new Map(normaliseRecipes(SEED_RECIPES, INGREDIENTS).map((r) => [r.id, r]));

const ACTIVITY_LIGHT = 'Licht actief (1–2× sporten per week)';
const ACTIVITY_EXTREME = 'Extreem actief (zwaar werk of dagelijks sporten)';

async function signIn(page: Page): Promise<void> {
  // Playwright has no default action timeout, so a selector that matches
  // nothing waits fifteen minutes and then blames the test, not the selector.
  page.setDefaultTimeout(20_000);
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

function weekIds(page: Page): Promise<string[]> {
  return page
    .locator('li[data-recipe-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-recipe-id') ?? ''));
}

/**
 * Ask for a week under the rules as they stand now.
 *
 * A saved week keeps its dishes on purpose — changing a setting does not
 * silently rewrite the menu someone is cooking from. So to see a new rule
 * applied you press the button, which is also what a user does.
 */
async function newWeek(page: Page): Promise<string[]> {
  await page.goto('/week');
  const generate = page.locator('button[data-action="generate-week"]').first();
  if ((await generate.count()) > 0) {
    await generate.click();
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
      timeout: 180_000,
    });
    return weekIds(page);
  }

  const before = (await weekIds(page)).join();
  const button = page.locator('button[data-action="regenerate-week"]');
  await button.click();
  await expect(button).toBeEnabled({ timeout: 180_000 });
  await expect.poll(async () => (await weekIds(page)).join(), { timeout: 60_000 }).not.toBe(before);
  return weekIds(page);
}

/** The seven dishes as the library knows them, not as the page describes them. */
function dishes(ids: readonly string[]) {
  expect(ids.length, 'geen week op het scherm').toBe(7);
  return ids.map((id) => {
    const recipe = RECIPES.get(id);
    expect(recipe, `onbekend recept ${id}`).toBeDefined();
    return recipe!;
  });
}

/** Open one member's page by name and hand back the form. */
async function openMember(page: Page, name: string): Promise<void> {
  await page.goto('/gezin');
  await page
    .getByRole('link', { name: new RegExp(`^${name}\\b`) })
    .first()
    .click();
  await expect(page.getByLabel('Naam')).toHaveValue(name, { timeout: 30_000 });
}

async function setDiet(page: Page, name: string, diet: string): Promise<void> {
  await openMember(page, name);
  await page.getByLabel('Voedingswijze').selectOption({ label: diet });
  await page.getByRole('button', { name: 'Opslaan' }).first().click();
  await expect(page).toHaveURL(/\/gezin$/, { timeout: 60_000 });
}

async function toggleAllergen(page: Page, name: string, allergen: string): Promise<void> {
  await openMember(page, name);
  await page.getByRole('button', { name: allergen, exact: true }).click();
  await page.getByRole('button', { name: 'Opslaan' }).first().click();
  await expect(page).toHaveURL(/\/gezin$/, { timeout: 60_000 });
}

async function setCuisine(page: Page, cuisine: string, level: string): Promise<void> {
  await page.goto('/gezin/voorkeuren');
  await page.getByRole('radio', { name: `${cuisine}: ${level}`, exact: true }).click();
  const save = page.getByRole('button', { name: 'Voorkeuren opslaan' });
  await save.click();
  await expect(page.getByRole('status')).toContainText('opgeslagen', { timeout: 60_000 });
}

test.describe('what you tell the app, the app does', () => {
  test.describe.configure({ timeout: 900_000 });

  test('a cuisine set to "nooit" stops appearing', async ({ page }) => {
    await signIn(page);
    try {
      await setCuisine(page, 'Italiaans', 'Nooit');
      for (const dish of dishes(await newWeek(page))) {
        expect(dish.cuisine, `${dish.id} is Italiaans en stond op "nooit"`).not.toBe('italiaans');
      }
    } finally {
      // The demo household likes Italian; putting it back on neutral would be a
      // different household than every other suite expects.
      await setCuisine(page, 'Italiaans', 'Lekker');
    }
  });

  test('one vegetarian at the table makes the whole week vegetarian', async ({ page }) => {
    await signIn(page);
    try {
      await setDiet(page, 'Arjan', 'Vegetarisch');
      // The badge on the household page has to agree with what was saved.
      await expect(page.getByText('Vegetarisch').first()).toBeVisible();

      for (const dish of dishes(await newWeek(page))) {
        expect(dish.vegetarian, `${dish.id} is niet vegetarisch`).toBe(true);
      }
    } finally {
      await setDiet(page, 'Arjan', 'Eet alles');
    }
  });

  test('vegan is stricter than vegetarian, and the week follows', async ({ page }) => {
    await signIn(page);
    try {
      await setDiet(page, 'Arjan', 'Veganistisch');
      for (const dish of dishes(await newWeek(page))) {
        expect(dish.vegan, `${dish.id} is niet veganistisch`).toBe(true);
      }
    } finally {
      await setDiet(page, 'Arjan', 'Eet alles');
    }
  });

  test('an allergy is never traded away for a cheaper week', async ({ page }) => {
    await signIn(page);
    try {
      await toggleAllergen(page, 'Chimene', 'Melk / lactose');
      for (const dish of dishes(await newWeek(page))) {
        expect(dish.allergens, `${dish.id} bevat melk`).not.toContain('melk');
      }

      // And nothing on the shopping list may carry the allergen either. Read
      // from the catalogue, because the words do not tell you: "sojamelk" is
      // safe and "roomboter" is not.
      await page.goto('/boodschappen');
      const bought = await page
        .locator('li[data-ingredient-id]')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-ingredient-id') ?? ''));
      expect(bought.length, 'lege boodschappenlijst').toBeGreaterThan(0);
      for (const id of bought) {
        const ingredient = INGREDIENTS.get(id);
        expect(ingredient, `onbekend ingredient ${id}`).toBeDefined();
        expect(ingredient!.allergens, `${id} bevat melk`).not.toContain('melk');
      }
    } finally {
      await toggleAllergen(page, 'Chimene', 'Melk / lactose');
    }
  });

  test('one supermarket means one supermarket', async ({ page }) => {
    await signIn(page);
    try {
      await page.goto('/week/instellingen');
      await page.getByRole('button', { name: '1 winkel', exact: true }).click();
      await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
      await expect(page.getByRole('button', { name: /^Maak mijn week$/ })).toBeVisible({
        timeout: 60_000,
      });

      await newWeek(page);
      await page.goto('/winkels');
      const stores = await page.locator('main h2, main h3').allInnerTexts();
      const named = stores.filter((h) => /Albert Heijn|Jumbo|Lidl/.test(h));
      expect(new Set(named).size, `meer dan één winkel: ${named.join(', ')}`).toBeLessThanOrEqual(
        1,
      );

      // The shopping list has no chain tabs to offer either.
      await page.goto('/boodschappen');
      const tabs = await page.getByRole('tab').count();
      expect(tabs, 'winkelfilters bij één winkel').toBe(0);
    } finally {
      await page.goto('/week/instellingen');
      await page.getByRole('button', { name: 'Maakt niet uit', exact: true }).click();
      await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
      await expect(page.getByRole('button', { name: /^Maak mijn week$/ })).toBeVisible({
        timeout: 60_000,
      });
    }
  });

  test('a pregnant member silently rules out the dishes that are advised against', async ({
    page,
  }) => {
    await signIn(page);

    // The demo household has one pregnant member, so this is the state the app
    // is normally in — which is exactly why it is worth pinning.
    await page.goto('/gezin');
    await expect(page.getByText('zwanger').first()).toBeVisible();

    for (const dish of dishes(await newWeek(page))) {
      expect(dish.pregnancySuitable, `${dish.id} wordt afgeraden tijdens de zwangerschap`).toBe(
        true,
      );
    }

    // Said once, plainly, on the screens that carry the consequence — and never
    // as a medical claim.
    await expect(page.getByText(/geen medisch hulpmiddel/i).first()).toBeVisible();
    await page.goto('/gezin');
    await expect(page.getByText(/geen medisch hulpmiddel/i).first()).toBeVisible();
  });

  test('everyone at the table gets their own amount', async ({ page }) => {
    await signIn(page);
    await newWeek(page);
    await page.goto('/week/0');

    const portions = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    const factors = [...portions.matchAll(/([\d,]+) portie · ± (\d+) kcal/g)];
    expect(factors.length, 'porties per persoon ontbreken').toBe(2);
    for (const [, , kcal] of factors) {
      expect(Number(kcal), `onwaarschijnlijke portie: ${kcal} kcal`).toBeGreaterThan(200);
      expect(Number(kcal), `onwaarschijnlijke portie: ${kcal} kcal`).toBeLessThan(2000);
    }

    // The two demo adults happen to need almost exactly the same dinner — a
    // heavier man and a taller pregnant woman land within a few kcal of each
    // other — so equal portions here are correct, not a bug. Make them differ
    // and the amounts have to follow, per person and per ingredient.
    try {
      await openMember(page, 'Arjan');
      await page.getByLabel('Hoe actief?').selectOption({ label: ACTIVITY_EXTREME });
      await page.getByRole('button', { name: 'Opslaan' }).first().click();
      await expect(page).toHaveURL(/\/gezin$/, { timeout: 60_000 });

      // A saved week keeps the portions it was saved with, which is the whole
      // point of saving it. New needs reach the plate on the next week.
      await newWeek(page);
      await page.goto('/week/0');
      const after = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      const changed = [...after.matchAll(/([\d,]+) portie · ± (\d+) kcal/g)].map((f) => f[1]);
      expect(changed.length).toBe(2);
      expect(new Set(changed).size, `beide ${changed[0]} portie`).toBe(2);

      // And the ingredient lines split the pan the same way, by name.
      const line = page.locator('li', { hasText: /Arjan .* · Chimene / }).first();
      const text = (await line.innerText()).replace(/\s+/g, ' ');
      const amounts = [...text.matchAll(/(?:Arjan|Chimene) (\d+(?:,\d+)?) ?(?:g|ml|stuk)/g)].map(
        (m) => m[1],
      );
      expect(amounts.length, `geen persoonlijke hoeveelheden in "${text}"`).toBe(2);
      expect(new Set(amounts).size, `beide ${amounts[0]} in "${text}"`).toBe(2);
    } finally {
      await openMember(page, 'Arjan');
      await page.getByLabel('Hoe actief?').selectOption({ label: ACTIVITY_LIGHT });
      await page.getByRole('button', { name: 'Opslaan' }).first().click();
      await expect(page).toHaveURL(/\/gezin$/, { timeout: 60_000 });
    }
  });
});
