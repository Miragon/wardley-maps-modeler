import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { EXAMPLE_MAP } from '../../apps/webapp/src/example.js';
import { encodeMapCompressed } from '../../apps/webapp/src/share.js';
import {
  canvasSlot,
  createComponentAt,
  exportDSL,
  exportMap,
  menuEntry,
  openExample,
  openMenu,
  startNewMap,
  startScreen,
  waitForViewer,
} from './support/viewer.js';

/**
 * The web app's side of the shell's web chrome: what it hands the shell (menu groups, primary
 * action, legal links, start screen, drop zone, empty-map hint) and its own handlers behind them
 * (share link, replace with undo, open, drop, paste, exports, the map's dialogs and popovers, the
 * text views, app keys, problems). What the shell guarantees itself runs in
 * webapp-shell-conformance.spec.ts. Native `confirm()`/`alert()` prompts must never appear, so
 * every test fails on one.
 */

const MY_MAP = 'title My strategy\ncomponent Alpha [0.5, 0.5]\ncomponent Beta [0.3, 0.7]';

test.beforeEach(({ page }) => {
  page.on('dialog', (dialog) => {
    throw new Error(`unexpected native ${dialog.type()} prompt: ${dialog.message()}`);
  });
});

async function openApp(page: Page, hash = ''): Promise<void> {
  await page.goto(`/${hash}`);
  await waitForViewer(page);
}

async function openLink(page: Page, dsl: string): Promise<void> {
  await openApp(page, `#mz=${await encodeMapCompressed(dsl)}`);
}

async function importText(page: Page, text: string): Promise<void> {
  await page.evaluate((dsl) => window.__wardleyViewer.importDSL(dsl), text);
}

async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

/** A file drag and drop on the page, as the browser delivers one (the drop zone listens on window). */
async function dropFile(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    ({ name, text }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], name, { type: '' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        document.body.dispatchEvent(
          new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }),
        );
      }
    },
    { name, text },
  );
}

function toast(page: Page, text: string | RegExp) {
  return page.locator('[data-chrome="toasts"] .cd-shell-toast').filter({ hasText: text });
}

function fileInput(page: Page) {
  return page.locator('body > input[type="file"]');
}

function textDialog(page: Page, mode: 'dsl' | 'json' | 'share') {
  return page.locator(`dialog.text-dialog-${mode}`);
}

/**
 * Closes a map dialog and waits for its close event: the dialog hands the focus back to the menu
 * trigger there, in a task of its own that can run after a focus the test moves at once.
 */
async function closeDialog(dialog: Locator, close: () => Promise<void>): Promise<void> {
  type Watched = HTMLElement & { closed?: Promise<void> };
  await dialog.evaluate((element: Watched) => {
    element.closed = new Promise<void>((resolve) =>
      element.addEventListener('close', () => resolve(), { once: true }),
    );
  });
  await close();
  await dialog.evaluate((element: Watched) => element.closed);
}

async function menuLayout(page: Page): Promise<Array<string | null>> {
  const dropdown = await openMenu(page);
  const layout = await dropdown.evaluate((menu) =>
    [...menu.children].map((child) =>
      child.getAttribute('role') === 'separator' ? '|' : child.getAttribute('data-menu-id'),
    ),
  );
  await page.keyboard.press('Escape');
  return layout;
}

async function readDownload(page: Page, run: () => Promise<void>): Promise<[string, string]> {
  const [download] = await Promise.all([page.waitForEvent('download'), run()]);
  return [download.suggestedFilename(), await readFile(await download.path(), 'utf8')];
}

