import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Create from 'diagram-js/lib/features/create/Create';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Element, Shape } from 'diagram-js/lib/model/Types';
import { Modeler, restoreEditorState, setAsideEditorState } from '../../src/index.js';
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyShape,
} from '../../src/model/di-types.js';
import type WardleyElementFactory from '../../src/model/WardleyElementFactory.js';
import type WardleyLabelEditing from '../../src/label-editing/WardleyLabelEditing.js';
import type { LabelDeduplicatedEvent } from '../../src/label-editing/WardleyLabelEditing.js';
import type WardleyCopyPaste from '../../src/modeling/WardleyCopyPaste.js';
import type WardleyColorPicker from '../../src/color-picker/WardleyColorPicker.js';
import type EvolutionGrid from '../../src/evolution-grid/EvolutionGrid.js';
import '../../src/assets/wardley.css';

const DSL = `title Keyboard Fixture
anchor Customer [0.95, 0.45]
component Platform [0.55, 0.62]
note Remember the budget [0.30, 0.20]
pioneers [0.9, 0.05, 0.7, 0.3]
Customer -> Platform`;

function findByLabel(registry: ElementRegistry, label: string): WardleyShape {
  const shape = registry.find((el) => isWardleyShape(el) && el.wardleyLabel === label) as
    WardleyShape | undefined;
  if (!shape) throw new Error(`shape not found: ${label}`);
  return shape;
}

