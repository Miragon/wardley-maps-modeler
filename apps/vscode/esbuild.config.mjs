// Zwei Bundles aus einem Lauf:
//   1. Extension-Host  (Node/CJS, `vscode` extern)  -> dist/extension.cjs
//   2. Webview          (Browser/IIFE, Modeler+CSS)  -> dist/webview.js (+ dist/webview.css)
//
// Wie die Demo-Webapp bündeln wir die @wardley/*-Pakete direkt aus dem SOURCE (Alias auf
// src/index.ts). Das macht den Build selbst-enthaltend: kein vorheriger Lib-Build nötig, und die
// diagram-js-Imports werden relativ zum Renderer-Source aufgelöst (packages/renderer/node_modules).
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const r = (p) => resolve(root, p);

/** Paket-Alias auf den TS-Source (analog apps/webapp/vite.config.ts). */
const alias = {
  '@wardley/renderer': r('packages/renderer/src/index.ts'),
  '@wardley/schema-model': r('packages/schema-model/src/index.ts'),
  '@wardley/dsl': r('packages/dsl/src/index.ts'),
  '@wardley/transforms': r('packages/transforms/src/index.ts'),
};

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const host = {
  ...common,
  entryPoints: [resolve(here, 'src/extension.ts')],
  outfile: resolve(here, 'dist/extension.cjs'),
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  // `vscode` ist nur zur Laufzeit (vom Host) verfügbar und darf nicht gebündelt werden.
  external: ['vscode'],
};

/** @type {import('esbuild').BuildOptions} */
const web = {
  ...common,
  entryPoints: [resolve(here, 'src/webview/main.ts')],
  outfile: resolve(here, 'dist/webview.js'),
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  alias,
  // Fonts (woff2) als data:-URL in die CSS inlinen -> keine extra Assets, einfachere CSP.
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
};

if (watch) {
  const ctxs = await Promise.all([esbuild.context(host), esbuild.context(web)]);
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('[wardley-vscode] watching …');
} else {
  await Promise.all([esbuild.build(host), esbuild.build(web)]);
  console.log('[wardley-vscode] build done');
}
