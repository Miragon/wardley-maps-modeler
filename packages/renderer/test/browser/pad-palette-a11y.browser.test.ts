import { afterEach, describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type PopupMenu from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Element } from 'diagram-js/lib/model/Types';
import Diagram from 'diagram-js/lib/Diagram';
import PaletteModule from 'diagram-js/lib/features/palette';
import type Palette from 'diagram-js/lib/features/palette/Palette';
import { Modeler } from '../../src/index.js';
import {
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from '../../src/model/di-types.js';
import { POPUP_PROVIDER_ID } from '../../src/popup/index.js';
import type EvolutionGrid from '../../src/evolution-grid/EvolutionGrid.js';
import type WardleyColorPicker from '../../src/color-picker/WardleyColorPicker.js';
import type WardleyLinkEditing from '../../src/link-editing/WardleyLinkEditing.js';
import { SNAP_TOLERANCE_SCREEN_PX } from '../../src/snapping/StageSnapping.js';
import '../../src/assets/wardley.css';

const TEA_SHOP = `title Tea Shop
anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61]
component Kettle [0.43, 0.35]
component Power [0.10, 0.70]
pioneers [0.60, 0.05, 0.45, 0.25]
Business -> Cup of Tea
Cup of Tea -> Kettle
Kettle -> Power`;

let container: HTMLElement | undefined;
let modeler: Modeler | undefined;

function mount(width = 1024, height = 768): Modeler {
  container = document.createElement('div');
  document.body.appendChild(container);
  // The viewer sizes its container from these options (default 100%), not from inline styles.
  modeler = new Modeler({ container, width, height });
  return modeler;
}

afterEach(() => {
  modeler?.destroy();
  container?.remove();
  modeler = undefined;
  container = undefined;
});

function findByLabel(target: Modeler, label: string): WardleyShape {
  const shape = target
    .get<ElementRegistry>('elementRegistry')
    .find((el) => isWardleyShape(el) && el.wardleyLabel === label) as WardleyShape | undefined;
  if (!shape) throw new Error(`shape not found: ${label}`);
  return shape;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

async function selectAndOpenPad(target: Modeler, shape: WardleyShape): Promise<HTMLElement> {
  target.get<Selection>('selection').select(shape as unknown as Element);
  await nextFrame();
  const pad = target.container.querySelector<HTMLElement>('.djs-context-pad.open');
  if (!pad) throw new Error('context pad not open');
  return pad;
}

function padEntry(pad: HTMLElement, action: string): HTMLElement | null {
  return pad.querySelector<HTMLElement>(`.entry[data-action="${action}"]`);
}

function pressKey(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function contains(outer: DOMRect, inner: DOMRect): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.right <= outer.right + 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.bottom <= outer.bottom + 0.5
  );
}

describe('palette', () => {
  it('stays a single row with every tool inside the bar on a 600px-high canvas', async () => {
    const target = mount(1024, 600);
    await target.importDSL(TEA_SHOP);
    target.get<Canvas>('canvas').resized();
    await nextFrame();

    const palette = target.container.querySelector<HTMLElement>('.djs-palette')!;
    expect(palette.classList.contains('two-column')).toBe(false);
    const paletteBox = palette.getBoundingClientRect();
    expect(paletteBox.width).toBeGreaterThan(500);
    const entries = Array.from(palette.querySelectorAll<HTMLElement>('.entry'));
    expect(entries.length).toBeGreaterThanOrEqual(14);
    const rows = new Set(entries.map((entry) => Math.round(entry.getBoundingClientRect().top)));
    expect(rows.size).toBe(1);
    for (const entry of entries)
      expect(contains(paletteBox, entry.getBoundingClientRect())).toBe(true);
  });

  it('never grows wider than a narrow canvas', async () => {
    const target = mount(480, 600);
    await target.importDSL(TEA_SHOP);
    await nextFrame();
    const palette = target.container.querySelector<HTMLElement>('.djs-palette')!;
    expect(palette.getBoundingClientRect().width).toBeLessThanOrEqual(480 - 24 + 0.5);
  });

  it('is a toolbar with one tab stop, arrow-key navigation and shortcut hints', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const palette = target.container.querySelector<HTMLElement>('.djs-palette')!;
    expect(palette.getAttribute('role')).toBe('toolbar');
    expect(palette.getAttribute('aria-label')).toBe('Tools');

    const entries = Array.from(palette.querySelectorAll<HTMLElement>('.entry'));
    expect(entries.filter((entry) => entry.tabIndex === 0)).toHaveLength(1);
    expect(entries[0]!.tabIndex).toBe(0);

    entries[0]!.focus();
    pressKey(entries[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(entries[1]);
    expect(entries[1]!.tabIndex).toBe(0);
    expect(entries[0]!.tabIndex).toBe(-1);
    pressKey(entries[1]!, 'ArrowLeft');
    expect(document.activeElement).toBe(entries[0]);

    const shortcuts = Object.fromEntries(
      entries.map((entry) => [entry.dataset['action'], entry.getAttribute('aria-keyshortcuts')]),
    );
    expect(shortcuts).toMatchObject({
      'lasso-tool': 'L',
      'create.component': 'C',
      'create.anchor': 'U',
      'create.note': 'N',
      'create.pipeline': 'P',
    });
  });

  it('creates a component at the visible plot centre on Enter and starts naming it', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const canvas = target.get<Canvas>('canvas');
    const entry = target.container.querySelector<HTMLElement>(
      '.djs-palette .entry[data-action="create.component"]',
    )!;
    entry.focus();
    const before = target.exportMap().elements.length;
    const event = pressKey(entry, 'Enter');
    expect(event.defaultPrevented).toBe(true);

    expect(target.exportMap().elements.length).toBe(before + 1);
    const selected = target.get<Selection>('selection').get() as unknown as WardleyShape[];
    expect(selected).toHaveLength(1);
    const created = selected[0]!;
    expect(created.wardleyType).toBe('component');
    const viewbox = canvas.viewbox();
    expect(created.x + created.width / 2).toBeCloseTo(viewbox.x + viewbox.width / 2, 0);
    expect(document.activeElement?.classList.contains('wardley-label-input')).toBe(true);
  });

  it('draws the tool glyphs in currentColor so the armed state can invert them', () => {
    const target = mount();
    void target.get<Canvas>('canvas');
    const lassoGlyph = target.container.querySelector(
      '.djs-palette .entry[data-action="lasso-tool"] svg rect',
    );
    expect(lassoGlyph?.getAttribute('stroke')).toBe('currentColor');
  });
});

describe('context pad', () => {
  it('is a compact icon grid with delete last', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const pad = await selectAndOpenPad(target, findByLabel(target, 'Cup of Tea'));

    expect(pad.getBoundingClientRect().height).toBeLessThan(80);
    const entries = Array.from(pad.querySelectorAll<HTMLElement>('.entry'));
    for (const entry of entries) {
      const box = entry.getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
      expect(entry.getAttribute('role')).toBe('button');
      expect(entry.tabIndex).toBe(0);
      expect(entry.getAttribute('aria-label')).toBeTruthy();
    }
    const actions = entries.map((entry) => entry.dataset['action']);
    expect(actions[0]).toBe('edit-label');
    expect(actions.at(-1)).toBe('delete');
    expect(actions).toEqual([
      'edit-label',
      'append',
      'connect',
      'evolve',
      'settings',
      'color',
      'link',
      'delete',
    ]);
    for (const action of ['append', 'connect', 'evolve']) {
      expect(padEntry(pad, action)?.getAttribute('draggable')).toBe('true');
    }
  });

  it('offers no label editing for unlabelled attitude regions', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const region = target
      .get<ElementRegistry>('elementRegistry')
      .find((el) => isWardleyShape(el) && el.wardleyType === 'attitude') as WardleyShape;
    const pad = await selectAndOpenPad(target, region);
    expect(padEntry(pad, 'edit-label')).toBeNull();
    expect(padEntry(pad, 'delete')).not.toBeNull();
  });

  it('activates entries with Enter and Space', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const kettle = findByLabel(target, 'Kettle');
    let pad = await selectAndOpenPad(target, kettle);

    const edit = padEntry(pad, 'edit-label')!;
    edit.focus();
    pressKey(edit, 'Enter');
    const input = target.container.querySelector<HTMLInputElement>('.wardley-label-input');
    expect(input?.value).toBe('Kettle');
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    pad = await selectAndOpenPad(target, kettle);
    const remove = padEntry(pad, 'delete')!;
    remove.focus();
    pressKey(remove, ' ');
    expect(target.get<ElementRegistry>('elementRegistry').get(kettle.id)).toBeUndefined();
    expect(document.activeElement?.tagName.toLowerCase()).toBe('svg');
  });

  it('appends a connected component with Enter (no pointer to drag to)', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const power = findByLabel(target, 'Power');
    const pad = await selectAndOpenPad(target, power);
    const append = padEntry(pad, 'append')!;
    append.focus();
    pressKey(append, 'Enter');

    const map = target.exportMap();
    const created = map.elements.find((el) => el.label === 'Component');
    expect(created).toBeDefined();
    expect(map.edges.some((edge) => edge.from === power.id && edge.to === created!.id)).toBe(true);
    expect(created!.position.visibility).toBeLessThan(power.visibility);
  });

  it('keeps working for connections', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const connection = target
      .get<ElementRegistry>('elementRegistry')
      .find((el) => (el as { wardleyType?: string }).wardleyType === 'dependency')!;
    target.get<Selection>('selection').select(connection);
    await nextFrame();
    const pad = target.container.querySelector<HTMLElement>('.djs-context-pad.open')!;
    const actions = Array.from(pad.querySelectorAll<HTMLElement>('.entry')).map(
      (entry) => entry.dataset['action'],
    );
    expect(actions).toEqual(['edit-value', 'delete']);
  });
});

