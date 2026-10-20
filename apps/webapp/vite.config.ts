import { resolve } from 'node:path';
import { webHeadMarkup } from '@miragon/modeler-shell/core';
import { defineConfig, type Plugin } from 'vite';
import tokens from '../../packages/renderer/src/theme/cd-tokens.generated.json' with { type: 'json' };
import { THEMES } from './src/themes.ts';

const r = (p: string): string => resolve(import.meta.dirname, p);
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

/**
 * The web app's mode before the first paint (guide §13.3): a light-only map writes
 * `data-cd-theme="light"` statically in index.html, one theme-color and the contrast line of the
 * guide's script. With the joint dark-mode release THEMES gains "dark" and the same call writes
 * the whole script with both theme-colors (index.html then says `data-cd-theme="system"`).
 */
const modeMarkup = (): Plugin => ({
  name: 'miragon-mode',
  transformIndexHtml: (html) =>
    html.replace(
      '<!-- miragon-mode -->',
      webHeadMarkup({
        themes: THEMES,
        themeColors: { light: tokens.fest['--cd-blau'], dark: tokens.dunkel['--cd-ui-grund'] },
      }),
    ),
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
  plugins: [modeMarkup(), ...(portlessUrl ? [portlessBanner(portlessUrl)] : [])],
  server: {
    port: 5180,
    strictPort: true,
    open: portlessUrl ?? false,
    allowedHosts: ['.localhost'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // The shell inlines Lucide's icon geometry (ISC, partly Feather, MIT) and names both licences
    // in a legal comment; the bundle carries it, as the shell's notices ask.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
});
