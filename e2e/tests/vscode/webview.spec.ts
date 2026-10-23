import { expect, test, type Locator, type Page } from '@playwright/test';
import { ICONS, type ShellIconName } from '@miragon/modeler-shell';
import { EMPTY_MAP, withExampleInserted } from '../../../apps/vscode/src/examples.js';
import { FIT_TOLERANCE, LONG_NAME_DRAWING, LONG_NAME_MAP, overhang } from '../support/fit.js';
import {
  openWebview,
  postFromHost,
  postedMessages,
  waitForPosted,
  type PostedMessage,
} from './support/webview.js';

/**
 * The webview's side of the protocol with the extension host and the chrome it configures in the
 * shell: menu groups, palette keys, problems pill, empty-file hint, Command Palette commands, the
 * model popovers and the keyboard shortcuts dialog. What the shell guarantees itself is covered by
 * shell-conformance.spec.ts.
 */

async function openMenu(page: Page): Promise<Locator> {
  await page.locator('[data-chrome="menu"]').click();
  const dropdown = page.locator('.cd-shell-menu[role="menu"]');
  await expect(dropdown).toBeVisible();
  return dropdown;
}

function countOf(messages: readonly PostedMessage[], type: string): number {
  return messages.filter((message) => message.type === type).length;
}

/** The icon of a menu entry as Lucide nodes, to compare with the shell's `ICONS`. */
function iconNodesOf(entry: Locator): Promise<Array<[string, Record<string, string>]>> {
  return entry.evaluate((element) =>
    [...(element.querySelector('.cd-shell-menu-item-icon svg')?.children ?? [])].map(
      (child): [string, Record<string, string>] => [
        child.tagName,
        Object.fromEntries(
          [...child.attributes].map((attribute) => [attribute.name, attribute.value]),
        ),
      ],
    ),
  );
}

function lucideNodes(name: ShellIconName): Array<[string, Record<string, string>]> {
  return ICONS[name].map(([tag, attributes]) => [tag, { ...attributes }]);
}

async function viewboxOf(page: Page) {
  return page.evaluate(() => window.connection!.viewport.getViewbox()!);
}

/** The components, anchors, notes, regions and drawings on the map. */
function shapeCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      window
        .modeler!.diagram.get<{ getAll(): Array<Record<string, unknown>> }>('elementRegistry')
        .getAll()
        .filter((element) => typeof element.wardleyType === 'string' && 'evolution' in element)
        .length,
  );
}

function canvasSvg(page: Page): Locator {
  return page.locator('.cd-shell-canvas svg[role="application"]');
}

