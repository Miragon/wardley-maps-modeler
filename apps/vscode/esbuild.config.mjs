// Two bundles from one run:
//   1. Extension host  (Node/CJS, `vscode` external)  -> dist/extension.cjs
//   2. Webview          (Browser/IIFE, Modeler+CSS)    -> dist/webview.js (+ dist/webview.css)
//
// Like the demo webapp, we bundle the @miragon/wardley-* packages straight from SOURCE (aliased to
// src/index.ts). That makes the build self-contained: no prior lib build needed, and the
// diagram-js imports resolve relative to the renderer source (packages/renderer/node_modules).
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const r = (p) => resolve(root, p);

/** Package aliases pointing at the TS source (mirrors apps/webapp/vite.config.ts). */
const alias = {
  '@miragon/wardley-renderer': r('packages/renderer/src/index.ts'),
  '@miragon/wardley-schema-model': r('packages/schema-model/src/index.ts'),
  '@miragon/wardley-dsl': r('packages/dsl/src/index.ts'),
  '@miragon/wardley-transforms': r('packages/transforms/src/index.ts'),
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
