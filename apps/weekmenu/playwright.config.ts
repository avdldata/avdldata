import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import {
  AGED_PRICES,
  DATA_DIRS,
  MISSING_PRICES,
  MISSING_PROMOTIONS,
} from './tests/e2e/snapshot-paths';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * A second app, started with its price data deliberately missing.
 *
 * The app's central promise in REAL mode is that it refuses to invent prices —
 * no silent fall back to demo data, ever. The only way to test that promise is
 * to actually take the snapshot away, so a second server runs with the paths
 * pointed at files that do not exist, and `tests/e2e/failure-states.spec.ts`
 * drives it.
 */
const BROKEN_PORT = Number(process.env.E2E_BROKEN_PORT ?? 3101);
const brokenBaseURL = `http://127.0.0.1:${BROKEN_PORT}`;

/**
 * Two more apps, each missing one thing and nothing else.
 *
 * The app claims it will say when its prices are old, and that it keeps working
 * when the offers cannot be read. Both claims are about data that is present or
 * absent at start-up, so neither can be reached by clicking: they need a server
 * that was started that way. `tests/e2e/snapshot-paths.ts` says which file each
 * one gets, and the specs import the same URLs from here.
 */
const AGED_PORT = Number(process.env.E2E_AGED_PORT ?? 3102);
export const agedPricesBaseURL = `http://127.0.0.1:${AGED_PORT}`;

const NO_PROMO_PORT = Number(process.env.E2E_NO_PROMO_PORT ?? 3103);
export const withoutPromotionsBaseURL = `http://127.0.0.1:${NO_PROMO_PORT}`;

/**
 * Use the browser this environment already provides.
 *
 * CI images and dev containers often ship a Chromium that does not match the
 * build this Playwright version would download, and downloading is frequently
 * blocked. Pointing at the existing binary is both faster and more portable;
 * when there is no preinstalled browser, Playwright falls back to its own.
 */
const preinstalledChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const executablePath = existsSync(preinstalledChromium) ? preinstalledChromium : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    locale: 'nl-NL',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/failure-states.spec.ts'],
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 900 },
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          // Outbound traffic here goes through a proxy; the app under test is
          // local, so the browser has to reach it directly.
          args: ['--no-proxy-server'],
        },
      },
    },
    {
      name: 'zonder-prijsdata',
      testMatch: ['**/failure-states.spec.ts'],
      use: {
        browserName: 'chromium',
        baseURL: brokenBaseURL,
        viewport: { width: 1280, height: 900 },
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: ['--no-proxy-server'],
        },
      },
    },
  ],
  webServer: [
    {
      command: `pnpm build && pnpm start --port ${PORT}`,
      url: baseURL,
      // Never reuse a server between runs. The demo store keeps the database in
      // memory, so `globalSetup` wiping the file leaves a running server serving
      // whatever the previous run left behind — including a household a failed
      // test never cleaned up. That turns an unrelated failure into a mystery.
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        DATA_ADAPTER: 'demo',
        WEEKMENU_DATA_DIR: DATA_DIRS.healthy,
      },
    },
    {
      // The build is already done by the server above, so this one only starts.
      command: `pnpm start --port ${BROKEN_PORT}`,
      url: `${brokenBaseURL}/inloggen`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        DATA_ADAPTER: 'demo',
        WEEKMENU_DATA_DIR: DATA_DIRS.withoutPrices,
        DATA_MODE: 'REAL',
        WEEKMENU_PRICE_SNAPSHOT: MISSING_PRICES,
        WEEKMENU_PROMOTION_SNAPSHOT: MISSING_PROMOTIONS,
      },
    },
    {
      // Real prices, real offers, but the price file is weeks old. Everything
      // still works; the app has to say so. `globalSetup` makes the copy.
      command: `pnpm start --port ${AGED_PORT}`,
      url: `${agedPricesBaseURL}/inloggen`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        DATA_ADAPTER: 'demo',
        WEEKMENU_DATA_DIR: DATA_DIRS.agedPrices,
        DATA_MODE: 'REAL',
        WEEKMENU_PRICE_SNAPSHOT: AGED_PRICES,
      },
    },
    {
      // Real prices, no offers. A promotion is an extra, so the week has to
      // come out anyway — at the ordinary shelf price, with no badge.
      command: `pnpm start --port ${NO_PROMO_PORT}`,
      url: `${withoutPromotionsBaseURL}/inloggen`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        DATA_ADAPTER: 'demo',
        WEEKMENU_DATA_DIR: DATA_DIRS.withoutPromotions,
        DATA_MODE: 'REAL',
        WEEKMENU_PROMOTION_SNAPSHOT: MISSING_PROMOTIONS,
      },
    },
  ],
});