test.describe('VS Code webview: protocol and chrome', () => {
  test('posts ready exactly once', async ({ page }) => {
    await openWebview(page);
    const messages = await postedMessages(page);
    expect(messages).toContainEqual({ type: 'ready' });
    expect(countOf(messages, 'ready')).toBe(1);
    expect(countOf(messages, 'edit')).toBe(0);
  });

  test('the menu holds Model (map size, x-axis labels), Export (without the file) and Help', async ({
    page,
  }) => {
    await openWebview(page);
    const dropdown = await openMenu(page);

    const layout = await dropdown.evaluate((menu) =>
      [...menu.children].map((child) =>
        child.getAttribute('role') === 'separator' ? '|' : child.getAttribute('data-menu-id'),
      ),
    );
    expect(layout).toEqual([
      'map-size',
      'x-axis-labels',
      '|',
      'export-png',
      'export-svg',
      'export-png-transparent',
      '|',
      'keyboard-shortcuts',
    ]);

    await expect(dropdown.locator('[data-menu-id="map-size"]')).toHaveText('Map size…');
    await expect(dropdown.locator('[data-menu-id="map-size"]')).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    await expect(dropdown.locator('[data-menu-id="x-axis-labels"]')).toHaveText('X-axis labels…');
    const exportPng = dropdown.locator('[data-menu-id="export-png"]');
    const exportSvg = dropdown.locator('[data-menu-id="export-svg"]');
    const shortcuts = dropdown.locator('[data-menu-id="keyboard-shortcuts"]');
    await expect(exportPng).toHaveText('Export as PNG');
    await expect(exportSvg).toHaveText('Export as SVG');
    await expect(dropdown.locator('[data-menu-id="export-png-transparent"]')).toHaveText(
      'Export as PNG (4×, transparent)',
    );
    await expect(shortcuts).toHaveText('Keyboard shortcuts…');
    await expect(shortcuts).toHaveAttribute('aria-haspopup', 'dialog');
    expect(await iconNodesOf(exportPng)).toEqual(lucideNodes('file-image'));
    expect(await iconNodesOf(exportSvg)).toEqual(lucideNodes('file-code-corner'));
    expect(await iconNodesOf(shortcuts)).toEqual(lucideNodes('keyboard'));
  });

  test('Map size… previews at once and posts one edit when done', async ({ page }) => {
    await openWebview(page);
    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-id="map-size"]').click();
    const popover = page.locator('.cd-shell .wardley-map-size[role="dialog"]');
    await expect(popover).toBeVisible();
    await expect(popover.locator('select')).toBeFocused();

    await popover.locator('select').selectOption('large');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window
              .modeler!.diagram.get<{ getPlotSize(): { width: number } }>('evolutionGrid')
              .getPlotSize().width,
        ),
      )
      .toBe(1440);
    expect(countOf(await postedMessages(page), 'edit')).toBe(0);

    await popover.getByRole('button', { name: 'Done' }).click();
    await expect(popover).toBeHidden();
    const edit = await waitForPosted(page, 'edit');
    expect(edit.text).toMatch(/^size \[1440, 900\]$/m);
    expect(countOf(await postedMessages(page), 'edit')).toBe(1);
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
  });

  test('X-axis labels… writes the typed stage names into the document', async ({ page }) => {
    await openWebview(page);
    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-id="x-axis-labels"]').click();
    const popover = page.locator('.cd-shell .wardley-axis-labels[role="dialog"]');
    await expect(popover).toBeVisible();
    const first = popover.locator('input').first();
    await expect(first).toBeFocused();
    await first.fill('Idea');
    await first.press('Enter');
    await expect(popover).toBeHidden();
    const edit = await waitForPosted(page, 'edit');
    expect(edit.text).toMatch(/^evolution Idea->/m);
  });

  test('a canvas edit posts the new document text', async ({ page }) => {
    await openWebview(page, { map: 'empty' });
    await page.locator('.djs-palette [data-action="create.component"]').click();
    const canvas = (await page.locator('.cd-shell-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.5, {
      steps: 6,
    });
    await page.mouse.down();
    await page.mouse.up();

    const edit = await waitForPosted(page, 'edit');
    expect(edit.text).toMatch(/^title New map$/m);
    expect(edit.text).toMatch(/^component Component \[[\d.]+, [\d.]+\]$/m);
  });

  test('undo on the canvas belongs to the VS Code document, not to the canvas', async ({
    page,
  }) => {
    await openWebview(page, { map: 'empty' });
    await page
      .locator('.djs-palette[data-chrome="palette"] [data-action="create.component"]')
      .focus();
    await page.keyboard.press('Enter');
    await waitForPosted(page, 'edit');
    await page.keyboard.press('Escape');
    const editsBefore = countOf(await postedMessages(page), 'edit');
    expect(await shapeCount(page)).toBe(1);

    await canvasSvg(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await page.waitForTimeout(300);

    expect(await shapeCount(page)).toBe(1);
    expect(countOf(await postedMessages(page), 'edit')).toBe(editsBefore);
  });

  test('a dark VS Code theme keeps the map light; high contrast passes at runtime', async ({
    page,
  }) => {
    await openWebview(page, { requested: { theme: 'dark' } });
    const html = page.locator('html');
    const colours = () =>
      page.evaluate(() => ({
        grund: getComputedStyle(document.documentElement).getPropertyValue('--cd-ui-grund').trim(),
        paper: getComputedStyle(document.querySelector('.cd-shell-canvas')!).backgroundColor,
      }));
    const light = { grund: '#F9F7F7', paper: 'rgb(249, 247, 247)' };

    await expect(html).toHaveAttribute('data-cd-theme', 'light');
    await expect(html).not.toHaveAttribute('data-cd-kontrast');
    expect(await colours()).toEqual(light);

    await page.evaluate(() => window.__modelerShellVsCodeStub!.setColorThemeKind(3));
    await expect(html).toHaveAttribute('data-cd-kontrast', 'hoch');
    await expect(html).toHaveAttribute('data-cd-theme', 'light');
    expect(await colours()).toEqual(light);

    await page.evaluate(() => window.__modelerShellVsCodeStub!.setColorThemeKind(2));
    await expect(html).not.toHaveAttribute('data-cd-kontrast');
    await expect(html).toHaveAttribute('data-cd-theme', 'light');
  });

  test('an empty map shows the hint; Insert example asks the host, whose update fits', async ({
    page,
  }) => {
    await openWebview(page, { map: 'empty' });
    const hint = page.locator('.cd-shell-hint');
    await expect(hint).toBeVisible();
    await expect(hint.locator('.cd-shell-hint-text')).toHaveText(
      'Pick a tool from the palette to start.',
    );

    await hint.locator('.cd-shell-hint-action').click();
    await waitForPosted(page, 'insertExample');
    expect(countOf(await postedMessages(page), 'edit')).toBe(0);

    await postFromHost(page, { type: 'update', text: withExampleInserted(EMPTY_MAP) });
    await expect(hint).toBeHidden();
    await expect(page.locator('.cd-shell-canvas [data-element-id="cmp_kettle"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.connection!.viewport.isAutomatic() && window.connection!.viewport.canFit(),
        ),
      )
      .toBe(true);
  });

  test('a problems message shows the pill; activating it asks for the Problems view', async ({
    page,
  }) => {
    await openWebview(page);
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toBeHidden();

    await postFromHost(page, { type: 'problems', count: 2, errors: 0 });
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('aria-label', '2 problems, no errors');

    await pill.click();
    await waitForPosted(page, 'showProblems');

    await postFromHost(page, { type: 'problems', count: 0, errors: 0 });
    await expect(pill).toBeHidden();
  });

  test('the fitView command fits the map again after a zoom', async ({ page }) => {
    await openWebview(page);
    const fitted = await viewboxOf(page);

    await page.locator('[data-chrome="zoom"] [data-zoom="in"]').click();
    await expect
      .poll(() => page.evaluate(() => window.connection!.viewport.isAutomatic()))
      .toBe(false);
    expect((await viewboxOf(page)).width).toBeLessThan(fitted.width);

    await postFromHost(page, { type: 'command', name: 'fitView' });
    await expect
      .poll(async () => {
        const now = await viewboxOf(page);
        return [now.x - fitted.x, now.y - fitted.y, now.width - fitted.width].every(
          (delta) => Math.abs(delta) < 0.5,
        );
      })
      .toBe(true);
    expect(await page.evaluate(() => window.connection!.viewport.isAutomatic())).toBe(true);
  });

  test('the fitView command frames a name that runs past the plot in the free area', async ({
    page,
  }) => {
    await openWebview(page);
    await postFromHost(page, { type: 'update', text: LONG_NAME_MAP });
    await expect(page.locator(`.cd-shell-canvas ${LONG_NAME_DRAWING}`)).toHaveCount(1);
    const outside = async (): Promise<number> =>
      overhang(page, LONG_NAME_DRAWING, await page.evaluate(() => window.shell!.fitInsets()));

    const zoomIn = page.locator('[data-chrome="zoom"] [data-zoom="in"]');
    await zoomIn.click();
    await zoomIn.click();
    await expect.poll(outside).toBeGreaterThan(FIT_TOLERANCE);
    await postFromHost(page, { type: 'command', name: 'fitView' });
    await expect.poll(outside).toBeLessThanOrEqual(FIT_TOLERANCE);
  });

  test('the export commands and menu entries post the exported image', async ({ page }) => {
    await openWebview(page);
    await postFromHost(page, { type: 'command', name: 'exportSvg' });
    const svg = await waitForPosted(page, 'export');
    expect(svg.format).toBe('svg');
    expect(typeof svg.data).toBe('string');
    // The map itself, not a palette icon (the chrome moves the palette in front of the canvas).
    expect(String(svg.data)).toContain('data-element-id="cmp_kettle"');
    expect(String(svg.data)).not.toContain('wardley-palette');

    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-id="export-png"]').click();
    await expect
      .poll(async () =>
        (await postedMessages(page))
          .filter((message) => message.type === 'export')
          .map((message) => message.format),
      )
      .toEqual(['svg', 'png']);

    await postFromHost(page, { type: 'command', name: 'exportPngTransparent' });
    await expect
      .poll(async () =>
        (await postedMessages(page))
          .filter((message) => message.type === 'export')
          .map((message) => message.format),
      )
      .toEqual(['svg', 'png', 'png-transparent']);
    const transparent = (await postedMessages(page)).find(
      (message) => message.type === 'export' && message.format === 'png-transparent',
    );
    expect(String(transparent?.data)).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  test('the keyboard shortcuts dialog opens from Help, closes on Escape and backdrop', async ({
    page,
  }) => {
    await openWebview(page);
    const trigger = page.locator('[data-chrome="menu"]');
    const dialog = page.locator('.cd-shell dialog.wardley-shortcuts');

    for (const close of ['Escape', 'backdrop'] as const) {
      const dropdown = await openMenu(page);
      await dropdown.locator('[data-menu-id="keyboard-shortcuts"]').click();
      await expect(dialog).toHaveAttribute('open', '');
      await expect(dialog).toBeVisible();
      const labelledBy = await dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      await expect(page.locator(`[id="${labelledBy}"]`)).toHaveText('Keyboard shortcuts');
      await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();

      if (close === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(4, 4);
      await expect(dialog).not.toHaveAttribute('open', '');
      await expect(trigger).toBeFocused();
    }
  });

  test('palette entries name their tool and expose its key', async ({ page }) => {
    await openWebview(page);
    const entries = [
      { action: 'lasso-tool', label: 'Lasso', key: 'L' },
      { action: 'create.component', label: 'Component', key: 'C' },
      { action: 'create.anchor', label: 'Anchor / User', key: 'U' },
      { action: 'draw-tool', label: 'Draw', key: undefined },
    ];
    for (const { action, label, key } of entries) {
      const entry = page.locator(`.djs-palette[data-chrome="palette"] [data-action="${action}"]`);
      await expect(entry).toHaveAttribute('aria-label', label);
      if (key) await expect(entry).toHaveAttribute('aria-keyshortcuts', key);
      else await expect(entry).not.toHaveAttribute('aria-keyshortcuts');
      await expect(entry).not.toHaveAttribute('title');
    }
  });
});

const GRUND = 'rgb(249, 247, 247)';

test.describe('VS Code webview: canvas', () => {
  // Guide §10.7 and §13.5: `style dark` is kept in the text but never painted, so no navy map
  // sits under light chrome, in a light or a dark VS Code theme.
  for (const theme of ['light', 'dark'] as const) {
    test(`a \`style dark\` map stays light in a ${theme} theme`, async ({ page }) => {
      await openWebview(page, { requested: { theme } });
      await postFromHost(page, {
        type: 'update',
        text: 'title Night\nstyle dark\ncomponent A [0.5, 0.5]\n',
      });
      await expect(page.locator('.cd-shell-canvas [data-element-id="cmp_a"]')).toBeVisible();
      const painted = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-cd-theme'),
        grund: getComputedStyle(document.documentElement).getPropertyValue('--cd-ui-grund').trim(),
        container: getComputedStyle(document.querySelector('.wardley-container')!).backgroundColor,
        canvas: getComputedStyle(document.querySelector('.cd-shell-canvas')!).backgroundColor,
        dark: document.querySelector('.wardley-dark') !== null,
      }));
      expect(painted).toEqual({
        theme: 'light',
        grund: '#F9F7F7',
        container: GRUND,
        canvas: GRUND,
        dark: false,
      });
    });
  }

  // Guide §5.9: a Wardley map always has its plot, so an empty file fits the plot like any map,
  // never past 100%.
  test('an empty file fits its plot', async ({ page }) => {
    await openWebview(page, { map: 'empty' });
    await expect
      .poll(() => page.evaluate(() => window.connection!.viewport.isAutomatic()))
      .toBe(true);
    const zoom = await page.evaluate(() =>
      window.modeler!.diagram.get<{ zoom(): number }>('canvas').zoom(),
    );
    expect(zoom).toBeLessThanOrEqual(1);
    await expect(page.locator('.cd-shell-canvas .layer-wardley-axes')).toBeVisible();
  });

  // Guide §5.5: a keyboard user creates components too.
  test('Enter on a creating palette entry adds one selected component with its label editor', async ({
    page,
  }) => {
    await openWebview(page, { map: 'empty' });
    const entry = page.locator(
      '.djs-palette[data-chrome="palette"] [data-action="create.component"]',
    );
    await entry.focus();
    await page.keyboard.press('Enter');

    const edit = await waitForPosted(page, 'edit');
    expect(edit.text).toMatch(/^component Component \[[\d.]+, [\d.]+\]$/m);
    expect(countOf(await postedMessages(page), 'edit')).toBe(1);
    expect(await shapeCount(page)).toBe(1);
    await expect(page.locator('.cd-shell-canvas .djs-shape.selected')).toHaveCount(1);
    const field = page.locator('input.wardley-label-input');
    await expect(field).toBeFocused();

    await field.fill('Kettle');
    await page.keyboard.press('Enter');
    await expect.poll(async () => countOf(await postedMessages(page), 'edit')).toBe(2);
    expect((await waitForPosted(page, 'edit')).text).toMatch(
      /^component Kettle \[[\d.]+, [\d.]+\]$/m,
    );
  });

  test('Cmd/Ctrl+A on the canvas selects the whole map and never reaches VS Code', async ({
    page,
  }) => {
    await openWebview(page);
    await page.evaluate(() => {
      const seen: boolean[] = [];
      (window as unknown as { selectAllAtWindow: boolean[] }).selectAllAtWindow = seen;
      window.addEventListener('keydown', (event) => {
        if (event.key === 'a') seen.push(event.defaultPrevented);
      });
    });
    await canvasSvg(page).focus();
    await page.keyboard.press('ControlOrMeta+a');

    // Stopped before window, or at least prevented: VS Code runs no Select All of its own.
    const atWindow = await page.evaluate(
      () => (window as unknown as { selectAllAtWindow: boolean[] }).selectAllAtWindow,
    );
    expect(atWindow.every((prevented) => prevented)).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.modeler!.diagram.get<{ get(): unknown[] }>('selection').get().length,
        ),
      )
      .toBeGreaterThanOrEqual(await shapeCount(page));
  });

  // An invalid file (guide §13.5): the canvas keeps the last valid map and edits nothing until
  // the text is valid again. The DSL reads every text today, so the test makes one import fail.
  test('a failed import locks the canvas: no context pad, no delete, no edit, no Model entries', async ({
    page,
  }) => {
    await openWebview(page);
    await page.evaluate(() => {
      const modeler = window.modeler!;
      const importText = modeler.importText.bind(modeler);
      modeler.importText = () => {
        modeler.importText = importText;
        return Promise.reject(new Error('not importable'));
      };
    });
    await postFromHost(page, { type: 'update', text: 'title Broken\n' });
    await expect(page.locator('[data-chrome="status"]')).toBeVisible();

    // Water's own hit area: Cup of Tea sits under its links.
    const water = page.locator(
      '.cd-shell-canvas .djs-shape[data-element-id="cmp_water"] > .djs-hit',
    );
    await water.click();
    await expect(page.locator('.cd-shell-canvas .djs-shape.selected')).toHaveCount(1);
    await expect(page.locator('.djs-context-pad .entry')).toHaveCount(0);
    const shapes = await shapeCount(page);
    await page.keyboard.press('Delete');
    await water.dblclick();
    await expect(page.locator('input.wardley-label-input')).toHaveCount(0);
    expect(await shapeCount(page)).toBe(shapes);
    expect(countOf(await postedMessages(page), 'edit')).toBe(0);

    const dropdown = await openMenu(page);
    await expect(dropdown.locator('[data-menu-id="map-size"]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(dropdown.locator('[data-menu-id="export-svg"]')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.keyboard.press('Escape');

    // The next valid import lifts the lock (the context pad opens on a selection change, so start
    // from an empty selection).
    await postFromHost(page, { type: 'update', text: withExampleInserted(EMPTY_MAP) });
    await expect(page.locator('[data-chrome="status"]')).toBeHidden();
    await page.evaluate(() =>
      window.modeler!.diagram.get<{ select(elements: unknown): void }>('selection').select(null),
    );
    await water.click();
    await expect(page.locator('.djs-context-pad .entry').first()).toBeVisible();
  });
});
