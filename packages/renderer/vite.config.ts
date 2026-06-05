import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// diagram-js & dessen Abhaengigkeitsbaum werden externalisiert (peer/external),
// damit sie nicht doppelt im Konsumenten-Bundle landen (Konzept §10.3).
const EXTERNAL = [
  'diagram-js',
  /^diagram-js\//,
  'tiny-svg',
  'min-dom',
  'min-dash',
  'didi',
  'object-refs',
  'inherits-browser',
  'path-intersection',
  'clsx',
  '@wardley/schema-model',
  '@wardley/dsl',
];

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'wardley',
    },
    rollupOptions: {
      external: EXTERNAL,
    },
  },
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts'],
      rollupTypes: true,
    }),
  ],
});