test.describe('the start screen', () => {
  test('hides the work chrome and the plot until a map starts, and names only the app', async ({
    page,
  }) => {
    await openApp(page);

    await expect(startScreen(page)).toBeVisible();
    await expect(startScreen(page).getByRole('heading', { level: 1 })).toHaveText(
      'Wardley Maps Modeler',
    );
    await expect(startScreen(page)).toContainText('Or drop a .wmap, .owm, or .json file here');
    await expect(page).toHaveTitle('Wardley Maps Modeler');
    for (const island of ['menu', 'primary', 'palette', 'zoom']) {
      await expect(page.locator(`[data-chrome="${island}"]`)).toBeHidden();
    }
    await expect(page.locator('[data-chrome="legal"]')).toBeVisible();
    const plot = page.locator('.wardley-container .djs-container > svg');
    await expect(plot).toHaveCSS('visibility', 'hidden');

    await startScreen(page).getByRole('button', { name: 'New diagram' }).click();
    await expect(startScreen(page)).toBeHidden();
    for (const island of ['menu', 'primary', 'palette', 'zoom']) {
      await expect(page.locator(`[data-chrome="${island}"]`)).toBeVisible();
    }
    await expect(plot).toHaveCSS('visibility', 'visible');
    expect(new URL(page.url()).hash).toBe('');
  });

  test('a shared link opens its map at once, named in the tab', async ({ page }) => {
    await openLink(page, EXAMPLE_MAP);

    await expect(startScreen(page)).toBeHidden();
    expect((await exportMap(page)).config.title).toBe('Tea Shop');
    await expect(page).toHaveTitle('Tea Shop · Wardley Maps Modeler');
  });

  test('a damaged share link says so and keeps the link in the address bar', async ({ page }) => {
    await openApp(page, '#mz=bZA7D4-truncated');

    await expect(toast(page, 'This map link is incomplete or damaged')).toHaveAttribute(
      'data-status',
      'danger',
    );
    expect(new URL(page.url()).hash).toBe('#mz=bZA7D4-truncated');
    await expect(startScreen(page)).toBeVisible();
  });

  test('opens a file from its hint, without the hidden menu', async ({ page }) => {
    await openApp(page);
    const open = startScreen(page).getByRole('button', { name: 'Open a file…' });
    await expect(open).toHaveAttribute('aria-keyshortcuts', /^(Meta|Control)\+O$/);

    const chooser = page.waitForEvent('filechooser');
    await open.click();
    await (
      await chooser
    ).setFiles({ name: 'tea.wmap', mimeType: '', buffer: Buffer.from(EXAMPLE_MAP) });

    await expect(startScreen(page)).toBeHidden();
    await expect.poll(async () => (await exportMap(page)).config.title).toBe('Tea Shop');
  });

  test('a .wmap file dropped on it opens', async ({ page }) => {
    await openApp(page);

    await dropFile(page, 'tea-shop.wmap', EXAMPLE_MAP);

    await expect(startScreen(page)).toBeHidden();
    await expect.poll(async () => (await exportMap(page)).config.title).toBe('Tea Shop');
    await expect(page.locator('[data-chrome="palette"]')).toBeVisible();
  });

  test('a new map says how to start until its first element', async ({ page }) => {
    await startNewMap(page);
    const hint = page.locator('.cd-shell-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText('Pick a tool from the palette to start.');

    await createComponentAt(page, 0.45, 0.5);
    await page.keyboard.press('Escape');
    await expect(hint).toBeHidden();
  });
});

test.describe('the menu', () => {
  test('holds File, Model, Export and Help; no Appearance, no Undo', async ({ page }) => {
    await openApp(page);
    await openExample(page);

    expect(await menuLayout(page)).toEqual([
      'new-diagram',
      'open',
      'show-example',
      '|',
      'map-title',
      'map-size',
      'x-axis-labels',
      'edit-dsl',
      'view-json',
      '|',
      'export-png',
      'export-svg',
      'export-png-transparent',
      'export-json',
      'export-wmap',
      '|',
      'keyboard-shortcuts',
    ]);
    const dropdown = await openMenu(page);
    await expect(dropdown.locator('[data-menu-id="open"]')).toHaveText(/Open…\s*(⌘|Ctrl\+)O/);
    await expect(dropdown.locator('[data-menu-id="export-wmap"]')).toHaveText(
      /Export as \.wmap\s*(⌘|Ctrl\+)S/,
    );
    await expect(dropdown.locator('[data-menu-group="appearance"]')).toHaveCount(0);
    await expect(dropdown.getByRole('menuitem', { name: /undo|redo/i })).toHaveCount(0);
  });
});

test.describe('replacing the map', () => {
  test('Show example replaces the map and the toast brings it back', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);

    await menuEntry(page, 'show-example');
    await expect.poll(async () => (await exportMap(page)).config.title).toBe('Tea Shop');

    const replaced = toast(page, 'Map replaced');
    await expect(replaced).toBeVisible();
    await replaced.getByRole('button', { name: 'Undo' }).click();

    await expect.poll(async () => (await exportMap(page)).config.title).toBe('My strategy');
    expect((await exportMap(page)).elements.map((element) => element.label).sort()).toEqual([
      'Alpha',
      'Beta',
    ]);
    await expect(replaced).toBeHidden();
  });

  test('New diagram empties the map without a prompt, undoable from the toast', async ({
    page,
  }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuEntry(page, 'new-diagram');
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(0);
    // The session already started: no start card over the cleared canvas.
    await expect(startScreen(page)).toBeHidden();
    await toast(page, 'Map replaced').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(2);
  });

  test('Cmd/Ctrl+Z brings a replaced map back, also once its toast is closed', async ({ page }) => {
    await openLink(page, MY_MAP);
    await menuEntry(page, 'new-diagram');
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(0);
    const replaced = toast(page, 'Map replaced');
    await replaced.getByRole('button', { name: 'Close' }).click();
    await expect(replaced).toBeHidden();

    await canvasSlot(page).locator('svg[tabindex]').first().focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(2);
  });

  test('the undo offer is withdrawn once the new map is edited or replaced again', async ({
    page,
  }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuEntry(page, 'show-example');
    const replaced = toast(page, 'Map replaced');
    await expect(replaced).toBeVisible();
    // Restoring now would silently throw the edit away.
    await menuEntry(page, 'map-title');
    const field = page.locator('dialog.wardley-title-dialog input');
    await field.fill('My edited example');
    await field.press('Enter');
    await expect(replaced).toBeHidden();

    await menuEntry(page, 'new-diagram');
    await expect(replaced).toBeVisible();
    // Opening a map onto the cleared canvas must not leave an offer that would discard it.
    await pasteText(page, 'title Pasted\ncomponent Gamma [0.4, 0.4]');
    await expect.poll(async () => (await exportMap(page)).config.title).toBe('Pasted');
    await expect(replaced).toBeHidden();
  });

  test('pasting OWM text or a share link onto the canvas imports it', async ({ page }) => {
    await startNewMap(page);
    await pasteText(page, MY_MAP);
    await expect.poll(async () => (await exportMap(page)).config.title).toBe('My strategy');

    // The hash follows every change (compressed asynchronously): wait for it, keep the link.
    const before = await page.evaluate(() => location.hash);
    await importText(page, 'title Linked\ncomponent Gamma [0.4, 0.4]');
    await page.waitForFunction((hash) => location.hash !== hash, before);
    const link = page.url();
    await importText(page, 'title Other\ncomponent Delta [0.4, 0.4]');
    expect(link).toContain('#mz=');
    await pasteText(page, link);
    await expect.poll(async () => (await exportMap(page)).config.title).toBe('Linked');
  });

  test('a link pasted into the address bar replaces the map, with Undo', async ({ page }) => {
    await openLink(page, MY_MAP);
    const before = await exportDSL(page);

    const other = await encodeMapCompressed('title Pasted\ncomponent Gamma [0.4, 0.4]');
    await page.evaluate((payload) => {
      location.hash = `mz=${payload}`;
    }, other);

    await expect.poll(async () => (await exportMap(page)).config.title).toBe('Pasted');
    await toast(page, 'Map replaced').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => exportDSL(page)).toBe(before);
  });
});