describe('settings popup', () => {
  it('shows the Inertia option without scrolling', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const cup = findByLabel(target, 'Cup of Tea');
    target
      .get<PopupMenu>('popupMenu')
      .open(cup as unknown as Element, POPUP_PROVIDER_ID, { x: 300, y: 120 });
    await nextFrame();
    const results = document.querySelector<HTMLElement>(
      '.djs-popup.wardley-element-settings .djs-popup-results',
    )!;
    const inertia = results.querySelector<HTMLElement>('[data-id="prop-inertia"]')!;
    expect(results.scrollHeight).toBeLessThanOrEqual(results.clientHeight + 1);
    expect(contains(results.getBoundingClientRect(), inertia.getBoundingClientRect())).toBe(true);
    target.get<PopupMenu>('popupMenu').close();
  });
});

describe('hover and selection emphasis', () => {
  it('darkens shapes but never the label text (no grey halo smudge)', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const kettle = findByLabel(target, 'Kettle');
    const canvas = target.get<Canvas>('canvas');
    canvas.addMarker(kettle, 'hover');
    const gfx = canvas.getGraphics(kettle);
    const visual = gfx.querySelector('.djs-visual')!;
    const text = visual.querySelector('text')!;
    const circle = visual.querySelector('circle')!;
    expect(getComputedStyle(text).filter).toBe('none');
    expect(getComputedStyle(visual).filter).toBe('none');
    expect(getComputedStyle(circle).filter).toContain('brightness');
    expect(getComputedStyle(circle).filter).not.toContain('saturate');
  });

  it('marks a selected connection with a darker, thicker line', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const connection = target
      .get<ElementRegistry>('elementRegistry')
      .find((el) => (el as { wardleyType?: string }).wardleyType === 'dependency')!;
    const line = target
      .get<Canvas>('canvas')
      .getGraphics(connection as unknown as WardleyConnection)
      .querySelector('.djs-visual > polyline')!;
    const idleWidth = parseFloat(getComputedStyle(line).strokeWidth);
    target.get<Selection>('selection').select(connection);
    expect(parseFloat(getComputedStyle(line).strokeWidth)).toBeGreaterThan(idleWidth);
    expect(getComputedStyle(line).stroke).toBe('rgb(29, 29, 29)');
  });
});

