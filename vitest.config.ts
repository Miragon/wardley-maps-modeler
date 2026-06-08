import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// Two projects so the default `npm test` stays fast and node-only, while the renderer
// browser-integration layer (KONZEPT.md §11) runs opt-in in real Chromium via `npm run test:browser`.
// jsdom can't provide SVGElement.getBBox() / getComputedTextLength(), which the renderer relies on.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          // Per-file `// @vitest-environment jsdom` pragmas still override this default.
          environment: 'node',
          include: ['packages/*/test/**/*.test.ts'],
          exclude: ['packages/renderer/test/browser/**', '**/node_modules/**', '**/dist/**'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['packages/renderer/test/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