test.describe('files', () => {
  test('Export as .wmap (Cmd/Ctrl+S) round-trips through Open… (Cmd/Ctrl+O)', async ({ page }) => {
    await openApp(page);
    await openExample(page);
    const original = await exportDSL(page);

    const [name, text] = await readDownload(page, () => page.keyboard.press('ControlOrMeta+s'));
    expect(name).toBe('tea-shop.wmap');
    expect(text).toBe(original);
    await expect(toast(page, 'Exported tea-shop.wmap.')).toHaveAttribute('data-status', 'success');

    await menuEntry(page, 'new-diagram');
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(0);
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('ControlOrMeta+o');
    await (
      await chooser
    ).setFiles({ name: 'tea-shop.wmap', mimeType: '', buffer: Buffer.from(text) });
    await expect.poll(() => exportDSL(page)).toBe(original);
  });

  test('Cmd/Ctrl+S saves a name that is still being typed', async ({ page }) => {
    await startNewMap(page);
    await createComponentAt(page, 0.5, 0.5);
    const field = page.locator('.wardley-label-input');
    await expect(field).toBeFocused();
    await page.keyboard.type('Payments');

    const [, text] = await readDownload(page, () => page.keyboard.press('ControlOrMeta+s'));
    expect(text).toContain('component Payments [');
    await expect(field).toHaveCount(0);
  });

  test('Cmd/Ctrl+S saves nothing on the start screen, and never reaches the browser', async ({
    page,
  }) => {
    await openApp(page);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    const prevented = page.evaluate(
      () =>
        new Promise<boolean>((resolve) =>
          window.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 's') resolve(event.defaultPrevented);
          }),
        ),
    );

    await page.keyboard.press('ControlOrMeta+s');

    expect(await prevented).toBe(true);
    await page.waitForTimeout(300);
    expect(downloads).toEqual([]);
    await expect(startScreen(page)).toBeVisible();
  });

  test('a file that is no map shows a danger toast and keeps the map', async ({ page }) => {
    await openApp(page);
    await openExample(page);
    const before = await exportDSL(page);

    await fileInput(page).setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ "elements": '),
    });

    await expect(toast(page, 'Could not open “bad.json”.')).toHaveAttribute(
      'data-status',
      'danger',
    );
    expect(await exportDSL(page)).toBe(before);
    await expect(toast(page, 'Map replaced')).toHaveCount(0);
  });

  test('a file with findings reports them in the pill and its list', async ({ page }) => {
    await openApp(page);
    await openExample(page);

    await fileInput(page).setInputFiles({
      name: 'broken.wmap',
      mimeType: '',
      buffer: Buffer.from(
        'title Broken\ncomponent A [0.5, 0.5]\ncompnent Typo [0.2, 0.2]\nA -> Nowhere\n',
      ),
    });

    await expect.poll(async () => (await exportMap(page)).config.title).toBe('Broken');
    await expect(
      toast(page, 'Imported with 2 warnings. Details under “2 problems” bottom left.'),
    ).toHaveAttribute('data-status', 'warning');
    await expect(page.locator('[data-chrome="toasts"] .cd-shell-toast')).toHaveText([
      /^Imported with 2 warnings/,
      /^Map replaced/,
    ]);
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toHaveText('2 problems');

    await pill.click();
    const list = page.locator('[data-chrome="problems-popover"]');
    await expect(list).toBeVisible();
    await expect(list.locator('.cd-shell-problem-location')).toHaveText([
      'Line 3 · compnent Typo [0.2, 0.2]',
      'Line 4 · A -> Nowhere',
    ]);
    await expect(list.locator('.cd-shell-problem-message')).toHaveText([
      'Unknown statement "compnent"',
      'Link: "Nowhere" not found',
    ]);
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(pill).toBeFocused();

    // A map without findings clears the pill.
    await menuEntry(page, 'show-example');
    await expect(pill).toBeHidden();
  });

  test('the exports download under the map’s name and confirm with a toast', async ({ page }) => {
    await openApp(page);
    await openExample(page);

    const expected: ReadonlyArray<[string, string]> = [
      ['export-png', 'tea-shop.png'],
      ['export-svg', 'tea-shop.svg'],
      ['export-png-transparent', 'tea-shop-transparent@4x.png'],
      ['export-json', 'tea-shop.json'],
      ['export-wmap', 'tea-shop.wmap'],
    ];
    for (const [id, fileName] of expected) {
      const [name] = await readDownload(page, () => menuEntry(page, id));
      expect(name).toBe(fileName);
      await expect(toast(page, `Exported ${fileName}.`)).toBeVisible();
    }
  });
});

