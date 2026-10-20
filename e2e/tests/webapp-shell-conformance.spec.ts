import { test, type Page } from '@playwright/test';
import { registerShellConformance, type ShellSkip } from '@miragon/modeler-shell/testing';
import { EXAMPLE_MAP } from '../../apps/webapp/src/example.js';
import { encodeMapCompressed } from '../../apps/webapp/src/share.js';
import { THEMES } from '../../apps/webapp/src/themes.js';
import { waitForViewer } from './support/viewer.js';

/**
 * The shell's conformance kit against the real web app (the web host of guide §5.2): geometry at
 * three sizes with the primary action, the legal line and the raised zoom row, ARIA and keyboard
 * models, keyboard creation from the palette, the light-only mode under any system setting, the
 * start screen, toasts, the problems list, the drop zone and a clean teardown. The web app has
 * neither a legend nor an inspector, and no invalid-file state (the DSL reads every text, and a
 * file that is no map leaves the map as it was), so the harness declares them absent; any skip
 * fails the suite.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join('; ');

/** The example with two lines the parser cannot take: two text rows in the problems list. */
const MAP_WITH_FINDINGS = `${EXAMPLE_MAP}compnent Typo [0.2, 0.2]\nCup -> Nowhere\n`;

test.describe('web app: shell conformance', () => {
  test.describe.configure({ timeout: 90_000 });

  registerShellConformance<Page>(
    {
      host: 'web',
      themes: THEMES,
      // The kit emulates the system's colour scheme and contrast before every open.
      async open(page, { size }) {
        await page.setViewportSize(size);
        await page.goto(`/#mz=${await encodeMapCompressed(EXAMPLE_MAP)}`);
        await waitForViewer(page);
      },
      async destroy(page) {
        await page.evaluate(() => window.__wardleyApp?.destroy());
      },
      // The import findings name lines, never elements a row could select.
      absent: ['legend', 'inspector', 'invalid', 'problemSelection'],
      show: {
        // A link to a map with findings, loaded fresh: the import the user started reports them
        // to the pill and its list, as the app's real path does.
        async problems(page) {
          await page.goto(`/?problems#mz=${await encodeMapCompressed(MAP_WITH_FINDINGS)}`);
          await waitForViewer(page);
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.__wardleyApp!.shell;
            shell.setStatus({
              severity: 'danger',
              text: shell.messages.invalidFile('Wardley map'),
            });
          });
        },
        // A fresh visit: the page without a map in its link.
        async emptyState(page) {
          await page.goto('/');
          await waitForViewer(page);
        },
        async toast(page, { status, text, actionLabel }) {
          await page.evaluate(
            ({ status, text, actionLabel }) => {
              window.__wardleyApp?.shell.toast({
                status,
                text,
                ...(actionLabel ? { action: { label: actionLabel, onSelect() {} } } : {}),
              });
            },
            { status, text, actionLabel },
          );
        },
      },
      drop: {
        // A .wmap file has no MIME type the browser knows; a picture is refused already while it
        // is dragged and, dropped all the same, opens nothing.
        accepted: { name: 'tea-shop.wmap', type: '', text: EXAMPLE_MAP },
        rejected: { name: 'map.png', type: 'image/png', text: 'x' },
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
