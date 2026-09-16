import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // See tests/support/server-only-stub.ts.
      'server-only': fileURLToPath(new URL('./tests/support/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    globals: true,
    reporters: ['default'],
    /*
     * Tests run against the demo catalogue unless they ask for the real one.
     *
     * Not a preference but a measurement problem: with REAL as the default, the
     * planner's performance test started timing the parse of a 45 MB catalogue
     * instead of the planning, and failed on a budget it was never about. The
     * real-data suites set `DATA_MODE=REAL` themselves, before importing the
     * services, so nothing that should exercise real prices stops doing so.
     */
    env: { DATA_MODE: 'DEMO' },
  },
});
