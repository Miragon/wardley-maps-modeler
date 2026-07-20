import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '5180';
const BASE_URL = `http://localhost:${PORT}`;

/**
 * E2E for @miragon/wardley-webapp. The webapp dev server resolves @miragon/wardley-* via Vite source
 * aliases (apps/webapp/vite.config.ts), so no package build is required — the dev server is
 * self-contained. `cwd: '..'` runs the command from the repo root so the npm workspace resolves.
 */
export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev:app -w apps/webapp -- --port ${PORT} --strictPort`,
    cwd: '..',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