test.describe('the map as text', () => {
  test('Edit as OWM-DSL… edits the map as text with Apply', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuEntry(page, 'edit-dsl');

    const dialog = textDialog(page, 'dsl');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('Edit as OWM-DSL');
    const apply = dialog.getByRole('button', { name: 'Apply' });
    await expect(apply).toBeDisabled();
    const text = dialog.locator('textarea');
    await expect(text).toBeFocused();
    expect(await text.evaluate((area: HTMLTextAreaElement) => area.scrollTop)).toBe(0);

    await text.fill(`${MY_MAP}\ncomponent Milk [0.6, 0.6]\ncompnent Typo [0.2, 0.2]`);
    await expect(apply).toBeEnabled();
    await expect(dialog.locator('.text-dialog-diagnostics')).toContainText('Line 5:');

    await text.press('ControlOrMeta+Enter');
    await expect(dialog).toBeHidden();
    const labels = (await exportMap(page)).elements.map((element) => element.label);
    expect(labels).toContain('Milk');
    await expect(toast(page, 'Imported with 1 warning.')).toBeVisible();
    await expect(page.locator('[data-chrome="problems"]')).toHaveText('1 problem');
  });

  test('a diagnostic jumps to its line', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuEntry(page, 'edit-dsl');
    const dialog = textDialog(page, 'dsl');
    const text = dialog.locator('textarea');
    await text.fill('title Bad\ncomponent A [0.5, 0.5]\ncompnent Typo [0.2, 0.2]');

    await dialog.getByRole('button', { name: /^Line 3:/ }).click();

    await expect(text).toBeFocused();
    const selected = await text.evaluate((area: HTMLTextAreaElement) =>
      area.value.slice(area.selectionStart, area.selectionEnd),
    );
    expect(selected).toBe('compnent Typo [0.2, 0.2]');
  });

  test('keeps comments, blank lines and order of the text through edits', async ({ page }) => {
    const source = [
      'title Platform',
      '// --- Users ---',
      'anchor Developer [0.95, 0.5]',
      '',
      '// --- Value chain ---',
      'component Portal [0.8, 0.55] // self-service entry point',
      'component Kubernetes [0.3, 0.75]',
      'Developer -> Portal',
      'Portal -> Kubernetes',
      '',
    ].join('\n');
    await startNewMap(page);
    await pasteText(page, source);
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(3);
    await page.evaluate(() => {
      const viewer = window.__wardleyViewer as unknown as {
        get(name: string): {
          get?(id: string): unknown;
          moveElements?(shapes: unknown[], delta: { x: number; y: number }): void;
        };
      };
      const kubernetes = viewer.get('elementRegistry').get!('cmp_kubernetes');
      viewer.get('modeling').moveElements!([kubernetes], { x: 40, y: 0 });
    });

    await menuEntry(page, 'edit-dsl');
    const text = await textDialog(page, 'dsl').locator('textarea').inputValue();
    const lines = text.split('\n');
    expect(lines).toHaveLength(source.split('\n').length);
    source.split('\n').forEach((line, index) => {
      if (!line.startsWith('component Kubernetes')) expect(lines[index]).toBe(line);
    });
    expect(lines[6]).toMatch(/^component Kubernetes \[0\.3, 0\.\d+\]$/u);
  });

  test('the map text keeps its line order across a reload', async ({ page }) => {
    await startNewMap(page);
    // Pipeline first, then a note: a re-serialisation after reload would swap the two lines.
    await canvasSlot(page).locator('svg[role="application"]').focus();
    for (const key of ['p', 'n']) {
      await page.keyboard.press(key);
      await expect(page.locator('.wardley-label-input')).toBeFocused();
      await page.keyboard.press('Escape');
    }
    await menuEntry(page, 'edit-dsl');
    const dialog = textDialog(page, 'dsl');
    const before = await dialog.locator('textarea').inputValue();
    expect(before.indexOf('pipeline ')).toBeLessThan(before.indexOf('note '));
    await dialog.getByRole('button', { name: 'Close' }).click();

    await page.reload();
    await waitForViewer(page);
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(2);
    await menuEntry(page, 'edit-dsl');
    await expect(textDialog(page, 'dsl').locator('textarea')).toHaveValue(before);
  });

  test('closing the text dialog with unapplied edits offers to keep editing', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuEntry(page, 'edit-dsl');
    const dialog = textDialog(page, 'dsl');
    const text = dialog.locator('textarea');
    await text.fill(`${MY_MAP}\ncomponent Draft [0.6, 0.6]`);
    await text.press('Escape');
    await expect(dialog).toBeHidden();

    await toast(page, 'Text changes were not applied')
      .getByRole('button', { name: 'Keep editing' })
      .click();
    await expect(dialog).toBeVisible();
    await expect(text).toHaveValue(`${MY_MAP}\ncomponent Draft [0.6, 0.6]`);
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  test('View as JSON… shows the map read-only; Cmd/Ctrl+S saves what it shows', async ({
    page,
  }) => {
    await openApp(page);
    await openExample(page);
    await menuEntry(page, 'view-json');
    const dialog = textDialog(page, 'json');
    await expect(dialog.getByRole('heading')).toHaveText('View as JSON');
    const text = dialog.locator('textarea');
    await expect(text).toHaveAttribute('readonly', '');
    const json = await text.inputValue();
    expect(JSON.parse(json).config.title).toBe('Tea Shop');

    const [name, saved] = await readDownload(page, () => page.keyboard.press('ControlOrMeta+s'));
    expect(name).toBe('tea-shop.json');
    expect(saved).toBe(json);
  });

  test('keys typed in a dialog never edit the map behind it', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await page.evaluate(() => {
      const viewer = window.__wardleyViewer as unknown as {
        get(name: string): {
          select(elements: unknown): void;
          filter(fn: (element: { wardleyType?: string }) => boolean): unknown[];
        };
      };
      const shapes = viewer.get('elementRegistry').filter((element) => !!element.wardleyType);
      viewer.get('selection').select(shapes);
    });
    await menuEntry(page, 'view-json');
    await textDialog(page, 'json').getByRole('button', { name: 'Copy' }).focus();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    expect((await exportMap(page)).elements).toHaveLength(2);
  });
});

