import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import {
  createComponentAt,
  exportDSL,
  exportMap,
  startNewMap,
  waitForViewer,
} from './support/viewer.js';

/**
 * The webapp chrome around the canvas: replacing maps (undo toast instead of confirm prompts),
 * files, the text panel, the map title, map size, dialogs and the shortcut overview. Native
 * `confirm()`/`alert()` prompts must never appear, so every test fails on one.
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

async function importText(page: Page, text: string): Promise<void> {
  await page.evaluate((dsl) => window.__wardleyViewer.importDSL(dsl), text);
}

async function menuItem(page: Page, id: string): Promise<void> {
  await page.locator('#btn-menu').click();
  await page.locator(`#${id}`).click();
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

function toast(page: Page, text: string | RegExp) {
  return page.locator('.toast').filter({ hasText: text });
}

test.describe('replacing the map', () => {
  test('Show example replaces the map and the toast brings it back', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);

    await menuItem(page, 'm-example');
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

  test('New / clear empties the map without a prompt, undoable from the toast', async ({
    page,
  }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuItem(page, 'm-new');
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(0);
    // The session already started: no start card over the cleared canvas.
    await expect(page.locator('#empty-state')).toBeHidden();
    await toast(page, 'Map replaced').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(2);
  });

  test('Cmd/Ctrl+Z and Menu > Undo bring a replaced map back, also after the toast', async ({
    page,
  }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuItem(page, 'm-new');
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(0);
    await expect(toast(page, 'Map replaced')).toBeHidden({ timeout: 15_000 });

    await page.locator('#btn-menu').click();
    await expect(page.locator('#m-undo')).toBeEnabled();
    await page.locator('#btn-menu').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(2);
    await page.locator('#btn-menu').click();
    await expect(page.locator('#m-undo')).toBeDisabled();
  });

  test('the undo offer is withdrawn once the new map is edited or replaced again', async ({
    page,
  }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuItem(page, 'm-example');
    const replaced = toast(page, 'Map replaced');
    await expect(replaced).toBeVisible();
    // Restoring now would silently throw the edit away.
    const title = page.getByRole('textbox', { name: 'Map title' });
    await title.fill('My edited example');
    await title.press('Enter');
    await expect(replaced).toBeHidden();

    await menuItem(page, 'm-new');
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

  test('a damaged share link says so and keeps the link in the address bar', async ({ page }) => {
    await openApp(page, '#mz=bZA7D4-truncated');
    await expect(toast(page, 'This map link is incomplete or damaged')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#mz=bZA7D4-truncated');
    await expect(page.locator('#empty-state')).toBeVisible();
  });
});

test.describe('files and text', () => {
  test('Download .wmap (Cmd/Ctrl+S) round-trips through Open', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-example').click();
    await expect.poll(async () => (await exportMap(page)).config.title).toBe('Tea Shop');
    const original = await exportDSL(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('ControlOrMeta+s'),
    ]);
    expect(download.suggestedFilename()).toBe('tea-shop.wmap');
    const path = await download.path();
    expect(await readFile(path, 'utf8')).toBe(original);

    await menuItem(page, 'm-new');
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(0);
    await page.locator('#file-input').setInputFiles(path);
    await expect.poll(() => exportDSL(page)).toBe(original);
  });

  test('Cmd/Ctrl+S saves a name that is still being typed', async ({ page }) => {
    await startNewMap(page);
    await createComponentAt(page, 0.5, 0.5);
    const field = page.locator('.wardley-label-input');
    await expect(field).toBeFocused();
    await page.keyboard.type('Payments');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('ControlOrMeta+s'),
    ]);
    expect(await readFile(await download.path(), 'utf8')).toContain('component Payments [');
    await expect(field).toHaveCount(0);
  });

  test('View as OWM-DSL edits the map as text with Apply', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuItem(page, 'm-dsl');

    const panel = page.locator('#output');
    await expect(panel).toBeVisible();
    await expect(page.locator('#output-title')).toHaveText('OWM-DSL');
    const apply = page.locator('#output-apply');
    await expect(apply).toBeDisabled();
    const text = page.locator('#output-text');
    expect(await text.evaluate((area: HTMLTextAreaElement) => area.scrollTop)).toBe(0);

    await text.fill(`${MY_MAP}\ncomponent Milk [0.6, 0.6]\ncompnent Typo [0.2, 0.2]`);
    await expect(apply).toBeEnabled();
    await expect(page.locator('#output-diagnostics')).toContainText('Line 5:');

    await text.press('ControlOrMeta+Enter');
    await expect(panel).toBeHidden();
    const labels = (await exportMap(page)).elements.map((element) => element.label);
    expect(labels).toContain('Milk');
    await expect(toast(page, 'Imported with 1 issue')).toBeVisible();
    await toast(page, 'Imported with 1 issue')
      .getByRole('button', { name: 'Show details' })
      .click();
    await expect(page.locator('#issues-list')).toContainText('Line 5:');
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

    await menuItem(page, 'm-dsl');
    const text = await page.locator('#output-text').inputValue();
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
    await page.locator('#canvas svg[role="application"]').focus();
    for (const key of ['p', 'n']) {
      await page.keyboard.press(key);
      await expect(page.locator('.wardley-label-input')).toBeFocused();
      await page.keyboard.press('Escape');
    }
    await menuItem(page, 'm-dsl');
    const before = await page.locator('#output-text').inputValue();
    expect(before.indexOf('pipeline ')).toBeLessThan(before.indexOf('note '));
    await page.locator('#output-close').click();

    await page.reload();
    await waitForViewer(page);
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(2);
    await menuItem(page, 'm-dsl');
    await expect(page.locator('#output-text')).toHaveValue(before);
  });

  test('Fix in OWM-DSL selects the problem line in the map text', async ({ page }) => {
    await startNewMap(page);
    // The unreadable line sits in the middle; the regenerated text moves it to the end.
    await pasteText(
      page,
      'title Bad\ncomponent A [0.5, 0.5]\ncompnent Typo [0.2, 0.2]\ncomponent B [0.3, 0.3]',
    );
    await toast(page, 'Imported with').getByRole('button', { name: 'Show details' }).click();
    await expect(page.locator('#issues-list')).toContainText('Line 3:');
    await page.locator('#issues-edit').click();

    const text = page.locator('#output-text');
    await expect(text).toBeFocused();
    const selected = await text.evaluate((area: HTMLTextAreaElement) =>
      area.value.slice(area.selectionStart, area.selectionEnd),
    );
    expect(selected).toBe('compnent Typo [0.2, 0.2]');
  });

  test('closing the text panel with unapplied edits offers to keep editing', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await menuItem(page, 'm-dsl');
    const text = page.locator('#output-text');
    await text.fill(`${MY_MAP}\ncomponent Draft [0.6, 0.6]`);
    await text.press('Escape');
    await expect(page.locator('#output')).toBeHidden();

    await toast(page, 'Text changes were not applied')
      .getByRole('button', { name: 'Keep editing' })
      .click();
    await expect(page.locator('#output')).toBeVisible();
    await expect(text).toHaveValue(`${MY_MAP}\ncomponent Draft [0.6, 0.6]`);
    await expect(page.locator('#output-apply')).toBeEnabled();
  });
});

test.describe('title and map size', () => {
  test('the inline title renames the map and the browser tab', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-example').click();
    await expect(page).toHaveTitle('Tea Shop · Wardley Mapping');

    const title = page.getByRole('textbox', { name: 'Map title' });
    await title.fill('Payments Platform');
    await title.press('Enter');
    await expect(page).toHaveTitle('Payments Platform · Wardley Mapping');
    expect((await exportMap(page)).config.title).toBe('Payments Platform');

    await title.fill('Discarded');
    await title.press('Escape');
    await expect(title).toHaveValue('Payments Platform');

    await menuItem(page, 'm-undo');
    await expect(title).toHaveValue('Tea Shop');
    await expect(page).toHaveTitle('Tea Shop · Wardley Mapping');
  });

  test('the size control follows a corner drag and its undo', async ({ page }) => {
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

    await page.locator('#btn-menu').click();
    await expect(page.locator('#map-size')).toHaveValue('custom');
    await expect(page.locator('#map-size option[value="custom"]')).toHaveText(
      `Custom (${size.width} × ${size.height})`,
    );
    await expect(page.locator('#map-width')).toHaveValue(String(size.width));
    await expect(page.locator('#map-size-reset')).toBeVisible();

    await page.locator('#m-undo').click();
    await page.locator('#btn-menu').click();
    await expect(page.locator('#map-size')).toHaveValue('standard');
    await expect(page.locator('#map-width')).toHaveValue('1080');
    await expect(page.locator('#map-size-reset')).toBeHidden();

    await page.locator('#map-height').fill('900');
    await page.locator('#map-height').press('Enter');
    await expect.poll(async () => (await exportDSL(page)).includes('size [1080, 900]')).toBe(true);
  });
});

test.describe('dialogs and keyboard', () => {
  test('Escape closes dialogs and gives focus back to the menu', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);

    await menuItem(page, 'm-json');
    await expect(page.locator('#output')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#output')).toBeHidden();
    await expect(page.locator('#btn-menu')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('#m-open')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-dropdown')).toBeHidden();
    await expect(page.locator('#btn-menu')).toBeFocused();

    await menuItem(page, 'm-axis');
    await expect(page.locator('#axis-dialog')).toBeVisible();
    await page.locator('#axis-s0').fill('Novel');
    await page.keyboard.press('Escape');
    await expect(page.locator('#axis-dialog')).toBeHidden();
    await expect(page.locator('#btn-menu')).toBeFocused();
    // The live preview became one undoable step.
    expect((await exportMap(page)).config).toMatchObject({
      evolutionLabels: ['Novel', 'Custom-Built', 'Product / Rental', 'Commodity / Utility'],
    });
    await menuItem(page, 'm-undo');
    await expect
      .poll(async () => (await exportMap(page)).config)
      .not.toHaveProperty('evolutionLabels');
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
    await menuItem(page, 'm-json');
    await page.locator('#output-copy').focus();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    expect((await exportMap(page)).elements).toHaveLength(2);
  });

  test('? opens the keyboard shortcuts, generated per platform', async ({ page }) => {
    await startNewMap(page);
    await page.keyboard.press('Shift+Slash');
    const dialog = page.locator('#shortcuts-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Undo');
    await expect(dialog).toContainText('Resize the map');
    await expect(dialog.locator('kbd').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await menuItem(page, 'm-shortcuts');
    await expect(dialog).toBeVisible();
  });

  test('Undo and Redo in the menu are disabled when there is nothing to do', async ({ page }) => {
    await startNewMap(page);
    await page.locator('#btn-menu').click();
    await expect(page.locator('#m-undo')).toBeDisabled();
    await expect(page.locator('#m-redo')).toBeDisabled();
    await expect(page.locator('#m-undo kbd')).toBeVisible();
  });
});

test.describe('share', () => {
  test('copies the link when the clipboard allows it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await startNewMap(page);
    await importText(page, MY_MAP);
    await page.locator('#btn-share').click();
    await expect(toast(page, 'Share link copied to clipboard')).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('#mz=');
  });

  test('shows the link to copy by hand when the clipboard is unavailable', async ({ page }) => {
    await startNewMap(page);
    await importText(page, MY_MAP);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
    await page.locator('#btn-share').click();
    await expect(page.locator('#output-title')).toHaveText('Share link');
    await expect(page.locator('#output-text')).toHaveValue(/#mz=/);
    await expect(toast(page, 'copied')).toHaveCount(0);
  });
});

test.describe('keyboard focus after chrome clicks', () => {
  test('undo and delete still work after clicking zoom or closing a dialog', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-example').click();
    await expect.poll(async () => (await exportMap(page)).config.title).toBe('Tea Shop');
    const count = async () => (await exportMap(page)).elements.length;
    const before = await count();

    await page.locator('#z-in').click();
    await page.evaluate(() => {
      const viewer = window.__wardleyViewer as unknown as {
        get(name: string): { get?(id: string): unknown; select?(element: unknown): void };
      };
      viewer.get('selection').select!(viewer.get('elementRegistry').get!('cmp_power'));
    });
    await page.keyboard.press('Delete');
    await expect.poll(count).toBe(before - 1);

    await menuItem(page, 'm-shortcuts');
    await page.locator('#shortcuts-close').click();
    await expect(page.locator('#shortcuts-dialog')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(true);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(count).toBe(before);
  });
});

test.describe('onboarding', () => {
  test('the empty-map hint says how to move a node and how to move only its label', async ({
    page,
  }) => {
    await startNewMap(page);
    const hint = page.locator('#onboarding-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Drag a node to move it, or its name to move just the label.');
  });
});

test.describe('short screens', () => {
  test.use({ viewport: { width: 1366, height: 657 } });

  test('the whole menu fits, down to Keyboard shortcuts', async ({ page }) => {
    await startNewMap(page);
    await page.locator('#btn-menu').click();
    const fits = await page.evaluate(() => {
      const panel = document.querySelector('#menu-dropdown')!.getBoundingClientRect();
      const last = document.querySelector('#m-shortcuts')!.getBoundingClientRect();
      return last.bottom <= panel.bottom && panel.bottom <= window.innerHeight;
    });
    expect(fits).toBe(true);
  });
});
