import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { renderWebviewHtml } from '@miragon/modeler-shell/vscode/extension';
import { EXAMPLE_MAP } from '../../../apps/vscode/src/examples.js';
import { WEBVIEW_THEMES } from '../../../apps/vscode/src/themes.js';

/**
 * The shipped bundle, as VS Code loads it: apps/vscode's production build (dist/webview.js,
 * dist/webview.css and the font files) behind the HTML and CSP of renderWebviewHtml. The other
 * specs run the webview from source through Vite, without a CSP, so a loader or CSP mistake of the
 * esbuild bundle shows only here.
 */
const repository = fileURLToPath(new URL('../../..', import.meta.url));
const dist = join(repository, 'apps/vscode/dist');
const ORIGIN = 'https://webview.test';
const NONCE = 'd2FyZGxleXRlc3Rub25jZQ';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
};

let stubScript = '';

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await promisify(execFile)(process.execPath, ['esbuild.config.mjs', '--production'], {
    cwd: join(repository, 'apps/vscode'),
  });
  // What VS Code provides around the webview, plus a recorder for CSP violations; a classic
  // script, because the CSP admits only the nonce'd <script> elements themselves.
  const stub = await build({
    stdin: {
      contents: `
        import { installVsCodeWebviewStub } from '@miragon/modeler-shell/testing/vscode-stub';
        window.cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) =>
          window.cspViolations.push(event.violatedDirective + ' ' + event.blockedURI),
        );
        installVsCodeWebviewStub({
          requested: { theme: 'light' },
          themes: ${JSON.stringify(WEBVIEW_THEMES)},
        });
      `,
      resolveDir: resolve(repository, 'e2e'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'silent',
  });
  stubScript = stub.outputFiles[0]!.text;
});

test('the production bundle runs under the webview CSP, with its fonts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const fonts: string[] = [];
  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') {
      const html = renderWebviewHtml({
        cspSource: ORIGIN,
        nonce: NONCE,
        scriptUri: `${ORIGIN}/webview.js`,
        styleUris: [`${ORIGIN}/webview.css`],
        title: 'Wardley Map',
        lang: 'en',
        appearance: { theme: 'light' },
        body: `<div id="app"></div><script nonce="${NONCE}" src="${ORIGIN}/stub.js"></script>`,
      });
      return route.fulfill({ contentType: 'text/html', body: html });
    }
    if (pathname === '/stub.js')
      return route.fulfill({ contentType: 'text/javascript', body: stubScript });
    if (pathname.startsWith('/fonts/')) fonts.push(pathname);
    const body = await readFile(join(dist, pathname));
    return route.fulfill({
      contentType: CONTENT_TYPES[extname(pathname)] ?? 'application/octet-stream',
      body,
    });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() =>
    (
      (window as unknown as { __modelerShellVsCodeStub?: { posted: unknown[] } })
        .__modelerShellVsCodeStub?.posted ?? []
    ).some((message) => (message as { type?: string }).type === 'ready'),
  );
  await page.evaluate((text) => window.postMessage({ type: 'init', text }, '*'), EXAMPLE_MAP);

  await expect(page.locator('.cd-shell-canvas [data-element-id="cmp_kettle"]')).toBeVisible();
  await page.locator('[data-chrome="menu"]').click();
  await expect(page.locator('.cd-shell-menu[role="menu"]')).toBeVisible();
  // The notes and axis captions are italic, the shortcut chips Geist Mono.
  const loaded = await page.evaluate(async () => [
    (await document.fonts.load('13px "Geist Variable"', 'Map')).length,
    (await document.fonts.load('italic 13px "Geist Variable"', 'Evolution')).length,
    (await document.fonts.load('13px "Geist Mono Variable"', '⌘A')).length,
  ]);
  expect(loaded.every((faces) => faces > 0)).toBe(true);

  expect(fonts.some((font) => /\/fonts\/geist-latin-wght-normal-.*\.woff2$/.test(font))).toBe(true);
  expect(fonts.some((font) => /cyrillic|vietnamese/.test(font))).toBe(false);
  expect(
    await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
