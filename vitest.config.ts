import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// Two projects so the default `npm test` stays fast and node-only, while the renderer
// browser-integration layer runs opt-in in real Chromium via `npm run test:browser`.
// jsdom can't provide SVGElement.getBBox() / getComputedTextLength(), which the renderer relies on.
export default defineConfig({
  test: {
    // Report-only for now (no thresholds) — Phase G flips this into a gate. `npm run test:coverage`.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/dist/**', '**/test/**', 'apps/*/src/webview/main.ts'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          // Per-file `// @vitest-environment jsdom` pragmas still override this default.
          environment: 'node',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
          exclude: ['packages/renderer/test/browser/**', '**/node_modules/**', '**/dist/**'],
          // The VS Code host imports the ambient `vscode` runtime, which only exists inside the
          // editor. Point it at a thin in-repo mock so host/protocol logic is unit-testable.
          alias: {
            vscode: new URL('./apps/vscode/test/__mocks__/vscode.ts', import.meta.url).pathname,
          },
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