test.describe('title, map size and axis labels', () => {
  test('Map title… renames the map and the browser tab, as one undo step', async ({ page }) => {
    await openApp(page);
    await openExample(page);
    await expect(page).toHaveTitle('Tea Shop · Wardley Maps Modeler');

    await menuEntry(page, 'map-title');
    const dialog = page.locator('dialog.wardley-title-dialog');
    const field = dialog.locator('input');
    await expect(field).toBeFocused();
    await field.fill('Payments Platform');
    await field.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveTitle('Payments Platform · Wardley Maps Modeler');
    expect((await exportMap(page)).config.title).toBe('Payments Platform');

    await menuEntry(page, 'map-title');
    await field.fill('Discarded');
    await closeDialog(dialog, () => field.press('Escape'));
    expect((await exportMap(page)).config.title).toBe('Payments Platform');

    await canvasSlot(page).locator('svg[role="application"]').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page).toHaveTitle('Tea Shop · Wardley Maps Modeler');
  });

  test('Map size… follows a corner drag and its undo, and writes a typed size', async ({
    page,
  }) => {
    await startNewMap(page);
    const corner = page.locator('.wardley-map-resize-xy .wardley-map-resize-hit');
    const box = await corner.boundingBox();
    if (!box) throw new Error('no resize corner');
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 120, start.y - 90, { steps: 8 });
    await page.mouse.up();

    const size = await page.evaluate(() =>
      (
        window.__wardleyViewer as unknown as { getMapSize(): { width: number; height: number } }
      ).getMapSize(),
    );
    expect(size.width).toBeLessThan(1080);

    await menuEntry(page, 'map-size');
    const popover = page.getByRole('dialog', { name: 'Map size' });
    await expect(popover.getByLabel('Size')).toHaveValue('custom');
    await expect(popover.getByLabel('Width')).toHaveValue(String(size.width));
    await expect(popover.getByRole('button', { name: 'Reset to default' })).toBeEnabled();
    await page.keyboard.press('Escape');

    await canvasSlot(page).locator('svg[role="application"]').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await menuEntry(page, 'map-size');
    await expect(popover.getByLabel('Size')).toHaveValue('standard');
    await expect(popover.getByLabel('Width')).toHaveValue('1080');

    await popover.getByLabel('Height').fill('900');
    await popover.getByLabel('Height').press('Enter');
    await popover.getByRole('button', { name: 'Done' }).click();
    await expect.poll(async () => (await exportDSL(page)).includes('size [1080, 900]')).toBe(true);
  });

  test('X-axis labels… previews live and writes one undo step when done', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);

    await menuEntry(page, 'x-axis-labels');
    const popover = page.getByRole('dialog', { name: 'X-axis labels' });
    await popover.getByLabel('Stage 1').fill('Novel');
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
    expect((await exportMap(page)).config).toMatchObject({
      evolutionLabels: ['Novel', 'Custom-Built', 'Product / Rental', 'Commodity / Utility'],
    });

    await canvasSlot(page).locator('svg[role="application"]').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(async () => (await exportMap(page)).config)
      .not.toHaveProperty('evolutionLabels');
  });
});