function pressKey(
  target: EventTarget,
  key: string,
  modifiers: { metaKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
}

function labelInput(): HTMLInputElement | HTMLTextAreaElement | null {
  return document.querySelector('.wardley-label-input');
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Keyboard and in-place label editing (real browser DOM)', () => {
  let container: HTMLElement;
  let modeler: Modeler;
  const hostChrome: HTMLElement[] = [];

  function service<T>(name: string): T {
    return modeler.get<T>(name);
  }

  function shapeLabels(type: string): string[] {
    return service<ElementRegistry>('elementRegistry')
      .filter((el) => isWardleyShape(el) && el.wardleyType === type)
      .map((el) => (el as WardleyShape).wardleyLabel);
  }

  function svg(): SVGElement {
    return container.querySelector('svg')!;
  }

  function select(label: string): WardleyShape {
    const shape = findByLabel(service<ElementRegistry>('elementRegistry'), label);
    service<Selection>('selection').select(shape);
    return shape;
  }

  function addHostControl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
    const control = document.createElement(tag);
    document.body.appendChild(control);
    hostChrome.push(control);
    return control;
  }

  beforeEach(async () => {
    container = document.createElement('div');
    container.style.width = '1024px';
    container.style.height = '768px';
    document.body.appendChild(container);
    modeler = new Modeler({ container });
    await modeler.importDSL(DSL);
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
    for (const control of hostChrome.splice(0)) control.remove();
  });

  describe('focus scoping', () => {
    it('leaves keys alone while a host select or button has focus', () => {
      select('Platform');
      const before = modeler.exportDSL();
      const preset = addHostControl('select');
      preset.append(new Option('activities'), new Option('data'));
      const share = addHostControl('button');

      for (const control of [preset, share]) {
        control.focus();
        for (const key of ['ArrowDown', 'Backspace', 'Escape']) {
          expect(pressKey(control, key).defaultPrevented).toBe(false);
        }
      }
      preset.focus();
      expect(pressKey(preset, 'c').defaultPrevented).toBe(false);

      expect(modeler.exportDSL()).toBe(before);
      expect(service<Dragging>('dragging').context()).toBeFalsy();
      expect(service<Selection>('selection').get()).toHaveLength(1);
    });

    it('still undoes and creates while a plain host button has focus', () => {
      const before = modeler.exportDSL();
      select('Platform');
      pressKey(svg(), 'Backspace');
      expect(shapeLabels('component')).toEqual([]);

      const zoomIn = addHostControl('button');
      zoomIn.focus();
      expect(pressKey(zoomIn, 'z', { metaKey: true }).defaultPrevented).toBe(true);
      expect(modeler.exportDSL()).toBe(before);
      expect(pressKey(zoomIn, 'n').defaultPrevented).toBe(true);
      expect(shapeLabels('note')).toHaveLength(2);
    });

    it('ignores keys inside dialogs', () => {
      select('Platform');
      const dialog = addHostControl('div');
      dialog.setAttribute('role', 'dialog');
      const close = document.createElement('button');
      dialog.appendChild(close);
      pressKey(close, 'Backspace');
      expect(shapeLabels('component')).toEqual(['Platform']);
    });

    it('still deletes with Backspace when the canvas has focus', () => {
      select('Platform');
      const event = pressKey(svg(), 'Backspace');
      expect(event.defaultPrevented).toBe(true);
      expect(shapeLabels('component')).toEqual([]);
    });

    it('does not make the container a second tab stop', () => {
      expect(container.hasAttribute('tabindex')).toBe(false);
      expect(container.querySelector('.djs-container')?.hasAttribute('tabindex')).toBe(false);
    });
  });

  describe('selection keys', () => {
    it('Escape clears the selection', () => {
      select('Platform');
      pressKey(document.body, 'Escape');
      expect(service<Selection>('selection').get()).toEqual([]);
    });

    it('Escape only closes an open colour picker, keeping the selection', async () => {
      const note = select('Remember the budget');
      service<WardleyColorPicker>('wardleyColorPicker').open(note, 200, 200);
      await nextTask();
      pressKey(document.body, 'Escape');
      expect(container.querySelector('.wardley-color-picker')).toBeNull();
      expect(service<Selection>('selection').get()).toEqual([note]);
    });

    it('Cmd/Ctrl+A selects every map element instead of page text', () => {
      const event = pressKey(document.body, 'a', { metaKey: true });
      expect(event.defaultPrevented).toBe(true);
      const selected = service<Selection>('selection').get();
      const registry = service<ElementRegistry>('elementRegistry');
      const all = registry.filter((el) => isWardleyShape(el) || isWardleyConnection(el));
      expect(selected).toHaveLength(all.length);
      expect(selected.length).toBe(5);
    });
  });

  describe('single-key tools without a pointer', () => {
    it.each([
      ['c', 'component', 'Component'],
      ['u', 'anchor', 'User'],
      ['n', 'note', 'Note'],
      ['p', 'pipeline', 'Pipeline'],
    ])(
      '%s creates a %s at the visible plot centre and opens its name editor',
      (key, type, label) => {
        pressKey(document.body, key);
        const created = service<Selection>('selection').get()[0] as WardleyShape;
        expect(created.wardleyType).toBe(type);
        expect(created.wardleyLabel).toBe(label);
        expect(labelInput()?.value).toBe(label);
        expect(document.activeElement).toBe(labelInput());

        const viewbox = service<Canvas>('canvas').viewbox();
        const centerX = created.x + created.width / 2;
        expect(centerX).toBeGreaterThan(viewbox.x);
        expect(centerX).toBeLessThan(viewbox.x + viewbox.width);
      },
    );

    it('typing into the new editor names the element and does not trigger more tools', () => {
      pressKey(document.body, 'c');
      const field = labelInput()!;
      pressKey(field, 'n');
      field.value = 'Kettle';
      pressKey(field, 'Enter');
      expect(shapeLabels('component')).toEqual(['Platform', 'Kettle']);
      expect(shapeLabels('note')).toEqual(['Remember the budget']);
    });

    it('steps repeated creates apart instead of stacking them', () => {
      pressKey(document.body, 'c');
      pressKey(labelInput()!, 'Escape');
      pressKey(document.body, 'c');
      pressKey(labelInput()!, 'Escape');
      const registry = service<ElementRegistry>('elementRegistry');
      const first = findByLabel(registry, 'Component');
      const second = findByLabel(registry, 'Component 2');
      expect(Math.abs(first.y - second.y)).toBeGreaterThan(30);
    });

    it('starts a new column at the plot bottom instead of piling up on the edge', () => {
      for (let index = 0; index < 14; index++) {
        pressKey(document.body, 'c');
        pressKey(labelInput()!, 'Escape');
      }
      const created = service<ElementRegistry>('elementRegistry').filter(
        (el) => isWardleyShape(el) && el.wardleyLabel.startsWith('Component'),
      ) as WardleyShape[];
      const positions = created.map((shape) => `${shape.x},${shape.y}`);
      expect(new Set(positions).size).toBe(created.length);
      const plotBottom = service<EvolutionGrid>('evolutionGrid').toCanvas({
        visibility: 0,
        evolution: 0,
      }).y;
      for (const shape of created) expect(shape.y + shape.height / 2).toBeLessThan(plotBottom);
    });

    it('A starts a connection from the single selected node', () => {
      select('Customer');
      expect(pressKey(document.body, 'a').defaultPrevented).toBe(true);
      const context = service<Dragging>('dragging').context() as { prefix?: string } | null;
      expect(context?.prefix).toBe('connect');
      service<Dragging>('dragging').cancel(false);
    });

    it('A does nothing for regions or multiple nodes', () => {
      select('pioneers');
      expect(pressKey(document.body, 'a').defaultPrevented).toBe(false);
      pressKey(document.body, 'a', { metaKey: true });
      expect(pressKey(document.body, 'a').defaultPrevented).toBe(false);
      expect(service<Dragging>('dragging').context()).toBeFalsy();
    });
  });

  describe('undo/redo ownership', () => {
    it('handles Cmd+Z by default', () => {
      const platform = select('Platform');
      const x = platform.x;
      service<Modeling>('modeling').moveShape(platform, { x: 40, y: 0 });
      expect(pressKey(document.body, 'z', { metaKey: true }).defaultPrevented).toBe(true);
      expect(platform.x).toBeCloseTo(x, 1);
    });

    it('leaves Cmd+Z/Shift+Z/Y to the host with keyboard.undoRedo false', async () => {
      modeler.destroy();
      modeler = new Modeler({ container, keyboard: { undoRedo: false } });
      await modeler.importDSL(DSL);
      const platform = select('Platform');
      service<Modeling>('modeling').moveShape(platform, { x: 40, y: 0 });
      const moved = platform.x;

      expect(pressKey(document.body, 'z', { metaKey: true }).defaultPrevented).toBe(false);
      expect(pressKey(document.body, 'z', { metaKey: true, shiftKey: true }).defaultPrevented).toBe(
        false,
      );
      expect(pressKey(document.body, 'y', { metaKey: true }).defaultPrevented).toBe(false);
      expect(platform.x).toBe(moved);
      expect(modeler.canUndo()).toBe(true);
    });
  });

  describe('copy naming', () => {
    it("duplicates 'Cup 2' to 'Cup 3' and keeps note texts", async () => {
      await modeler.importDSL(`title Copy
component Cup [0.5, 0.5]
component Cup 2 [0.4, 0.4]
note Cup 2 [0.3, 0.3]`);
      const registry = service<ElementRegistry>('elementRegistry');
      const copies = registry.filter((el) => isWardleyShape(el) && el.wardleyLabel === 'Cup 2');
      expect(copies).toHaveLength(2);
      service<Selection>('selection').select(copies);
      pressKey(document.body, 'd', { metaKey: true });
      expect(shapeLabels('component').sort()).toEqual(['Cup', 'Cup 2', 'Cup 3']);
      expect(shapeLabels('note')).toEqual(['Cup 2', 'Cup 2']);
    });

    const ANCHORED_PIPELINE = `title Pipeline copy
component Platform [0.6, 0.5]
pipeline Platform [0.3, 0.8]
{
  component A [0.4]
  component B [0.7]
}`;

    function pipelineGroups(): Record<string, string[]> {
      const map = modeler.exportMap();
      const groups: Record<string, string[]> = {};
      for (const pipeline of map.elements.filter((el) => el.elementType === 'pipeline')) {
        groups[pipeline.label] = map.elements
          .filter((el) => el.elementType === 'component' && el.pipelineId === pipeline.id)
          .map((el) => el.label)
          .sort();
      }
      return groups;
    }

    it('duplicates a pipeline with its anchor as a new anchored group', async () => {
      await modeler.importDSL(ANCHORED_PIPELINE);
      pressKey(document.body, 'a', { metaKey: true });
      pressKey(document.body, 'd', { metaKey: true });

      expect(pipelineGroups()).toEqual({
        Platform: ['A', 'B'],
        'Platform 2': ['A 2', 'B 2'],
      });
      const dsl = modeler.exportDSL();
      expect(dsl).toMatch(/^component Platform 2 \[/mu);
      expect(dsl).toMatch(/^pipeline Platform 2 \[[^\]]+\]$/mu);
    });

    it('pastes a pipeline with its anchor as a new anchored group', async () => {
      await modeler.importDSL(ANCHORED_PIPELINE);
      pressKey(document.body, 'a', { metaKey: true });
      service<WardleyCopyPaste>('wardleyCopyPaste').copy();
      const dragging = service<Dragging>('dragging');
      dragging.setOptions({ manual: true });
      service<WardleyCopyPaste>('wardleyCopyPaste').paste();
      placeActiveCreate({ x: 400, y: 600 });
      await nextTask();

      expect(pipelineGroups()).toEqual({
        Platform: ['A', 'B'],
        'Platform 2': ['A 2', 'B 2'],
      });
      expect(modeler.exportDSL()).toMatch(/^pipeline Platform 2 \[[^\]]+\]$/mu);
    });

    it('does not open the name editor for pasted copies', async () => {
      select('Platform');
      service<WardleyCopyPaste>('wardleyCopyPaste').copy();
      const dragging = service<Dragging>('dragging');
      dragging.setOptions({ manual: true });
      service<WardleyCopyPaste>('wardleyCopyPaste').paste();
      placeActiveCreate({ x: 300, y: 300 });
      await nextTask();
      expect(shapeLabels('component')).toEqual(['Platform', 'Platform 2']);
      expect(labelInput()).toBeNull();
    });
  });

  describe('paste ownership (element clipboard vs. system clipboard)', () => {
    function copyWithKeyboard(label: string): void {
      select(label);
      pressKey(document.body, 'c', { metaKey: true });
    }

    function pasteIsAttachedToCursor(): boolean {
      return !!service<Dragging>('dragging').context();
    }

    afterEach(() => service<Dragging>('dragging').cancel(true));

    it('pastes copied elements right away while they are the newest clipboard content', () => {
      copyWithKeyboard('Platform');
      const event = pressKey(document.body, 'v', { metaKey: true });
      expect(event.defaultPrevented).toBe(true);
      expect(pasteIsAttachedToCursor()).toBe(true);
    });

    it('lets the host consume a newer system clipboard paste after the window lost focus', async () => {
      copyWithKeyboard('Platform');
      window.dispatchEvent(new Event('blur'));
      const keydown = pressKey(document.body, 'v', { metaKey: true });
      expect(keydown.defaultPrevented).toBe(false);
      const consume = (e: Event) => e.preventDefault();
      document.addEventListener('paste', consume, { once: true });
      document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true }));
      await nextTask();
      expect(pasteIsAttachedToCursor()).toBe(false);
    });

    it('still pastes the copied elements when the host leaves the paste alone', async () => {
      copyWithKeyboard('Platform');
      document.dispatchEvent(new ClipboardEvent('copy', { bubbles: true }));
      pressKey(document.body, 'v', { metaKey: true });
      document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true }));
      await nextTask();
      expect(pasteIsAttachedToCursor()).toBe(true);
    });
  });

  /** Finishes the running create drag at a diagram point (manual dragging mode). */
  function placeActiveCreate(point: { x: number; y: number }): void {
    const canvas = service<Canvas>('canvas');
    const dragging = service<Dragging>('dragging');
    const viewbox = canvas.viewbox();
    const rect = canvas.getContainer().getBoundingClientRect();
    const root = canvas.getRootElement();
    const event = new MouseEvent('mousemove', {
      clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
      clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
    });
    dragging.hover({ element: root, gfx: canvas.getGraphics(root as unknown as Shape) });
    dragging.move(event, false);
    dragging.end(event);
  }

  describe('name editor after placing from the palette', () => {
    it.each([
      ['component', 'Component'],
      ['note', 'Note'],
    ] as const)('opens for a %s with the placeholder selected', async (type, label) => {
      service<Dragging>('dragging').setOptions({ manual: true });
      const shape = service<WardleyElementFactory>('wardleyElementFactory').createNew(type, label);
      service<Create>('create').start(new MouseEvent('mousedown'), shape as unknown as Shape);
      placeActiveCreate({ x: 500, y: 400 });
      await nextTask();

      const field = labelInput()!;
      expect(field.value).toBe(label);
      expect(field.selectionStart).toBe(0);
      expect(field.selectionEnd).toBe(label.length);
      field.value = 'Named';
      pressKey(field, 'Enter', { metaKey: type === 'note' });
      expect(shapeLabels(type)).toContain('Named');
    });

    it('does not open for regions', async () => {
      service<Dragging>('dragging').setOptions({ manual: true });
      const region = service<WardleyElementFactory>('wardleyElementFactory').createNew(
        'attitude',
        'Settlers',
        { attitudeKind: 'settlers' },
      );
      service<Create>('create').start(new MouseEvent('mousedown'), region as unknown as Shape);
      placeActiveCreate({ x: 500, y: 400 });
      await nextTask();
      expect(labelInput()).toBeNull();
      expect(shapeLabels('attitude')).toContain('settlers');
    });
  });

  describe('in-place editor', () => {
    function labelEditing(): WardleyLabelEditing {
      return service<WardleyLabelEditing>('wardleyLabelEditing');
    }

    it('hides the label it replaces and sits on top of it', () => {
      const platform = findByLabel(service<ElementRegistry>('elementRegistry'), 'Platform');
      const gfx = service<Canvas>('canvas').getGraphics(platform);
      const nameText = [...gfx.querySelectorAll('text')].find(
        (text) => text.textContent === 'Platform',
      )!;
      const labelBox = nameText.getBoundingClientRect();
      labelEditing().activate(platform);

      expect(getComputedStyle(nameText).visibility).toBe('hidden');
      const fieldBox = labelInput()!.getBoundingClientRect();
      expect(fieldBox.left).toBeLessThanOrEqual(labelBox.left);
      expect(fieldBox.right).toBeGreaterThanOrEqual(labelBox.right);
      expect(fieldBox.top).toBeLessThanOrEqual(labelBox.top + 2);
      expect(fieldBox.bottom).toBeGreaterThanOrEqual(labelBox.bottom - 2);

      pressKey(labelInput()!, 'Escape');
      expect(getComputedStyle(nameText).visibility).toBe('visible');
    });

    it('scales the font with the zoom and grows with the text', () => {
      service<Canvas>('canvas').zoom(2);
      labelEditing().activate(findByLabel(service<ElementRegistry>('elementRegistry'), 'Platform'));
      const field = labelInput()!;
      expect(getComputedStyle(field).fontSize).toBe('26px');
      const narrow = field.getBoundingClientRect().width;
      field.value = 'Platform with a considerably longer name';
      field.dispatchEvent(new Event('input'));
      expect(field.getBoundingClientRect().width).toBeGreaterThan(narrow * 2);
    });

    it("copies the label's weight and alignment (centred bold user label)", () => {
      const customer = findByLabel(service<ElementRegistry>('elementRegistry'), 'Customer');
      const nameText = [
        ...service<Canvas>('canvas').getGraphics(customer).querySelectorAll('text'),
      ].find((text) => text.textContent === 'Customer')!;
      const labelBox = nameText.getBoundingClientRect();
      labelEditing().activate(customer);
      const field = labelInput()!;

      expect(getComputedStyle(field).fontWeight).toBe('700');
      expect(getComputedStyle(field).textAlign).toBe('center');
      const fieldBox = field.getBoundingClientRect();
      const labelCenter = labelBox.left + labelBox.width / 2;
      expect(Math.abs(fieldBox.left + fieldBox.width / 2 - labelCenter)).toBeLessThan(1);
    });

    it('edits notes over their own box with a save hint', () => {
      const note = findByLabel(service<ElementRegistry>('elementRegistry'), 'Remember the budget');
      const noteBox = service<Canvas>('canvas').getGraphics(note).getBoundingClientRect();
      labelEditing().activate(note);
      const field = labelInput()!;
      expect(field.tagName).toBe('TEXTAREA');
      const fieldBox = field.getBoundingClientRect();
      expect(fieldBox.left).toBeLessThanOrEqual(noteBox.left + 1);
      expect(fieldBox.right).toBeGreaterThanOrEqual(noteBox.right - 1);
      expect(document.querySelector('.wardley-label-hint')?.textContent).toBe(
        'Cmd/Ctrl+Enter to save · Esc to cancel',
      );
      pressKey(field, 'Escape');
      expect(document.querySelector('.wardley-label-hint')).toBeNull();
    });

    it('does not edit regions', () => {
      labelEditing().activate(findByLabel(service<ElementRegistry>('elementRegistry'), 'pioneers'));
      expect(labelInput()).toBeNull();
    });

    it.each(['Enter', 'Escape'])('hands focus back to the canvas after %s', async (key) => {
      const platform = select('Platform');
      labelEditing().activate(platform);
      pressKey(labelInput()!, key);
      expect(labelInput()).toBeNull();
      await nextTask();
      expect(document.activeElement).toBe(svg());
      expect(container.querySelector('.djs-context-pad.open')).not.toBeNull();
    });

    it('exposes the open edit to hosts and cancels it', () => {
      const platform = findByLabel(service<ElementRegistry>('elementRegistry'), 'Platform');
      expect(labelEditing().getActiveEdit()).toBeNull();
      labelEditing().activate(platform, { value: 'Platform v2' });
      expect(labelEditing().getActiveEdit()).toMatchObject({
        elementId: platform.id,
        value: 'Platform v2',
      });
      labelEditing().cancel();
      expect(labelInput()).toBeNull();
      expect(platform.wardleyLabel).toBe('Platform');
    });
  });

  describe('duplicate names', () => {
    it('keeps the editor open with an inline error on Enter', () => {
      const platform = findByLabel(service<ElementRegistry>('elementRegistry'), 'Platform');
      service<WardleyLabelEditing>('wardleyLabelEditing').activate(platform);
      const field = labelInput()!;
      field.value = 'Customer';
      pressKey(field, 'Enter');

      expect(labelInput()).toBe(field);
      expect(field.classList.contains('wardley-label-input--error')).toBe(true);
      expect(document.querySelector('.wardley-label-error')?.textContent).toBe(
        '“Customer” already exists — names must be unique because links refer to them.',
      );
      expect(platform.wardleyLabel).toBe('Platform');

      field.value = 'Customer Platform';
      field.dispatchEvent(new Event('input'));
      expect(document.querySelector('.wardley-label-error')).toBeNull();
      pressKey(field, 'Enter');
      expect(platform.wardleyLabel).toBe('Customer Platform');
    });

    it('applies a free variant and tells the host when focus leaves', () => {
      const deduplicated: LabelDeduplicatedEvent[] = [];
      service<EventBus>('eventBus').on('wardley.label.deduplicated', (event: unknown) => {
        deduplicated.push(event as LabelDeduplicatedEvent);
      });
      const platform = findByLabel(service<ElementRegistry>('elementRegistry'), 'Platform');
      service<WardleyLabelEditing>('wardleyLabelEditing').activate(platform);
      const field = labelInput()!;
      field.value = 'Customer';
      field.blur();

      expect(platform.wardleyLabel).toBe('Customer 2');
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]).toMatchObject({ requested: 'Customer', applied: 'Customer 2' });
      expect(deduplicated[0]!.element).toBe(platform);
    });

    it('lets notes repeat names', () => {
      const note = findByLabel(service<ElementRegistry>('elementRegistry'), 'Remember the budget');
      service<WardleyLabelEditing>('wardleyLabelEditing').activate(note);
      const field = labelInput()!;
      field.value = 'Platform';
      pressKey(field, 'Enter', { metaKey: true });
      expect(note.wardleyLabel).toBe('Platform');
    });
  });

  it('commits open name and link-annotation edits for the host', () => {
    const platform = findByLabel(service<ElementRegistry>('elementRegistry'), 'Platform');
    const labelEditing = service<WardleyLabelEditing>('wardleyLabelEditing');
    labelEditing.activate(platform);
    labelInput()!.value = 'Payments';
    modeler.commitPendingEdits();
    expect(labelInput()).toBeNull();
    expect(modeler.exportDSL()).toContain('component Payments [0.55, 0.62]');

    const link = service<ElementRegistry>('elementRegistry').find(isWardleyConnection)!;
    labelEditing.activateConnection(link as never);
    labelInput()!.value = 'needs review';
    modeler.commitPendingEdits();
    expect(modeler.exportDSL()).toContain('Customer -> Payments; needs review');
  });

  describe('focus after naming', () => {
    function renameWithEnter(label: string, next: string): void {
      const shape = findByLabel(service<ElementRegistry>('elementRegistry'), label);
      service<WardleyLabelEditing>('wardleyLabelEditing').activate(shape);
      const field = labelInput()!;
      field.value = next;
      pressKey(field, 'Enter');
    }

    it('shows no focus ring around the canvas after a pointer-opened edit', () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      renameWithEnter('Platform', 'Payments');
      expect(document.activeElement).toBe(svg());
      expect(svg().matches(':focus-visible')).toBe(false);
    });

    it('keeps the focus ring after a keyboard-opened edit', async () => {
      pressKey(document.body, 'Shift');
      renameWithEnter('Platform', 'Payments');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(document.activeElement).toBe(svg());
      expect(svg().matches(':focus-visible')).toBe(true);
    });
  });

  describe('editor state across a re-import (external edit)', () => {
    const CHANGED = `${DSL}\n// added in the text editor`;

    async function reimport(text: string): Promise<void> {
      const state = setAsideEditorState(modeler);
      await modeler.importDSL(text);
      restoreEditorState(modeler, state);
    }

    it('keeps the selection and the typed name with its caret', async () => {
      const platform = select('Platform');
      service<WardleyLabelEditing>('wardleyLabelEditing').activate(platform);
      const field = labelInput()!;
      field.value = 'Bee';
      field.setSelectionRange(3, 3);

      await reimport(CHANGED);

      const restored = labelInput()!;
      expect(restored.value).toBe('Bee');
      expect([restored.selectionStart, restored.selectionEnd]).toEqual([3, 3]);
      expect(document.activeElement).toBe(restored);
      restored.setRangeText('s', 3, 3, 'end');
      pressKey(restored, 'Enter');
      expect(modeler.exportDSL()).toContain('component Bees [0.55, 0.62]');
    });

    it('keeps an open link annotation editor, matched by its ends', async () => {
      const link = service<ElementRegistry>('elementRegistry').find(isWardleyConnection)!;
      service<WardleyLabelEditing>('wardleyLabelEditing').activateConnection(link as never);
      labelInput()!.value = 'needs review';

      await reimport(CHANGED);

      expect(labelInput()?.value).toBe('needs review');
      pressKey(labelInput()!, 'Enter');
      expect(modeler.exportDSL()).toContain('Customer -> Platform; needs review');
    });

    it('selects what still exists and focuses the canvas when the edited element is gone', async () => {
      select('Customer');
      const platform = findByLabel(service<ElementRegistry>('elementRegistry'), 'Platform');
      service<WardleyLabelEditing>('wardleyLabelEditing').activate(platform);

      await reimport(
        DSL.replace('component Platform [0.55, 0.62]\n', '').replace('Customer -> Platform', ''),
      );

      expect(labelInput()).toBeNull();
      expect(document.activeElement).toBe(svg());
    });

    it('keeps the selection of an unrelated element', async () => {
      select('Customer');
      await reimport(DSL.replace('[0.55, 0.62]', '[0.5, 0.6]'));
      expect(
        service<Selection>('selection')
          .get()
          .map((element) => (element as WardleyShape).wardleyLabel),
      ).toEqual(['Customer']);
    });
  });

  it('removes nothing but the field when the edited element disappears', () => {
    const platform = findByLabel(service<ElementRegistry>('elementRegistry'), 'Platform');
    service<WardleyLabelEditing>('wardleyLabelEditing').activate(platform);
    service<Modeling>('modeling').removeElements([platform as unknown as Element]);
    expect(labelInput()).toBeNull();
    expect(service<WardleyLabelEditing>('wardleyLabelEditing').getActiveEdit()).toBeNull();
  });
});
