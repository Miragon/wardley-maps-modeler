import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const fromRepository = (path: string): string =>
  fileURLToPath(new URL(`../../${path}`, import.meta.url));

/**
 * The VS Code webview test page: apps/vscode/src/webview/main.ts inside the shell's VS Code stub.
 * Like apps/webapp/vite.config.ts it resolves @miragon/wardley-* to the package sources, so the
 * suite runs without a prior build.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      {
        find: '@miragon/wardley-renderer',
        replacement: fromRepository('packages/renderer/src/index.ts'),
      },
      {
        find: '@miragon/wardley-schema-model',
        replacement: fromRepository('packages/schema-model/src/index.ts'),
      },
      { find: '@miragon/wardley-dsl', replacement: fromRepository('packages/dsl/src/index.ts') },
      {
        find: '@miragon/wardley-transforms',
        replacement: fromRepository('packages/transforms/src/index.ts'),
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.E2E_WEBVIEW_PORT ?? 5190),
    strictPort: true,
    fs: { allow: [fromRepository('')] },
  },
});