describe('colour picker', () => {
  it('is a labelled dialog with pressed state, grid navigation and focus return', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const kettle = findByLabel(target, 'Kettle');
    target.get<WardleyColorPicker>('wardleyColorPicker').open(kettle, 200, 200);
    const dialog = target.container.querySelector<HTMLElement>('.wardley-color-picker')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Color');

    const swatches = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));
    expect(swatches[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(
      swatches.slice(1).every((swatch) => swatch.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);
    expect(document.activeElement).toBe(swatches[0]);

    pressKey(swatches[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(swatches[1]);
    pressKey(swatches[1]!, 'ArrowDown');
    expect(document.activeElement).toBe(swatches[4]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    pressKey(swatches[4]!, 'Escape');
    expect(target.container.querySelector('.wardley-color-picker')).toBeNull();
    expect(document.activeElement?.tagName.toLowerCase()).toBe('svg');
  });
});

describe('canvas accessibility', () => {
  it('names the canvas svg for assistive technology', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const svg = target.container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('application');
    expect(svg.getAttribute('aria-roledescription')).toBe('Wardley map');
    expect(svg.getAttribute('aria-label')).toBe('Map canvas');
  });

  it('keeps the editor semantics out of the exported SVG', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const { svg } = await target.saveSVG();
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    expect(root.getAttribute('role')).toBeNull();
    expect(root.getAttribute('aria-roledescription')).toBeNull();
    expect(root.getAttribute('aria-label')).toBeNull();
  });

  it('auto-scrolls the canvas while dragging near an edge', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const canvas = target.get<Canvas>('canvas');
    canvas.zoom(2.5);
    const before = canvas.viewbox().x;
    const autoScroll = target.get<{
      startScroll(point: { x: number; y: number }): void;
      stopScroll(): void;
    }>('autoScroll');
    autoScroll.startScroll({ x: 5, y: 300 });
    autoScroll.stopScroll();
    expect(canvas.viewbox().x).toBeLessThan(before);
  });
});

