import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const r = (p: string): string => resolve(__dirname, p);
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
    allowedHosts: ['.localhost'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
