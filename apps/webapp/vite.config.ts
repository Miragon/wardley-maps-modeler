import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Die Demo-Webapp bündelt die @wardley/*-Pakete direkt aus dem SOURCE (wie die tsconfig-paths).
// Das macht den Build selbst-enthaltend: kein vorheriger Lib-Build / kein dist-CSS-Dateiname nötig
// (robust für Netlify). Reihenfolge: spezifischer CSS-Subpath VOR dem Paket-Alias.
const r = (p: string): string => resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@wardley/renderer/assets/wardley.css',
        replacement: r('../../packages/renderer/src/assets/wardley.css'),
      },
      { find: '@wardley/renderer', replacement: r('../../packages/renderer/src/index.ts') },
      { find: '@wardley/schema-model', replacement: r('../../packages/schema-model/src/index.ts') },
      { find: '@wardley/dsl', replacement: r('../../packages/dsl/src/index.ts') },
      { find: '@wardley/transforms', replacement: r('../../packages/transforms/src/index.ts') },
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