describe('links (OWM url)', () => {
  it('sets a link on a palette-created submap that round-trips through the DSL', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const entry = target.container.querySelector<HTMLElement>(
      '.djs-palette .entry[data-action="create.submap"]',
    )!;
    pressKey(entry, 'Enter');
    (document.activeElement as HTMLElement | null)?.blur();
    const submap = findByLabel(target, 'Submap');
    expect(submap.businessObject).toBeUndefined();

    const pad = await selectAndOpenPad(target, submap);
    const link = padEntry(pad, 'link')!;
    link.focus();
    pressKey(link, 'Enter');
    const input = target.container.querySelector<HTMLInputElement>('.wardley-link-input')!;
    expect(document.activeElement).toBe(input);
    input.value = ' https://example.com/sub[map]\n.wmap ';
    pressKey(input, 'Enter');

    const commandStack = target.get<CommandStack>('commandStack');
    const dsl = target.exportDSL();
    expect(dsl).toMatch(/^url \S.* \[https:\/\/example\.com\/submap\.wmap\]$/m);
    expect(dsl).toMatch(/^submap Submap \[[^\]]+\] url\(.+\)$/m);

    commandStack.undo();
    expect(target.exportDSL()).not.toContain('example.com');
    commandStack.redo();

    await target.importDSL(target.exportDSL());
    const reimported = target.exportMap().elements.find((el) => el.label === 'Submap');
    expect(reimported).toMatchObject({ urlRef: 'https://example.com/submap.wmap' });
  });

  it('stores a component link and offers to open it', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const kettle = findByLabel(target, 'Kettle');
    const linkEditing = target.get<WardleyLinkEditing>('wardleyLinkEditing');
    expect(linkEditing.setLink(kettle, './kettle.wmap')).toBe(true);
    expect(target.exportMap().elements.find((el) => el.label === 'Kettle')).toMatchObject({
      url: './kettle.wmap',
    });
    const pad = await selectAndOpenPad(target, kettle);
    expect(padEntry(pad, 'open-link')).not.toBeNull();
    expect(padEntry(pad, 'link')?.getAttribute('aria-label')).toBe('Edit link…');
  });

  it('rejects javascript: addresses when editing and never offers to open them', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const kettle = findByLabel(target, 'Kettle');
    const linkEditing = target.get<WardleyLinkEditing>('wardleyLinkEditing');
    expect(linkEditing.setLink(kettle, 'javascript:alert(1)')).toBe(false);
    expect(linkEditing.setLink(kettle, 'java\nscript:alert(1)')).toBe(false);

    linkEditing.activate(kettle);
    const input = target.container.querySelector<HTMLInputElement>('.wardley-link-input')!;
    input.value = 'JavaScript:alert(1)';
    pressKey(input, 'Enter');
    expect(input.isConnected).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // The same visible, announced error as the name editor, not a hover-only tooltip.
    expect(input.classList.contains('wardley-label-input--error')).toBe(true);
    expect(input.hasAttribute('title')).toBe(false);
    const caption = document.getElementById(input.getAttribute('aria-describedby')!)!;
    expect(caption.getAttribute('role')).toBe('alert');
    expect(caption.textContent).toContain('relative path');
    pressKey(input, 'Escape');
    expect(caption.isConnected).toBe(false);
    expect(target.exportMap().elements.find((el) => el.label === 'Kettle')).not.toHaveProperty(
      'url',
    );

    await target.importDSL(`title Shared
url Evil [javascript:alert(1)]
component Trap [0.5, 0.5] url(Evil)`);
    const trap = findByLabel(target, 'Trap');
    const pad = await selectAndOpenPad(target, trap);
    expect(padEntry(pad, 'open-link')).toBeNull();
  });
});

