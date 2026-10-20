import { test, type Page } from '@playwright/test';
import {
  registerShellConformance,
  vsCodeStubSearch,
  type ShellSkip,
} from '@miragon/modeler-shell/testing';
import { WEBVIEW_THEMES } from '../../../apps/vscode/src/themes.js';
import './support/webview.js';

/**
 * The shell's conformance kit against the real VS Code webview (main.ts inside the VS Code stub):
 * geometry at three sizes, ARIA and keyboard models, chrome keys and select all that never reach
 * VS Code while undo and redo do, keyboard creation from the palette, the read-only lock of an
 * invalid file, the appearance VS Code requests (a light-only map stays light, high contrast
 * passes) and a clean teardown. Wardley maps have neither a legend nor an inspector, so the
 * harness declares them absent and the kit asserts they never show; any skip fails the suite.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join('; ');

test.describe('VS Code webview: shell conformance', () => {
  test.describe.configure({ timeout: 90_000 });

  registerShellConformance<Page>(
    {
      host: 'ide',
      themes: WEBVIEW_THEMES,
      async open(page, { size, requested }) {
        await page.setViewportSize(size);
        await page.goto(`/webview-test.html?${vsCodeStubSearch(requested)}`);
        await page.waitForFunction(() => window.webviewReady === true);
      },
      async destroy(page) {
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
      },
      absent: ['legend', 'inspector'],
      show: {
        async problems(page) {
          await page.evaluate(() =>
            window.postMessage({ type: 'problems', count: 2, errors: 0 }, '*'),
          );
          await page.waitForFunction(
            () => document.querySelector<HTMLElement>('[data-chrome="problems"]')?.hidden === false,
          );
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.shell!;
            shell.setStatus({
              severity: 'danger',
              text: shell.messages.invalidFile('Wardley map'),
            });
          });
        },
        // The invalid-file state the way the extension host causes it: an update the modeler
        // cannot import. The DSL reads every text, so the hook makes that one import fail, as a
        // map the canvas cannot render would.
        async invalid(page) {
          await page.evaluate(() => {
            const modeler = window.modeler!;
            const importText = modeler.importText.bind(modeler);
            modeler.importText = () => {
              modeler.importText = importText;
              return Promise.reject(new Error('not importable'));
            };
            window.postMessage({ type: 'update', text: 'title Broken\n' }, '*');
          });
        },
      },
    },
    test,
    {
      onSkip(caseName, skips) {
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
