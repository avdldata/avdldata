import { expect, test, type Page } from '@playwright/test';
import { SEED_RECIPES } from '../../src/data/seed/recipes';

/**
 * What the screens say, read as a person would read them.
 *
 * Two failure modes this guards against, and both are easy to ship without
 * noticing. The first is arithmetic leaking through the page — `183.333333 g`
 * is the internal number, not an amount anyone weighs. The second is our own
 * vocabulary leaking through: `canonical`, `provider`, `candidate pool` are
 * words from the engine room, and a cook should never meet them.
 */
const ENGINE_WORDS =
  /\b(optimizer|canonical|candidate pool|eligibility|provider|provenance|INCOMPLETE_BASKET|NO_PRODUCTS|UNAVAILABLE|undefined|NaN)\b/;

/** Any number with three or more decimals, which is never a real quantity. */
const RAW_DECIMALS = /\d+[.,]\d{3,}/;

/**
 * The internal identifiers of one dish: its own id and those of its
 * ingredients.
 *
 * Checking for the ids we actually have beats checking for anything that looks
 * like one. A slug shape catches Dutch as readily as it catches an id —
 * "garam-masala-achtige" is a cook's word, "aardappel-bloemkoolcurry" is a
 * dish's name — and the false alarms teach you to ignore the check.
 *
 * Only hyphenated ids are worth looking for: a one-word id like
 * `bloemkoolcurry` is a word of the dish's own name, so it is on the page by
 * design and finding it proves nothing.
 */
function internalIdsOn(main: string, recipeId: string): string[] {
  const recipe = SEED_RECIPES.find((r) => r.id === recipeId);
  const ids = [recipeId, ...(recipe?.ingredients.map((i) => i.ingredientId) ?? [])];
  return ids.filter(
    // Bounded by something that is neither a letter nor a hyphen, so
    // `garam-masala` is not "found" inside `garam-masala-achtige`.
    (id) => id.includes('-') && new RegExp(`(?<![\\w-])${id}(?![\\w-])`).test(main),
  );
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

/** The dishes currently on the week page, in the order they are shown. */
function weekIds(page: Page): Promise<string[]> {
  return page
    .locator('li[data-recipe-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-recipe-id') ?? ''));
}

/**
 * Ask for another week, and wait until it is really on the page.
 *
 * Two traps here, both of which quietly turn "seven new dishes" into "the same
 * seven again". The button re-enables when its transition ends, but the
 * refreshed cards arrive a beat later, so the ids have to be polled rather than
 * read once. And the list of dishes already shown lives in the button's own
 * state: navigating away resets it, the app goes back to offering its best week
 * first, and pressing around a navigation gives A, B, A, B for ever. So this
 * never navigates — it presses where it stands.
 */
async function regenerate(page: Page): Promise<string[]> {
  const before = (await weekIds(page)).join();
  const button = page.locator('button[data-action="regenerate-week"]');
  await button.click();
  await expect(button).toBeEnabled({ timeout: 180_000 });
  await expect
    .poll(async () => (await weekIds(page)).join(), { timeout: 60_000 })
    .not.toBe(before);
  return weekIds(page);
}

async function ensureWeek(page: Page): Promise<void> {
  await page.goto('/week');
  const generate = page.locator('button[data-action="generate-week"]').first();
  if ((await generate.count()) > 0) await generate.click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 180_000 });
}

