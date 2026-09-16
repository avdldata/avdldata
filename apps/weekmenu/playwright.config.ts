import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

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
        WEEKMENU_DATA_DIR: '.data/e2e',
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
        WEEKMENU_DATA_DIR: '.data/e2e-kapot',
        DATA_MODE: 'REAL',
        WEEKMENU_PRICE_SNAPSHOT: 'data/external/bestaat-niet.json',
        WEEKMENU_PROMOTION_SNAPSHOT: 'data/external/bestaat-ook-niet.json',
      },
    },
  ],
});
