import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The demo webapp bundles the @miragon/wardley-* packages straight from SOURCE (like the tsconfig paths).
// This keeps the build self-contained: no prior lib build / no dist CSS filename needed
// (robust for Netlify). Ordering: the specific CSS subpath BEFORE the package alias.
const r = (p: string): string => resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@miragon/wardley-renderer/assets/wardley.css',
        replacement: r('../../packages/renderer/src/assets/wardley.css'),
      },
      { find: '@miragon/wardley-renderer', replacement: r('../../packages/renderer/src/index.ts') },
      {
        find: '@miragon/wardley-schema-model',
        replacement: r('../../packages/schema-model/src/index.ts'),
      },
      { find: '@miragon/wardley-dsl', replacement: r('../../packages/dsl/src/index.ts') },
      {
        find: '@miragon/wardley-transforms',
        replacement: r('../../packages/transforms/src/index.ts'),
      },
    ],
  },
  server: {
    port: 5180,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
