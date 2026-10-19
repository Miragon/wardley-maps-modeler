import { afterEach, describe, expect, it } from 'vitest';
import {
  Modeler,
  createAxisLabelsPopover,
  createMapSizePopover,
  createShortcutsDialog,
  createTitleDialog,
  type EvolutionGrid,
  type PopoverHandle,
  type WardleyReadOnly,
} from '../../src/index.js';
import '../../src/assets/wardley.css';

const MAP = `title Menu
component Kettle [0.43, 0.35]
component Power [0.1, 0.71]
Kettle -> Power`;

let root: HTMLElement | undefined;
let modeler: Modeler | undefined;
let trigger: HTMLButtonElement | undefined;
const handles: Array<{ destroy(): void }> = [];

/** A stand-in for the chrome root of the modeler shell: a sized query container with a trigger. */
async function mount(): Promise<{ modeler: Modeler; root: HTMLElement; trigger: HTMLElement }> {
  root = document.createElement('div');
  root.style.cssText = 'position:relative;width:1024px;height:768px;container-type:size';
  document.body.appendChild(root);
  trigger = document.createElement('button');
  trigger.textContent = 'Menu';
  root.appendChild(trigger);
  const canvas = document.createElement('div');
  canvas.style.cssText = 'position:absolute;inset:0';
  root.appendChild(canvas);
  modeler = new Modeler({ container: canvas });
  await modeler.importDSL(MAP);
  return { modeler, root, trigger };
}

afterEach(() => {
  for (const handle of handles.splice(0)) handle.destroy();
  modeler?.destroy();
  root?.remove();
  modeler = undefined;
  root = undefined;
  trigger = undefined;
});

function chromeOf(target: { root: HTMLElement; trigger: HTMLElement }) {
  return {
    root: target.root,
    menu: { trigger: target.trigger },
    platform: 'mac' as const,
    lang: 'en',
    messages: {
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      zoomToActual: (percent: string) => `Zoom to ${percent}`,
      fit: 'Fit to view',
      close: 'Close',
      keyNames: { ctrl: 'Ctrl', shift: 'Shift', plus: 'Plus', minus: 'Minus' },
    },
  };
}

function keep<T extends { destroy(): void }>(handle: T): T {
  handles.push(handle);
  return handle;
}

function popoverPanel(target: { root: HTMLElement }, className: string): HTMLElement {
  const panel = target.root.querySelector<HTMLElement>(`.${className}`);
  if (!panel) throw new Error(`no ${className}`);
  return panel;
}

function pressEscape(element: Element): void {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
}

function plotSize(target: Modeler) {
  return target.get<EvolutionGrid>('evolutionGrid').getPlotSize();
}

describe('the keyboard shortcuts dialog', () => {
  it('is a modal dialog in the chrome root, with a Close button and focus return', async () => {
    const target = await mount();
    const dialog = keep(createShortcutsDialog(chromeOf(target)));
    target.trigger.focus();
    dialog.open();
    const element = target.root.querySelector<HTMLDialogElement>('dialog.wardley-shortcuts')!;
    expect(element.open).toBe(true);
    expect(element.matches(':modal')).toBe(true);
    const title = document.getElementById(element.getAttribute('aria-labelledby')!);
    expect(title?.textContent).toBe('Keyboard shortcuts');
    expect(element.querySelector('.wardley-dialog-close')?.getAttribute('aria-label')).toBe(
      'Close',
    );
    expect([...element.querySelectorAll('h4')].map((heading) => heading.textContent)).toEqual([
      'View',
      'Edit',
      'Tools',
      'Map',
    ]);
    element.close();
    expect(document.activeElement).toBe(target.trigger);
  });
});