test.describe('keys and dialogs', () => {
  test('? opens the keyboard shortcuts, with the web app’s File keys first', async ({ page }) => {
    await startNewMap(page);
    await page.keyboard.press('Shift+Slash');
    const dialog = page.locator('dialog.wardley-shortcuts');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.wardley-shortcuts-group-title')).toHaveText([
      'File',
      'View',
      'Edit',
      'Tools',
      'Map',
    ]);
    await expect(dialog.getByRole('row', { name: /Open…/ })).toContainText(/(⌘|Ctrl\+)O/);
    await expect(dialog.getByRole('row', { name: /Paste OWM text/ })).toContainText(/(⌘|Ctrl\+)V/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await menuEntry(page, 'keyboard-shortcuts');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
  });

  test('delete and undo work on the canvas again after a click on the chrome', async ({ page }) => {
    await openApp(page);
    await openExample(page);
    const count = async () => (await exportMap(page)).elements.length;
    const before = await count();

    await page.locator('[data-chrome="zoom"] [data-zoom="in"]').click();
    await page
      .locator('.cd-shell-canvas [data-element-id="cmp_power"] .djs-hit')
      .first()
      .click({ force: true });
    await page.keyboard.press('Delete');
    await expect.poll(count).toBe(before - 1);

    await menuEntry(page, 'keyboard-shortcuts');
    const dialog = page.locator('dialog.wardley-shortcuts');
    await closeDialog(dialog, () => dialog.getByRole('button', { name: 'Close' }).click());
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
    await canvasSlot(page).locator('svg[role="application"]').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(count).toBe(before);
  });
});

