import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// The demo webapp bundles the @miragon/wardley-* packages straight from SOURCE (like the tsconfig paths).
// This keeps the build self-contained: no prior lib build / no dist CSS filename needed
// (robust for Netlify). Ordering: the specific CSS subpath BEFORE the package alias.
const r = (p: string): string => resolve(__dirname, p);

// When started via Portless (`npm run dev:webapp:portless`) the proxy injects PORTLESS_URL — the
// named https://<worktree>.localhost address. We open the browser there (not Vite's 127.0.0.1 port)
// and echo it as an extra line under Vite's URLs so it is obvious in the console. Unset for plain
// `npm run dev:webapp`, which then keeps its current behaviour (Vite on :5180, no auto-open).
const portlessUrl = process.env.PORTLESS_URL || undefined;

const portlessBanner = (url: string): Plugin => ({
  name: 'portless-url-banner',
  configureServer(server) {
    const printUrls = server.printUrls.bind(server);
    server.printUrls = () => {
      printUrls();
      server.config.logger.info(
        `  \x1b[32m➜\x1b[0m  \x1b[1mPortless\x1b[0m: \x1b[36m${url}\x1b[0m`,
      );
    };
  },
});

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
  plugins: portlessUrl ? [portlessBanner(portlessUrl)] : [],
  server: {
    port: 5180,
    strictPort: true,
    open: portlessUrl ?? false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