describe('the shortcuts dialog of a web app', () => {
  it('leads with the File keys the app binds itself', async () => {
    const target = await mount();
    const dialog = keep(
      createShortcutsDialog(chromeOf(target), { fileKeys: true, shortcutsKey: '?' }),
    );
    dialog.open();
    const element = target.root.querySelector<HTMLDialogElement>('dialog.wardley-shortcuts')!;
    expect([...element.querySelectorAll('h4')].map((heading) => heading.textContent)).toEqual([
      'File',
      'View',
      'Edit',
      'Tools',
      'Map',
    ]);
    expect(element.querySelector('table')?.textContent).toBe(
      'Open…⌘OExport as .wmap⌘SPaste OWM text or a share link⌘V',
    );
    dialog.close();
  });
});

describe('the map title dialog', () => {
  function titleOf(target: Modeler): string | undefined {
    return target.exportMap().config.title;
  }
  function undoDepth(target: Modeler): number {
    let depth = 0;
    while (target.canUndo()) {
      target.undo();
      depth += 1;
    }
    for (let step = 0; step < depth; step++) target.redo();
    return depth;
  }

  async function opened() {
    const target = await mount();
    const dialog = keep(createTitleDialog(chromeOf(target), target.modeler));
    target.trigger.focus();
    dialog.open();
    const element = target.root.querySelector<HTMLDialogElement>('dialog.wardley-title-dialog')!;
    const field = element.querySelector<HTMLInputElement>('input')!;
    return { target, dialog, element, field };
  }

  it('is a modal dialog with the title selected in its field (guide §8)', async () => {
    const { element, field } = await opened();
    expect(element.matches(':modal')).toBe(true);
    expect(document.getElementById(element.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Map title',
    );
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('Menu');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 4]);
    expect(field.labels?.[0]?.textContent).toBe('Title');
    const buttons = [
      ...element.querySelectorAll<HTMLButtonElement>('.wardley-dialog-footer button'),
    ];
    expect(buttons.map((button) => [button.textContent, button.dataset['variant']])).toEqual([
      ['Cancel', 'secondary'],
      ['Apply', 'primary'],
    ]);
  });

  it('applies the trimmed title as one undo step and gives the focus back', async () => {
    const { target, element, field } = await opened();
    field.value = '  Payments   platform ';
    element.querySelector<HTMLFormElement>('form')!.requestSubmit();
    expect(element.open).toBe(false);
    expect(titleOf(target.modeler)).toBe('Payments platform');
    expect(undoDepth(target.modeler)).toBe(1);
    expect(document.activeElement).toBe(target.trigger);
  });

  it('writes nothing for an unchanged title or on Cancel', async () => {
    const { target, dialog, element, field } = await opened();
    element.querySelector<HTMLFormElement>('form')!.requestSubmit();
    expect(target.modeler.canUndo()).toBe(false);

    dialog.open();
    expect(field.value).toBe('Menu');
    field.value = 'Discarded';
    element.querySelector<HTMLButtonElement>('[data-variant="secondary"]')!.click();
    expect(element.open).toBe(false);
    expect(titleOf(target.modeler)).toBe('Menu');
    expect(target.modeler.canUndo()).toBe(false);
  });

  it('closes without writing once the canvas turns read-only', async () => {
    const { target, element, field } = await opened();
    field.value = 'Locked';
    target.modeler.get<WardleyReadOnly>('wardleyReadOnly').setReadOnly(true);
    expect(element.open).toBe(false);
    expect(titleOf(target.modeler)).toBe('Menu');
  });
});