test.describe('share', () => {
  test('copies the link, writes it into the address bar and confirms with a toast', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await startNewMap(page);
    await importText(page, MY_MAP);

    await page.locator('[data-chrome="primary"]').click();

    await expect(toast(page, 'Link copied')).toHaveAttribute('data-status', 'success');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/#mz=[\w-]+$/);
    expect(copied).toBe(page.url());

    const shared = await context.newPage();
    await shared.goto(copied);
    await waitForViewer(shared);
    expect(await exportDSL(shared)).toBe(await exportDSL(page));
  });

  test('offers the link to copy by hand when the clipboard is unavailable', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));

    await page.locator('[data-chrome="primary"]').click();

    const refused = toast(page, "Couldn't copy the link.");
    await expect(refused).toHaveAttribute('data-status', 'danger');
    await refused.getByRole('button', { name: 'Show link' }).click();
    const dialog = textDialog(page, 'share');
    await expect(dialog.getByRole('heading')).toHaveText('Share link');
    await expect(dialog.locator('textarea')).toHaveValue(/#mz=/);
    await expect(dialog.locator('textarea')).toBeFocused();
    await expect(toast(page, 'Link copied')).toHaveCount(0);
  });
});

test.describe('the legal line', () => {
  test('names Miragon GmbH and keeps Impressum and Datenschutz German', async ({ page }) => {
    await openApp(page);

    const legal = page.locator('[data-chrome="legal"]');
    const year = new Date().getFullYear();
    await expect(legal.getByRole('link', { name: `© ${year} Miragon GmbH` })).toHaveAttribute(
      'href',
      'https://www.miragon.io/',
    );
    for (const [name, href] of [
      ['Impressum', 'https://www.miragon.io/impressum/'],
      ['Datenschutz', 'https://www.miragon.io/datenschutz/'],
    ] as const) {
      const link = legal.getByRole('link', { name });
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('lang', 'de');
    }
    await expect(legal.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/Miragon/wardley-maps-modeler',
    );
  });
});
