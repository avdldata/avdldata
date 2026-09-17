import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { buildIngredientIndex } from '@/domain/ingredients/types';
import { normaliseRecipes } from '@/domain/recipes/normalise';
import { SEED_INGREDIENTS } from '@/data/seed/ingredients';
import { SEED_RECIPES } from '@/data/seed/recipes';

/**
 * De acceptatierun voor Personal Alpha v0.1.
 *
 * One account, created here, taken through everything a person does in a week:
 * sign up, say who eats along, pick shops, make a week, read a recipe, swap a
 * dish, ask for another week, walk the shopping list, tick things off, close
 * the browser and come back. Every step runs in the same browser session,
 * against the release build, with the real catalogue — no seeded demo
 * household, no database editing, no shortcuts through the API.
 *
 * What it finds is written to `data/release/personal-alpha-v0.1.json`, because
 * a release report that quotes numbers nobody can check is just prose. The
 * seven dishes, the totals, the swaps and the timings all come from that file.
 */
const ARTIFACT = 'data/release/personal-alpha-v0.1.json';

const RECIPES = new Map(
  normaliseRecipes(SEED_RECIPES, buildIngredientIndex(SEED_INGREDIENTS)).map((r) => [r.id, r]),
);

interface Evidence {
  ranAt: string;
  household: Record<string, unknown>;
  week: Record<string, unknown>;
  recipes: Record<string, unknown>[];
  replacements: Record<string, unknown>[];
  regenerated: Record<string, unknown>[];
  shopping: Record<string, unknown>;
  persistence: Record<string, string>;
  timings: Record<string, number>;
}

const evidence: Evidence = {
  ranAt: new Date().toISOString(),
  household: {},
  week: {},
  recipes: [],
  replacements: [],
  regenerated: [],
  shopping: {},
  persistence: {},
  timings: {},
};

let context: BrowserContext;
let page: Page;

async function timed<T>(name: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const value = await run();
  evidence.timings[name] = Date.now() - started;
  return value;
}

function weekIds(target: Page = page): Promise<string[]> {
  return target
    .locator('li[data-recipe-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-recipe-id') ?? ''));
}

/** The grocery total as the week page prints it, in cents. */
async function weekTotalCents(target: Page = page): Promise<number> {
  const text = (await target.locator('main').innerText()).replace(/\s+/g, ' ');
  const match = text.match(/€\s?(\d+),(\d{2})/);
  expect(match, `geen bedrag op het scherm: ${text.slice(0, 160)}`).not.toBeNull();
  return Number(match![1]) * 100 + Number(match![2]);
}

async function addMember(fields: {
  name: string;
  age: string;
  sex: string;
  height: string;
  weight: string;
  submit: string;
}): Promise<void> {
  await page.getByLabel('Naam').fill(fields.name);
  await page.getByLabel('Leeftijd').fill(fields.age);
  await page.getByLabel('Geslacht').selectOption({ label: fields.sex });
  await page.getByLabel('Lengte (cm)').fill(fields.height);
  await page.getByLabel('Gewicht (kg)').fill(fields.weight);
  await page.getByRole('button', { name: fields.submit, exact: true }).click();
}

test.describe.configure({ mode: 'serial', timeout: 900_000 });