test.describe('the screens read like Dutch, not like a database', () => {
  test.describe.configure({ timeout: 900_000 });

  test('twenty recipe pages, each with amounts a person could weigh', async ({ page, context }) => {
    await signIn(page);
    await ensureWeek(page);

    // Twenty different dishes, reached the way a user reaches them: by putting
    // them in a week. The week page has to stay open between presses (see
    // `regenerate`), so a second tab does the reading — same session, same
    // stored week, and the button keeps counting.
    const reader = await context.newPage();
    const seen = new Set<string>();
    const problems: string[] = [];

    for (let round = 0; round < 6 && seen.size < 20; round += 1) {
      const ids = round === 0 ? await weekIds(page) : await regenerate(page);

      for (let day = 0; day < ids.length && seen.size < 20; day += 1) {
        if (seen.has(ids[day]!)) continue;
        seen.add(ids[day]!);

        await reader.goto(`/week/${day}`);
        const main = (await reader.locator('main').innerText()).replace(/\s+/g, ' ');

        if (RAW_DECIMALS.test(main)) {
          problems.push(`${ids[day]}: ruwe decimaal ${main.match(RAW_DECIMALS)?.[0]}`);
        }
        if (ENGINE_WORDS.test(main)) {
          problems.push(`${ids[day]}: motorwoord ${main.match(ENGINE_WORDS)?.[0]}`);
        }
        for (const leaked of internalIdsOn(main, ids[day]!)) {
          problems.push(`${ids[day]}: interne id op het scherm: ${leaked}`);
        }
        // Every dish names its ingredients and its steps.
        expect(
          await reader.locator('ol > li').count(),
          `${ids[day]} heeft geen stappen`,
        ).toBeGreaterThanOrEqual(2);
        expect(main, `${ids[day]} noemt geen hoeveelheid`).toMatch(/\d+\s?(g|ml|stuk)/);
        // And what each person gets, which is the reason the app exists.
        expect(main, `${ids[day]} toont geen persoonlijke porties`).toMatch(/portie/i);
      }
    }

    await reader.close();
    expect(seen.size, 'te weinig verschillende recepten bekeken').toBeGreaterThanOrEqual(20);
    expect(problems).toEqual([]);
  });

  test('the shopping list says what to buy, where, and for how much', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    await page.goto('/boodschappen');

    const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(main).not.toMatch(ENGINE_WORDS);
    expect(main).not.toMatch(RAW_DECIMALS);
    // No canonical ingredient ids, which are kebab-case and look like slugs.
    expect(main, 'interne ingredient-id op de lijst').not.toMatch(/\b[a-z]+-[a-z]+-[a-z]+\b/);

    const lines = page.locator('li[data-item-key]');
    const count = await lines.count();
    expect(count).toBeGreaterThan(5);

    for (let i = 0; i < Math.min(count, 12); i += 1) {
      const text = (await lines.nth(i).innerText()).replace(/\s+/g, ' ');
      expect(text, `regel ${i}: geen aantal`).toMatch(/^\s*\d+×/);
      expect(text, `regel ${i}: geen verpakking`).toMatch(/per verpakking/);
      expect(text, `regel ${i}: geen prijs`).toMatch(/€\s?\d+[.,]\d{2}/);
    }

    // Grouped the way a shop is walked, and the shops are named.
    const headings = await page.locator('main h2, main h3').allInnerTexts();
    expect(headings.join(' ')).toMatch(/Groente|Vlees|Zuivel|Brood|Conserven|Kruiden/i);
    expect(main).toMatch(/Albert Heijn|Jumbo|Lidl/);
  });

  test('products land in a real category, not all in "overig"', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    await page.goto('/boodschappen');

    const groups = await page.locator('main section').evaluateAll((sections) =>
      sections.map((section) => ({
        heading: section.querySelector('h2, h3')?.textContent?.trim() ?? '',
        lines: section.querySelectorAll('li[data-item-key]').length,
      })),
    );
    const withLines = groups.filter((g) => g.lines > 0);
    expect(withLines.length, 'alles in één groep').toBeGreaterThan(2);

    const total = withLines.reduce((sum, g) => sum + g.lines, 0);
    const other = withLines.find((g) => /overig/i.test(g.heading))?.lines ?? 0;
    expect(other / total, 'te veel producten in "overig"').toBeLessThan(0.25);
  });

  test('the store choice is explained, and travel is not faked', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);
    await page.goto('/winkels');

    const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(main).not.toMatch(ENGINE_WORDS);
    expect(main).toMatch(/Albert Heijn|Jumbo|Lidl/);
    expect(main).toMatch(/€\s?\d+[.,]\d{2}/);
    expect(main, 'geen uitleg waarom deze winkels').toMatch(/Waarom deze verdeling/i);
    expect(main, 'reiskosten worden verzonnen').not.toMatch(/Reiskosten €\s?0,00/);
  });

  test('none of the recipes that cannot be bought is ever offered', async ({ page }) => {
    await signIn(page);
    await ensureWeek(page);

    // Established in Sprint 2: fourteen recipes name an ingredient no chain in
    // the snapshot sells. They stay in the library as records; the planner must
    // never reach them — not when generating, not when regenerating, and not in
    // the replacement list.
    const allIds = new Set(SEED_RECIPES.map((r) => r.id));
    const offered = new Set<string>();

    for (let round = 0; round < 3; round += 1) {
      for (const id of round === 0 ? await weekIds(page) : await regenerate(page)) {
        offered.add(id);
      }
    }

    await page.goto('/week/0/vervangen');
    await expect(
      page.getByRole('button', { name: /Kies dit gerecht|Vervang/i }).first(),
    ).toBeVisible({ timeout: 180_000 });
    for (const id of await page
      .locator('[data-recipe-id]')
      .evaluateAll((n) => n.map((e) => e.getAttribute('data-recipe-id') ?? ''))) {
      if (id) offered.add(id);
    }

    for (const id of offered) {
      expect(allIds.has(id), `onbekend recept aangeboden: ${id}`).toBe(true);
      expect(UNAVAILABLE.has(id), `recept zonder prijsdata aangeboden: ${id}`).toBe(false);
    }
    expect(offered.size).toBeGreaterThanOrEqual(14);
  });
});

/** The fourteen records whose ingredients no chain in the snapshot sells. */
const UNAVAILABLE = new Set([
  'linzensoep',
  'pompoensoep',
  'salade-blauwe-kaas',
  'shakshuka',
  'tofu-shakshuka-stijl',
  'tonijnsteak-groenten',
  'bulgur-gegrilde-groenten',
  'couscous-geroosterde-groenten',
  'geroosterde-groenten-couscous',
  'pasta-pesto-kip',
  'penne-arrabbiata',
  'garnalen-knoflookpasta',
  'thaise-rode-curry-kip',
  'burrito-bowl',
]);