describe('stage snapping', () => {
  it('uses a screen-pixel tolerance at zoom 3', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const canvas = target.get<Canvas>('canvas');
    const eventBus = target.get<EventBus>('eventBus');
    const grid = target.get<EvolutionGrid>('evolutionGrid');
    canvas.zoom(3);
    const boundaryX = grid.toCanvas({ evolution: grid.getBoundaries()[2], visibility: 0.5 }).x;

    const snappedX = (diagramOffset: number): number => {
      let seen = Number.NaN;
      const capture = (event: unknown) => {
        const moveEvent = event as { x: number; stopPropagation(): void };
        seen = moveEvent.x;
        moveEvent.stopPropagation();
      };
      eventBus.on('resize.move', 1400, capture);
      eventBus.fire('resize.move', { x: boundaryX + diagramOffset, dx: 0, context: {} });
      eventBus.off('resize.move', capture);
      return seen;
    };

    const toleranceInDiagramUnits = SNAP_TOLERANCE_SCREEN_PX / 3;
    expect(snappedX(toleranceInDiagramUnits * 0.8)).toBeCloseTo(boundaryX, 5);
    // 6 diagram px are 18 screen px at zoom 3 — far outside the 8 screen-px zone.
    expect(snappedX(6)).toBeCloseTo(boundaryX + 6, 5);
  });
});

describe('keyboard isolation from the editor shortcuts', () => {
  it('moves focus between pad entries with arrow keys instead of nudging the element', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const kettle = findByLabel(target, 'Kettle');
    const position = { x: kettle.x, y: kettle.y };
    const pad = await selectAndOpenPad(target, kettle);
    const edit = padEntry(pad, 'edit-label')!;
    edit.focus();

    const event = pressKey(edit, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(padEntry(pad, 'append'));
    pressKey(document.activeElement as HTMLElement, 'ArrowLeft');
    expect(document.activeElement).toBe(edit);
    pressKey(edit, 'End');
    expect(document.activeElement).toBe(padEntry(pad, 'delete'));
    expect({ x: kettle.x, y: kettle.y }).toEqual(position);

    pressKey(document.activeElement as HTMLElement, 'Escape');
    expect(document.activeElement?.tagName.toLowerCase()).toBe('svg');
  });

  it('keeps arrow keys inside the settings popup', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const cup = findByLabel(target, 'Cup of Tea');
    target.get<Selection>('selection').select(cup as unknown as Element);
    const position = { x: cup.x, y: cup.y };
    const popupMenu = target.get<PopupMenu>('popupMenu');
    popupMenu.open(cup as unknown as Element, POPUP_PROVIDER_ID, { x: 300, y: 120 });
    await nextFrame();
    const results = document.querySelector<HTMLElement>(
      '.djs-popup.wardley-element-settings .djs-popup-results',
    )!;
    pressKey(results, 'ArrowDown');
    await nextFrame();
    expect({ x: cup.x, y: cup.y }).toEqual(position);
    expect(popupMenu.isOpen()).toBe(true);
    popupMenu.close();
  });
});

