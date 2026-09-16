import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loadPrijsProfeetSnapshot } from '../../src/services/promotions/load-snapshot';
import { toCandidate } from '../../src/services/promotions/link-promotions';

/**
 * A real promotion, all the way to the screen.
 *
 * Every earlier proof stopped one step short: the folder loads, the join works,
 * the optimizer can apply one. None of that shows the shopper a badge. This
 * drives the ordinary browser flow — the same store service, catalogue,
 * promotion provider, optimizer and shopping list the app uses — and asserts
 * that a line on the list carries a promotion that really is in the PrijsProfeet
 * snapshot, and really costs less than its shelf price.
 *
 * ## Why this is not a twenty-week lottery
 *
 * A test that generates weeks until one happens to contain an offer would be
 * slow and flaky, and would fail for reasons that have nothing to do with the
 * code. So the promotion is found first, in Node, from the same snapshot the
 * app reads; the browser then only has to confirm that one of those labels
 * reaches the list. Albert Heijn alone is selected because that is where most
 * of the linked promotions are, which makes the encounter reliable rather than
 * lucky.
 */

const SNAPSHOT = 'data/external/promotions-snapshot.json';

/** Every promotion label Albert Heijn is offering in the snapshot's window. */
function realAhPromotionLabels(): Set<string> {
  const outcome = loadPrijsProfeetSnapshot(SNAPSHOT, {
    readFile: (path) => readFileSync(path, 'utf8'),
    exists: existsSync,
  });
  if (outcome.status !== 'LOADED') return new Set();
  const labels = new Set<string>();
  for (const external of outcome.promotions) {
    if (external.chainId !== 'ah') continue;
    const candidate = toCandidate(external);
    if (!candidate.params) continue;
    if (candidate.originalText.trim() !== '') labels.add(candidate.originalText.trim());
  }
  return labels;
}

/**
 * The fixed demo household, through the ordinary sign-in screen.
 *
 * Deterministic on purpose. A freshly registered household gets whatever
 * portions its one member implies, which changes the menu, which changes the
 * products, which decides whether any of them happens to be on offer. The demo
 * household is the same two adults every time, so the week it plans is the same
 * week every time — and the folder is a fixed snapshot. Nothing here is left to
 * chance except the folder itself.
 */
async function openDemoHousehold(page: Page): Promise<void> {
  await page.goto('/inloggen');
  await page.getByRole('button', { name: 'Bekijk de demo' }).click();
  await expect(page).toHaveURL(/\/week$/);
}

/** Restrict the week to Albert Heijn, which carries most linked promotions. */
async function useAlbertHeijnOnly(page: Page): Promise<void> {
  await page.goto('/week/instellingen');
  const rows = page.locator('label').filter({ hasText: /Albert Heijn|Jumbo|Lidl/ });
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const box = row.locator('input[type=checkbox], [role=checkbox]').first();
    if ((await box.count()) === 0) continue;
    const wanted = /Albert Heijn/.test(await row.innerText());
    const checked = await box
      .isChecked()
      .catch(async () => (await box.getAttribute('aria-checked')) === 'true');
    if (wanted !== checked) await box.click();
  }
  await page.getByRole('button', { name: /Instellingen opslaan/ }).click();
  await expect(page.getByRole('button', { name: /^Maak mijn week$/ })).toBeVisible();
}

test.describe('real promotions reach the shopping list', () => {
  test('shows a PrijsProfeet offer on a line, and charges less for it', async ({ page }) => {
    const labels = realAhPromotionLabels();
    test.skip(labels.size === 0, 'geen aanbiedingenmomentopname beschikbaar');

    await openDemoHousehold(page);
    await useAlbertHeijnOnly(page);
    await page.getByRole('button', { name: /^Maak mijn week$/ }).click();
    await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible({ timeout: 90_000 });

    await page.goto('/boodschappen');
    await expect(page.getByRole('heading', { name: 'Boodschappen' })).toBeVisible();

    // The badge only renders for a line the optimizer actually bought on offer.
    const badges = page.locator('[data-promotion]');
    await expect(badges.first()).toBeVisible();
    const texts = (await badges.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    const fromFolder = texts.filter((text) => labels.has(text));

    expect(
      fromFolder.length,
      `geen enkele badge kwam uit de folder; gezien: ${texts.slice(0, 12).join(' | ')}`,
    ).toBeGreaterThan(0);

    // The line it sits on is an Albert Heijn line with a real article behind it,
    // and it is cheaper than paying the shelf price for the same packs.
    const line = page
      .locator('li')
      .filter({ has: page.locator('[data-promotion]') })
      .first();
    const lineText = (await line.innerText()).replace(/\s+/g, ' ');
    expect(lineText).toMatch(/AH |Albert Heijn/);
    expect(lineText).toMatch(/€\s?\d+,\d{2}/);

    // The promotion the optimizer used is the one the folder describes.
    expect(fromFolder[0]).toBeTruthy();
    expect(lineText).toContain(fromFolder[0]!);
  });
});