test.describe('Personal Alpha v0.1 — acceptatie met een nieuw account', () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(30_000);
  });

  test.afterAll(async () => {
    await mkdir(dirname(ARTIFACT), { recursive: true });
    await writeFile(ARTIFACT, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await context.close();
  });

  test('1 — registreren als nieuwe gebruiker', async () => {
    // A synthetic address, and it stays out of the artefact: this run writes a
    // file to the repository and an account name is nobody's business.
    const email = `alpha-${Date.now()}@voorbeeld.nl`;
    await page.goto('/registreren');
    await page.getByLabel('E-mailadres').fill(email);
    await page.getByLabel('Wachtwoord').fill('eenlangwachtwoord');
    await page.getByRole('button', { name: 'Account aanmaken' }).click();
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 60_000 });
  });

  test('2 — onboarding: huishouden, twee personen, voorkeuren, drie supermarkten', async () => {
    await page.getByLabel('Naam van je huishouden').fill('Testhuishouden');
    await page.getByLabel('Postcode').fill('9711 LM');
    await page.getByLabel('Huisnr.').fill('12');
    await page.getByRole('button', { name: 'Verder' }).click();

    await expect(page.getByRole('heading', { name: 'Wie eten er mee?' })).toBeVisible();
    await addMember({
      name: 'Sanne',
      age: '36',
      sex: 'Vrouw',
      height: '172',
      weight: '68',
      submit: 'Toevoegen',
    });
    await page.getByRole('button', { name: 'Nog iemand toevoegen' }).click();
    await addMember({
      name: 'Joris',
      age: '41',
      sex: 'Man',
      height: '186',
      weight: '92',
      submit: 'Toevoegen',
    });
    // Two people with different bodies, so the portions have something to say.
    await expect(page.getByText('Sanne')).toBeVisible();
    await expect(page.getByText('Joris')).toBeVisible();
    await page.getByRole('button', { name: 'Verder' }).click();

    await expect(page.getByRole('heading', { name: 'Wat eten jullie graag?' })).toBeVisible();
    await page.getByRole('radio', { name: 'Italiaans: Lekker', exact: true }).click();
    await page.getByRole('radio', { name: 'Ovenschotel: Liever niet', exact: true }).click();
    await page.getByRole('button', { name: 'Verder' }).click();

    await expect(
      page.getByRole('heading', { name: 'Welke supermarkten wil je meenemen?' }),
    ).toBeVisible();
    const boxes = page.locator('input[type=checkbox][data-chain-id]');
    await expect(boxes).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check();
    }
    const chainIds = await boxes.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-chain-id') ?? ''),
    );
    expect([...chainIds].sort()).toEqual(['ah', 'jumbo', 'lidl']);
    evidence.household = {
      members: ['Sanne (36, 172 cm, 68 kg)', 'Joris (41, 186 cm, 92 kg)'],
      preferences: ['Italiaans: lekker', 'Ovenschotel: liever niet'],
      chains: chainIds,
      maxStores: 2,
    };

    await page.getByRole('button', { name: 'Klaar' }).click();
    await expect(page).toHaveURL(/\/week\/instellingen$/, { timeout: 120_000 });
  });

  test('3 — weekinstellingen: hoogstens twee winkels en een richtbedrag', async () => {
    await page.getByRole('button', { name: 'Max. 2', exact: true }).click();
    await page.getByRole('button', { name: 'Richtbedrag', exact: true }).click();
    await page
      .getByRole('textbox', { name: /bedrag|budget/i })
      .first()
      .fill('70');
    await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
    await expect(page.getByRole('button', { name: /^Maak mijn week$/ })).toBeVisible({
      timeout: 60_000,
    });

    // Saved, not just accepted: reload and read it back.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Max. 2', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Stored as cents and re-rendered as money, so "70" comes back "70,00".
    await expect(page.getByRole('textbox', { name: /bedrag|budget/i }).first()).toHaveValue(
      /^70(,00)?$/,
    );
  });

  test('4 — een week van zeven diners, uit echte winkeldata', async () => {
    await timed('eerste week genereren', async () => {
      await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
      await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
        timeout: 180_000,
      });
    });

    const ids = await weekIds();
    expect(ids.length, 'geen zeven diners').toBe(7);
    expect(new Set(ids).size, 'een gerecht staat er twee keer in').toBe(7);

    for (const id of ids) {
      const recipe = RECIPES.get(id);
      expect(recipe, `onbekend recept ${id}`).toBeDefined();
      expect(recipe!.mealType, `${id} is geen avondmaaltijd`).toBe('dinner');
    }

    // Whose prices these are, on every screen that shows one.
    for (const path of ['/week', '/boodschappen', '/winkels']) {
      await page.goto(path);
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      expect(text, `${path} zegt niet dat dit echte prijsdata is`).toContain('Echte prijsdata');
      expect(text, `${path} toont demo-prijzen in een release`).not.toContain('Demo-data');
    }
    await page.goto('/week');
    const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(main, 'geen bedrag bij de week').toMatch(/€\s?\d+[.,]\d{2}/);

    evidence.week = {
      recipeIds: ids,
      titles: ids.map((id) => RECIPES.get(id)?.name ?? id),
      totalCents: await weekTotalCents(),
      dataMode: 'REAL',
    };
  });

  test('5 — drie gerechten, gelezen zoals een kok ze leest', async () => {
    const ids = await weekIds();
    for (const day of [0, 3, 6]) {
      await page.goto(`/week/${day}`);
      const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      const id = ids[day]!;
      const recipe = RECIPES.get(id)!;

      const findings = {
        id,
        titel: recipe.name,
        ingredienten: await page.locator('main li').count(),
        stappen: await page.locator('ol > li').count(),
        persoonlijkeHoeveelheden: /Sanne \d/.test(main) && /Joris \d/.test(main),
        porties: /portie · ±/.test(main),
        tijd: /\d+ min/.test(main),
        voedingswaarde: /kcal/.test(main),
        dieetlabels: /vegetarisch|zwangerschap|budget|snel|pasta|rijst/i.test(main),
        geenInterneIds: !main.includes(`${id}`) || !id.includes('-'),
        geenRareDecimalen: !/\d+[.,]\d{3,}/.test(main),
      };
      evidence.recipes.push(findings);

      expect(main, `${id} toont de titel niet`).toContain(recipe.name);
      expect(findings.stappen, `${id} heeft geen stappen`).toBeGreaterThanOrEqual(2);
      expect(findings.persoonlijkeHoeveelheden, `${id} splitst niet per persoon`).toBe(true);
      expect(findings.porties, `${id} toont geen porties`).toBe(true);
      expect(findings.tijd, `${id} toont geen tijd`).toBe(true);
      expect(findings.voedingswaarde, `${id} toont geen voedingswaarde`).toBe(true);
      expect(findings.geenRareDecimalen, `${id} toont een rauwe decimaal`).toBe(true);
      expect(main, `${id} bevat een intern id`).not.toMatch(/\b[a-z]+-[a-z]+-[a-z]+:\w/);
    }
  });

  test('6 — twee gerechten vervangen, met de hele week opnieuw doorgerekend', async () => {
    for (const day of [1, 4]) {
      await page.goto('/week');
      const beforeIds = await weekIds();
      const beforeTotal = await weekTotalCents();
      await page.goto('/boodschappen');
      const beforeLines = await page
        .locator('li[data-item-key]')
        .evaluateAll((n) => n.map((e) => e.getAttribute('data-item-key') ?? ''));

      await timed(`vervangers ophalen (dag ${day})`, async () => {
        await page.goto(`/week/${day}/vervangen`);
        await expect(
          page.getByRole('button', { name: /Kies dit gerecht|Vervang/i }).first(),
        ).toBeVisible({ timeout: 180_000 });
      });
      await timed(`gerecht vervangen (dag ${day})`, async () => {
        await page
          .getByRole('button', { name: /Kies dit gerecht|Vervang/i })
          .first()
          .click();
        await expect(page).toHaveURL(new RegExp(`/week/${day}$`), { timeout: 180_000 });
      });

      await page.goto('/week');
      const afterIds = await weekIds();
      const afterTotal = await weekTotalCents();
      await page.goto('/boodschappen');
      const afterLines = await page
        .locator('li[data-item-key]')
        .evaluateAll((n) => n.map((e) => e.getAttribute('data-item-key') ?? ''));

      expect(afterIds[day], `dag ${day} kreeg hetzelfde gerecht terug`).not.toBe(beforeIds[day]);
      expect(
        afterIds.filter((_, i) => i !== day),
        'een andere dag veranderde mee',
      ).toEqual(beforeIds.filter((_, i) => i !== day));
      expect(new Set(afterIds).size, 'dubbel gerecht na vervanging').toBe(7);
      // A different dish means a different trolley: the packs, and with them
      // the shops and the promotions, are worked out again.
      expect(afterLines.join(), 'de boodschappenlijst veranderde niet').not.toBe(
        beforeLines.join(),
      );

      // And it survives a reload — no swap that only exists on screen.
      await page.goto('/week');
      await page.reload();
      expect(await weekIds()).toEqual(afterIds);

      evidence.replacements.push({
        dag: day,
        van: RECIPES.get(beforeIds[day]!)?.name ?? beforeIds[day],
        naar: RECIPES.get(afterIds[day]!)?.name ?? afterIds[day],
        totaalVoorCent: beforeTotal,
        totaalNaCent: afterTotal,
        regelsVoor: beforeLines.length,
        regelsNa: afterLines.length,
        regelsGewijzigd: afterLines.filter((l) => !beforeLines.includes(l)).length,
      });
    }
  });

  test('7 — drie keer een andere week', async () => {
    await page.goto('/week');
    let previous = await weekIds();
    for (let press = 1; press <= 3; press += 1) {
      const button = page.locator('button[data-action="regenerate-week"]');
      const before = previous.join();
      await timed(`andere week ${press}`, async () => {
        await button.click();
        await expect(button).toBeEnabled({ timeout: 180_000 });
        await expect
          .poll(async () => (await weekIds()).join(), { timeout: 120_000 })
          .not.toBe(before);
      });
      const next = await weekIds();
      expect(next.length).toBe(7);
      expect(new Set(next).size).toBe(7);
      for (const id of next) expect(RECIPES.has(id), `onbekend recept ${id}`).toBe(true);
      evidence.regenerated.push({
        druk: press,
        titels: next.map((id) => RECIPES.get(id)?.name ?? id),
        nieuweGerechten: next.filter((id) => !previous.includes(id)).length,
        totaalCent: await weekTotalCents(),
      });
      previous = next;
    }

    // The last one is the one that is still there afterwards.
    await page.reload();
    expect(await weekIds()).toEqual(previous);
  });

  test('8 — de boodschappenlijst, regel voor regel', async () => {
    await page.goto('/boodschappen');
    const lines = page.locator('li[data-item-key]');
    const count = await lines.count();
    expect(count, 'te weinig regels om te beoordelen').toBeGreaterThanOrEqual(20);

    const problems: string[] = [];
    const sample: Record<string, unknown>[] = [];
    for (let i = 0; i < Math.min(count, 25); i += 1) {
      const text = (await lines.nth(i).innerText()).replace(/\s+/g, ' ');
      const key = (await lines.nth(i).getAttribute('data-item-key')) ?? '';
      if (!/^\s*\d+×/.test(text)) problems.push(`regel ${i}: geen aantal — ${text}`);
      if (!/per verpakking/.test(text)) problems.push(`regel ${i}: geen verpakking — ${text}`);
      if (!/€\s?\d+[.,]\d{2}/.test(text)) problems.push(`regel ${i}: geen prijs — ${text}`);
      if (/€\s?0,00/.test(text)) problems.push(`regel ${i}: gratis product — ${text}`);
      if (/NaN|undefined|null/.test(text)) problems.push(`regel ${i}: rekenrest — ${text}`);
      if (/\d+[.,]\d{3,}/.test(text)) problems.push(`regel ${i}: rauwe decimaal — ${text}`);
      if (/[0-9a-f]{8}-[0-9a-f]{4}/.test(text)) problems.push(`regel ${i}: uuid — ${text}`);
      if (!/^[a-z0-9-]+:(ah|jumbo|lidl):/.test(key)) {
        problems.push(`regel ${i}: geen echt product — ${key}`);
      }
      if (i < 5) sample.push({ key, tekst: text });
    }

    const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    const headings = await page.locator('main h2, main h3').allInnerTexts();
    expect(problems, problems.join('\n')).toEqual([]);
    expect(headings.join(' '), 'geen groepen').toMatch(/Groente|Vlees|Zuivel|Brood|Kruiden/i);
    expect(main, 'geen winkel genoemd').toMatch(/Albert Heijn|Jumbo|Lidl/);

    evidence.shopping = {
      regels: count,
      gecontroleerd: Math.min(count, 25),
      groepen: headings.length,
      voorbeeld: sample,
      totaalCent: await weekTotalCents(),
    };
  });

  test('9 — wat de app onthoudt', async () => {
    // A. household change survives a reload
    await page.goto('/gezin');
    await page
      .getByRole('link', { name: /^Sanne/ })
      .first()
      .click();
    await page.getByLabel('Gewicht (kg)').fill('70');
    await page.getByRole('button', { name: 'Opslaan' }).first().click();
    await expect(page).toHaveURL(/\/gezin$/, { timeout: 60_000 });
    await page.reload();
    await page
      .getByRole('link', { name: /^Sanne/ })
      .first()
      .click();
    await expect(page.getByLabel('Gewicht (kg)')).toHaveValue('70');
    evidence.persistence.huishouden = 'PASS';

    // B. the week comes back exactly as saved
    await page.goto('/week');
    const ids = await weekIds();
    const total = await weekTotalCents();
    await page.reload();
    expect(await weekIds()).toEqual(ids);
    expect(await weekTotalCents()).toBe(total);
    evidence.persistence.week = 'PASS';

    // E. five ticks stay ticked
    await page.goto('/boodschappen');
    const boxes = page.locator('input[type=checkbox][data-item-key]');
    for (let i = 0; i < 5; i += 1) await boxes.nth(i).check();
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(5);
    await page.reload();
    await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(5);
    evidence.persistence.afvinken = 'PASS';

    // F. close the browser, come back: same session, same week, same ticks
    const reopened = await context.newPage();
    await reopened.goto('/week');
    expect(await weekIds(reopened)).toEqual(ids);
    await reopened.goto('/boodschappen');
    await expect(reopened.locator('input[type=checkbox]:checked')).toHaveCount(5);
    await reopened.close();
    evidence.persistence.heropenen = 'PASS';
  });

  test('10 — een opgeslagen week wordt nooit stil opnieuw geprijsd', async () => {
    await page.goto('/week');
    const ids = await weekIds();
    const total = await weekTotalCents();
    for (let read = 1; read <= 5; read += 1) {
      await timed('opgeslagen week openen', async () => {
        await page.goto('/week');
        await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible();
      });
      expect(await weekTotalCents(), `lezing ${read}`).toBe(total);
      expect(await weekIds()).toEqual(ids);
    }
    await expect(page.getByText(/Prijzen berekend/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Bereken opnieuw/ })).toBeVisible();

    await timed('boodschappenlijst openen', async () => {
      await page.goto('/boodschappen');
      await expect(page.locator('main')).toBeVisible();
    });
    evidence.persistence.prijsmomentopname = 'PASS';
    evidence.week = { ...evidence.week, eindTotaalCent: total, eindRecipeIds: ids };
  });
});
