import { expect, test, type Page } from '@playwright/test';

/**
 * How long the app makes you wait, measured where a person feels it.
 *
 * Numbers from the optimizer benchmark are not this number: a week takes about
 * 1,5 s to compute (`pnpm bench:perf`), but pressing the button also loads the
 * price snapshot, resolves every offer, writes the week down and renders the
 * page again. Only the wall clock from click to readable screen says what the
 * wait is, so that is what this measures — and it prints the table, because a
 * budget that passes tells you nothing about where the time went.
 *
 * The budgets are deliberately above the measured values, not at them: this is
 * a guard against a regression of a different order, not a stopwatch contest on
 * a shared CI machine.
 */
const measurements: { step: string; ms: number; budget: number }[] = [];

async function timed(step: string, budget: number, run: () => Promise<void>): Promise<number> {
  const started = Date.now();
  await run();
  const ms = Date.now() - started;
  measurements.push({ step, ms, budget });
  return ms;
}

async function signIn(page: Page): Promise<void> {
  page.setDefaultTimeout(30_000);
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

test.afterAll(() => {
  const rows = measurements
    .map((m) => `  ${m.step.padEnd(34)} ${String(m.ms).padStart(6)} ms   (budget ${m.budget} ms)`)
    .join('\n');
  // The table is the point of this suite: a green tick says "under budget",
  // the numbers say whether anything is drifting.
  // eslint-disable-next-line no-console
  console.log(`\nGemeten wachttijden\n\n${rows}\n`);
});

test.describe('waiting', () => {
  test.describe.configure({ timeout: 600_000 });

  test('the whole flow, timed', async ({ page }) => {
    await signIn(page);

    // 1. Making a week. The one slow step, and the only one a user expects to
    //    wait for: it prices hundreds of candidate weeks against three shops.
    const generate = page.locator('button[data-action="generate-week"]').first();
    if ((await generate.count()) > 0) {
      await timed('week samenstellen', 12_000, async () => {
        await generate.click();
        await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({
          timeout: 180_000,
        });
      });
    }

    // 2. Opening the saved week. This used to re-run the optimizer on every
    //    page view; it is now a read, and the budget says so.
    for (const [step, path] of [
      ['week openen', '/week'],
      ['receptpagina openen', '/week/0'],
      ['boodschappenlijst openen', '/boodschappen'],
      ['winkelverdeling openen', '/winkels'],
    ] as const) {
      await timed(step, 3_000, async () => {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
      });
    }

    // 3. Ticking something off has to feel instant: the state is local and the
    //    server write happens behind it.
    await page.goto('/boodschappen');
    const box = page.locator('input[type=checkbox][data-item-key]').first();
    await timed('afvinken', 1_000, async () => {
      await box.click();
      await expect(box).toBeChecked();
    });

    // 4. Another week: a second full optimisation, with exclusions.
    await page.goto('/week');
    const before = await page
      .locator('li[data-recipe-id]')
      .evaluateAll((n) => n.map((e) => e.getAttribute('data-recipe-id') ?? '').join());
    const regenerate = page.locator('button[data-action="regenerate-week"]');
    await timed('andere week', 12_000, async () => {
      await regenerate.click();
      await expect(regenerate).toBeEnabled({ timeout: 180_000 });
      await expect
        .poll(
          async () =>
            page
              .locator('li[data-recipe-id]')
              .evaluateAll((n) => n.map((e) => e.getAttribute('data-recipe-id') ?? '').join()),
          { timeout: 60_000 },
        )
        .not.toBe(before);
    });

    // 5. The replacement list prices a whole week per alternative, so it is the
    //    other place a wait is unavoidable.
    await timed('vervangers ophalen', 12_000, async () => {
      await page.goto('/week/0/vervangen');
      await expect(
        page.getByRole('button', { name: /Kies dit gerecht|Vervang/i }).first(),
      ).toBeVisible({ timeout: 180_000 });
    });

    await timed('gerecht vervangen', 12_000, async () => {
      await page
        .getByRole('button', { name: /Kies dit gerecht|Vervang/i })
        .first()
        .click();
      // The swap lands on the day it changed, so you can read what you will
      // now be cooking.
      await expect(page).toHaveURL(/\/week\/0$/, { timeout: 180_000 });
    });

    for (const { step, ms, budget } of measurements) {
      expect(ms, `${step} duurde ${ms} ms`).toBeLessThan(budget);
    }
  });
});
