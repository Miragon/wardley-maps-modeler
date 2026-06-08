import { defineConfig, devices } from '@playwright/test';

// Port is overridable via E2E_PORT so parallel runs (e.g. several Conductor workspaces, all of which
// default the webapp to 5180 with strictPort) don't collide. Defaults to 5180 → CI behaviour is unchanged.
const PORT = process.env.E2E_PORT ?? '5180';
const BASE_URL = `http://localhost:${PORT}`;

/**
 * E2E for @miragon/wardley-webapp. The webapp dev server resolves @miragon/wardley-* via Vite source
 * aliases (apps/webapp/vite.config.ts), so no package build is required — the dev server is
 * self-contained. `cwd: '..'` runs the command from the repo root so the npm workspace resolves.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serialize on CI for determinism; omit locally so Playwright auto-picks worker count.
  // (Spread instead of `workers: undefined` — exactOptionalPropertyTypes forbids the explicit undefined.)
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -w apps/webapp -- --port ${PORT} --strictPort`,
    cwd: '..',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
