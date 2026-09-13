import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

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
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      DATA_ADAPTER: 'demo',
      WEEKMENU_DATA_DIR: '.data/e2e',
    },
  },
});