describe('the map size popover', () => {
  async function opened(): Promise<{
    target: Awaited<ReturnType<typeof mount>>;
    popover: PopoverHandle;
    panel: HTMLElement;
  }> {
    const target = await mount();
    const popover = keep(createMapSizePopover(chromeOf(target), target.modeler));
    popover.open();
    return { target, popover, panel: popoverPanel(target, 'wardley-map-size') };
  }

  it('is a non-modal dialog at the dropdown place, labelled by its title (guide §5.4)', async () => {
    const { target, panel } = await opened();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.hasAttribute('aria-modal')).toBe(false);
    expect(document.getElementById(panel.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Map size',
    );
    // Computed, not measured: the pop-in animation starts 4px higher.
    const style = getComputedStyle(panel);
    expect([style.position, style.top, style.left, style.width]).toEqual([
      'absolute',
      '60px',
      '12px',
      '320px',
    ]);
    expect(panel.offsetParent).toBe(target.root);
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('previews a preset at once and writes one edit when done', async () => {
    const { target, popover, panel } = await opened();
    const before = target.modeler.exportDSL();
    const select = panel.querySelector('select')!;
    select.value = 'large';
    select.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(plotSize(target.modeler).width).toBeGreaterThan(1080);
    expect(target.modeler.canUndo()).toBe(false);

    popover.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(target.modeler.exportDSL()).toContain('size [');
    target.modeler.undo();
    expect(target.modeler.exportDSL()).toBe(before);
    expect(target.modeler.canUndo()).toBe(false);
  });

  it('refuses a width out of range with a message under the field', async () => {
    const { target, panel } = await opened();
    const [width] = panel.querySelectorAll<HTMLInputElement>('input');
    width!.value = '5';
    width!.dispatchEvent(new Event('change'));
    expect(width!.getAttribute('aria-invalid')).toBe('true');
    const error = document.getElementById(width!.getAttribute('aria-describedby')!);
    expect(error?.textContent).toBeTruthy();
    expect(target.modeler.exportDSL()).not.toContain('size [');
  });

  it('closes on Escape with the focus back on the menu trigger', async () => {
    const { target, popover, panel } = await opened();
    pressEscape(panel.querySelector('select')!);
    expect(popover.isOpen()).toBe(false);
    expect(document.activeElement).toBe(target.trigger);
  });

  it('closes without writing when an import replaces the map', async () => {
    const { target, popover, panel } = await opened();
    const select = panel.querySelector('select')!;
    select.value = 'large';
    select.dispatchEvent(new Event('change'));
    await target.modeler.importDSL('title Other\ncomponent A [0.5, 0.5]');
    expect(popover.isOpen()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(target.modeler.exportDSL()).not.toContain('size [');
    expect(target.modeler.canUndo()).toBe(false);
  });

  it('puts the size back without an edit when the canvas turns read-only', async () => {
    const { target, popover, panel } = await opened();
    const before = target.modeler.exportDSL();
    const select = panel.querySelector('select')!;
    select.value = 'large';
    select.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    target.modeler.get<WardleyReadOnly>('wardleyReadOnly').setReadOnly(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(popover.isOpen()).toBe(false);
    expect(target.modeler.exportDSL()).toBe(before);
    expect(target.modeler.canUndo()).toBe(false);
  });
});

describe('the x-axis labels popover', () => {
  it('previews typed stage names and commits one edit when done', async () => {
    const target = await mount();
    const popover = keep(createAxisLabelsPopover(chromeOf(target), target.modeler));
    popover.open();
    const panel = popoverPanel(target, 'wardley-axis-labels');
    expect(document.getElementById(panel.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'X-axis labels',
    );
    const [first] = panel.querySelectorAll<HTMLInputElement>('input');
    expect(document.activeElement).toBe(first);
    first!.value = 'Idea';
    first!.dispatchEvent(new Event('input'));
    const axisText = [...target.root.querySelectorAll('.layer-wardley-axes text')].map((text) =>
      text.textContent?.toLowerCase(),
    );
    expect(axisText).toContain('idea');
    expect(target.modeler.canUndo()).toBe(false);

    first!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(popover.isOpen()).toBe(false);
    expect(target.modeler.exportDSL()).toContain('evolution Idea->');
    target.modeler.undo();
    expect(target.modeler.exportDSL()).not.toContain('evolution Idea->');
  });

  it('closes on a click outside, keeping the typed names', async () => {
    const target = await mount();
    const popover = keep(createAxisLabelsPopover(chromeOf(target), target.modeler));
    popover.open();
    const [first] = popoverPanel(target, 'wardley-axis-labels').querySelectorAll<HTMLInputElement>(
      'input',
    );
    first!.value = 'Idea';
    first!.dispatchEvent(new Event('input'));
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover.isOpen()).toBe(false);
    expect(target.modeler.exportDSL()).toContain('evolution Idea->');
  });
});