describe('keyboard create placement', () => {
  it('does not drop a keyboard-created element onto a node near the centre', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const viewbox = target.get<Canvas>('canvas').viewbox();
    const kettle = findByLabel(target, 'Kettle');
    // Close to, but not exactly on, the spot the keyboard path would pick.
    target.get<Modeling>('modeling').moveElements([kettle as unknown as Element], {
      x: viewbox.x + viewbox.width / 2 + 5 - (kettle.x + kettle.width / 2),
      y: viewbox.y + viewbox.height / 2 + 5 - (kettle.y + kettle.height / 2),
    });
    const entry = target.container.querySelector<HTMLElement>(
      '.djs-palette .entry[data-action="create.component"]',
    )!;
    entry.focus();
    pressKey(entry, 'Enter');
    const created = target.get<Selection>('selection').get()[0] as unknown as WardleyShape;
    expect(created).not.toBe(kettle);
    const overlapX =
      Math.abs(created.x + created.width / 2 - (kettle.x + kettle.width / 2)) <
      (created.width + kettle.width) / 2;
    const overlapY =
      Math.abs(created.y + created.height / 2 - (kettle.y + kettle.height / 2)) <
      (created.height + kettle.height) / 2;
    expect(overlapX && overlapY).toBe(false);
  });
});

describe('flow link emphasis', () => {
  it('keeps the flow colour on a selected flow link and only thickens it', async () => {
    const target = mount();
    await target.importDSL(`${TEA_SHOP}\nBusiness +> Power`);
    const flow = target
      .get<ElementRegistry>('elementRegistry')
      .find((el) => (el as { wardleyType?: string }).wardleyType === 'flow')!;
    const visual = target
      .get<Canvas>('canvas')
      .getGraphics(flow as unknown as WardleyConnection)
      .querySelector('.djs-visual')!;
    const line = visual.querySelector('polyline')!;
    const idleStroke = getComputedStyle(line).stroke;
    const idleWidth = parseFloat(getComputedStyle(line).strokeWidth);
    target.get<Selection>('selection').select(flow);
    expect(getComputedStyle(line).stroke).toBe(idleStroke);
    expect(parseFloat(getComputedStyle(line).strokeWidth)).toBeGreaterThan(idleWidth);
  });
});

describe('styles stay with the Wardley editor', () => {
  it('leaves the palette of another diagram-js editor on the page alone', async () => {
    const target = mount();
    await target.importDSL(TEA_SHOP);
    const other = document.createElement('div');
    other.style.cssText = 'position: relative; width: 600px; height: 400px';
    document.body.appendChild(other);
    const diagram = new Diagram({ canvas: { container: other }, modules: [PaletteModule] });
    diagram.get<Palette>('palette').registerProvider({
      getPaletteEntries: () => ({
        tool: { group: 'tools', className: 'tool', title: 'Tool', action: { click: () => {} } },
      }),
    });
    try {
      const otherPalette = other.querySelector<HTMLElement>('.djs-palette')!;
      const wardleyPalette = target.container.querySelector<HTMLElement>('.djs-palette')!;
      expect(wardleyPalette.classList.contains('wardley-palette')).toBe(true);
      expect(getComputedStyle(wardleyPalette).display).toBe('flex');
      expect(otherPalette.classList.contains('wardley-palette')).toBe(false);
      expect(getComputedStyle(otherPalette).transform).toBe('none');
      expect(getComputedStyle(otherPalette).display).not.toBe('flex');
    } finally {
      diagram.destroy();
      other.remove();
    }
  });

  it('keeps a host page’s own --cd-* tokens over the vendored copy', () => {
    mount();
    const style = document.createElement('style');
    style.textContent = ':root { --cd-blau: rgb(1, 2, 3); }';
    // Before the renderer's stylesheet: only the cascade layer lets the host's value win.
    document.head.prepend(style);
    try {
      expect(getComputedStyle(document.documentElement).getPropertyValue('--cd-blau').trim()).toBe(
        'rgb(1, 2, 3)',
      );
    } finally {
      style.remove();
    }
  });
});
