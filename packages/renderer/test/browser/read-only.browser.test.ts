import { afterEach, describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Rules from 'diagram-js/lib/features/rules/Rules';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Element } from 'diagram-js/lib/model/Types';
import { Modeler, type WardleyReadOnly } from '../../src/index.js';
import { isWardleyShape, type WardleyShape } from '../../src/model/di-types.js';
import type WardleyLabelEditing from '../../src/label-editing/WardleyLabelEditing.js';
import type WardleyColorPicker from '../../src/color-picker/WardleyColorPicker.js';
import type WardleyDrawTool from '../../src/draw-tool/WardleyDrawTool.js';
import '../../src/assets/wardley.css';

const MAP = `title Locked
component Kettle [0.43, 0.35]
component Power [0.1, 0.71]
Kettle -> Power`;

let container: HTMLElement | undefined;
let modeler: Modeler | undefined;

async function mount(): Promise<Modeler> {
  container = document.createElement('div');
  document.body.appendChild(container);
  modeler = new Modeler({ container, width: 1024, height: 768 });
  await modeler.importDSL(MAP);
  return modeler;
}

afterEach(() => {
  modeler?.destroy();
  container?.remove();
  modeler = undefined;
  container = undefined;
});

function shape(target: Modeler, label: string): WardleyShape {
  const found = target
    .get<ElementRegistry>('elementRegistry')
    .find((element) => isWardleyShape(element) && element.wardleyLabel === label);
  if (!found) throw new Error(`no shape ${label}`);
  return found as unknown as WardleyShape;
}

function lock(target: Modeler, readOnly = true): void {
  target.get<WardleyReadOnly>('wardleyReadOnly').setReadOnly(readOnly);
}

function press(target: Modeler, key: string, modifiers: KeyboardEventInit = {}): void {
  const svg = target.get<Canvas>('canvas').getContainer().querySelector('svg')!;
  svg.focus();
  svg.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }));
}

describe('the read-only lock of a canvas (guide §13.5)', () => {
  it('vetoes every edit rule and lifts the veto when unlocked', async () => {
    const target = await mount();
    const rules = target.get<Rules>('rules');
    const kettle = shape(target, 'Kettle') as unknown as Element;
    const power = shape(target, 'Power') as unknown as Element;
    const moveContext = { shapes: [kettle], delta: { x: 10, y: 0 } };
    expect(rules.allowed('elements.move', moveContext)).not.toBe(false);

    lock(target);
    expect(rules.allowed('elements.move', moveContext)).toBe(false);
    expect(rules.allowed('connection.start', { source: power })).toBe(false);
    expect(rules.allowed('elements.delete', { elements: [kettle] })).toBe(false);

    lock(target, false);
    expect(rules.allowed('elements.move', moveContext)).not.toBe(false);
  });

  it('offers no context pad and no label editor', async () => {
    const target = await mount();
    lock(target);
    target.get<Selection>('selection').select(shape(target, 'Kettle') as unknown as Element);
    expect(target.container.querySelectorAll('.djs-context-pad .entry')).toHaveLength(0);
    target.get<WardleyLabelEditing>('wardleyLabelEditing').activate(shape(target, 'Kettle'));
    expect(target.container.querySelector('.wardley-label-input')).toBeNull();
    target.get<WardleyColorPicker>('wardleyColorPicker').open(shape(target, 'Kettle'), 100, 100);
    expect(target.container.querySelector('.wardley-color-picker')).toBeNull();
    target.get<WardleyDrawTool>('wardleyDrawTool').activate();
    expect(target.get<WardleyDrawTool>('wardleyDrawTool').isActive()).toBe(false);
  });

  it('keeps the map against the edit keys, but selects all', async () => {
    const target = await mount();
    const before = target.exportDSL();
    lock(target);
    target.get<Selection>('selection').select(shape(target, 'Kettle') as unknown as Element);
    press(target, 'Delete');
    press(target, 'Backspace');
    press(target, 'ArrowRight');
    press(target, 'c');
    press(target, 'd', { ctrlKey: true });
    press(target, 'v', { ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(target.exportDSL()).toBe(before);

    press(target, 'a', { ctrlKey: true });
    expect(target.get<Selection>('selection').get().length).toBeGreaterThanOrEqual(3);
  });

  it('takes an open label editor down without saving it', async () => {
    const target = await mount();
    const before = target.exportDSL();
    target.get<WardleyLabelEditing>('wardleyLabelEditing').activate(shape(target, 'Kettle'));
    const field = target.container.querySelector<HTMLInputElement>('.wardley-label-input')!;
    field.value = 'Typed, not saved';
    lock(target);
    expect(target.container.querySelector('.wardley-label-input')).toBeNull();
    expect(target.exportDSL()).toBe(before);
  });

  it('marks the container, so the handles hide', async () => {
    const target = await mount();
    lock(target);
    expect(target.container.classList.contains('wardley-read-only')).toBe(true);
    const resize = target.container.querySelector('.layer-wardley-map-resize')!;
    expect(getComputedStyle(resize).display).toBe('none');
    lock(target, false);
    expect(target.container.classList.contains('wardley-read-only')).toBe(false);
  });
});
