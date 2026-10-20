import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import ContextPad from 'diagram-js/lib/features/context-pad/ContextPad';
import { Modeler } from '../../src/index.js';
import { isWardleyShape, type WardleyShape } from '../../src/model/di-types.js';
import { COLORS, FONT } from '../../src/draw/styles.js';
import { MIRAGON } from '../../src/theme/palette.js';
// Pull the real stylesheet in so layout (getBBox) matches production. src/index.ts also imports it.
import '../../src/assets/wardley.css';

const TEA_SHOP = `title Tea Shop
component Cup of Tea [0.79, 0.61]
component Hot Water [0.52, 0.8]
component Kettle [0.43, 0.35]
component Power [0.1, 0.71] (outsource)
anchor Business [0.95, 0.63]
evolve Kettle 0.62
Business -> Cup of Tea
Cup of Tea -> Hot Water
Hot Water -> Kettle
Kettle -> Power`;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function findByLabel(registry: ElementRegistry, label: string): WardleyShape {
  const shape = registry.find((el) => isWardleyShape(el) && el.wardleyLabel === label) as
    WardleyShape | undefined;
  if (!shape) throw new Error(`shape not found: ${label}`);
  return shape;
}

function box(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function mouse(target: EventTarget, type: string, x: number, y: number, init: MouseEventInit = {}) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...init }),
  );
}

describe('canvas rendering (real browser DOM)', () => {
  let container: HTMLElement;
  let modeler: Modeler;
  let registry: ElementRegistry;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '1280px';
    container.style.height = '860px';
    document.body.appendChild(container);
    modeler = new Modeler({ container });
    registry = modeler.get<ElementRegistry>('elementRegistry');
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
  });

  function gfx(label: string): SVGGElement {
    return registry.getGraphics(findByLabel(registry, label)) as SVGGElement;
  }

  function parts(label: string) {
    const graphics = gfx(label);
    const movement = graphics.querySelector('.wardley-movement');
    return {
      name: graphics.querySelector('.djs-visual > .wardley-name-label')!,
      ring: graphics.querySelector('.djs-visual > circle')!,
      movement,
      target: movement?.querySelector('.wardley-evolve-handle') ?? null,
      targetLabel: movement?.querySelector('.wardley-movement-label') ?? null,
    };
  }

  describe('evolve labels', () => {
    it('groups every movement visual and keeps the evolve drag handle', async () => {
      await modeler.importDSL(TEA_SHOP);
      const { movement, target, targetLabel } = parts('Kettle');
      expect(movement).not.toBeNull();
      expect(target?.getAttribute('class')).toBe('wardley-evolve-handle');
      expect(targetLabel?.textContent).toBe('Kettle');
      // underlay + dashed line + arrow + target circle + target label
      expect(movement!.children).toHaveLength(5);
    });

    it('moves the source name left of its circle for a short rightward evolve', async () => {
      await modeler.importDSL(`title Short
component Online Ordering [0.8, 0.55]
evolve Online Ordering 0.6`);
      const { name, ring, target, targetLabel } = parts('Online Ordering');
      expect(getComputedStyle(name).textAnchor).toBe('end');
      expect(box(name).right).toBeLessThanOrEqual(box(ring).left);
      expect(intersects(box(name), box(target!))).toBe(false);
      expect(intersects(box(name), box(targetLabel!))).toBe(false);
      expect(intersects(box(target!), box(targetLabel!))).toBe(false);
    });

    it('puts the target name on the far side of a leftward evolve', async () => {
      await modeler.importDSL(`title Leftward
component Legacy CRM [0.25, 0.75]
evolve Legacy CRM 0.55`);
      const { name, ring, target, targetLabel } = parts('Legacy CRM');
      expect(getComputedStyle(targetLabel!).textAnchor).toBe('end');
      expect(box(targetLabel!).right).toBeLessThanOrEqual(box(target!).left);
      expect(getComputedStyle(name).textAnchor).toBe('start');
      expect(box(name).left).toBeGreaterThanOrEqual(box(ring).right);
      expect(intersects(box(name), box(targetLabel!))).toBe(false);
    });

    it('renders the evolve `label [dx, dy]` offset from the canonical target slot', async () => {
      await modeler.importDSL(`title Offset
component Payment Processing [0.6, 0.3]
evolve Payment Processing 0.7`);
      const plain = box(parts('Payment Processing').targetLabel!);
      await modeler.importDSL(`title Offset
component Payment Processing [0.6, 0.3]
evolve Payment Processing 0.7 label [10, 20]`);
      const zoom = modeler.get<Canvas>('canvas').zoom();
      const moved = box(parts('Payment Processing').targetLabel!);
      expect((moved.left - plain.left) / zoom).toBeCloseTo(10, 0);
      expect((moved.top - plain.top) / zoom).toBeCloseTo(20, 0);
      expect(modeler.exportDSL()).toContain('evolve Payment Processing 0.7 label [10, 20]');
    });

    it('draws a paper-coloured knock-out under the evolve line of a pipeline anchor', async () => {
      await modeler.importDSL(`title Pipeline evolve
component Shop [0.5, 0.4]
pipeline Shop [0.3, 0.8]
evolve Shop 0.62`);
      const shop = registry.find(
        (el) => isWardleyShape(el) && el.wardleyType === 'component',
      ) as WardleyShape;
      const underlay = (registry.getGraphics(shop) as SVGGElement).querySelector(
        '.wardley-movement-underlay',
      ) as SVGLineElement;
      expect(underlay).not.toBeNull();
      expect(getComputedStyle(underlay).stroke).toBe('rgb(255, 255, 255)');
      expect(parseFloat(getComputedStyle(underlay).strokeWidth)).toBeGreaterThan(1.5);
    });
  });

  describe('context pad', () => {
    it('relies on the private ContextPad#_getTargetBounds hook', () => {
      expect(
        typeof (ContextPad.prototype as unknown as Record<string, unknown>)['_getTargetBounds'],
      ).toBe('function');
    });

    it('sits next to the node and its own label, not next to the evolve target', async () => {
      await modeler.importDSL(TEA_SHOP);
      // The pad has a fixed screen size; at 100 % the Kettle evolve leaves room for it.
      modeler.get<Canvas>('canvas').zoom(1);
      modeler.get<Selection>('selection').select(findByLabel(registry, 'Kettle'));
      await nextFrame();
      await nextFrame();
      const entry = container.querySelector('.djs-context-pad .entry');
      expect(entry).not.toBeNull();
      const { name, target } = parts('Kettle');
      const entryLeft = entry!.getBoundingClientRect().left;
      expect(entryLeft).toBeGreaterThanOrEqual(box(name).right - 1);
      expect(entryLeft - box(name).right).toBeLessThan(80);
      expect(entryLeft).toBeLessThan(box(target!).left);
      const pad = container.querySelector('.djs-context-pad')!;
      expect(intersects(box(pad), box(target!))).toBe(false);
    });

    it('clears a short evolve instead of covering its target handle', async () => {
      await modeler.importDSL(`title Short
component Online Ordering [0.8, 0.55]
evolve Online Ordering 0.6`);
      modeler.get<Selection>('selection').select(findByLabel(registry, 'Online Ordering'));
      await nextFrame();
      await nextFrame();
      const pad = container.querySelector('.djs-context-pad')!;
      const { target, targetLabel } = parts('Online Ordering');
      expect(intersects(box(pad), box(target!))).toBe(false);
      expect(intersects(box(pad), box(targetLabel!))).toBe(false);
    });
  });

  describe('label dragging', () => {
    function drag(label: Element, deltaX: number, deltaY: number, steps = 3): void {
      const start = label.getBoundingClientRect();
      const x = Math.round(start.left + 4);
      const y = Math.round(start.top + start.height / 2);
      mouse(label, 'mousedown', x, y);
      for (let step = 1; step <= steps; step++) {
        mouse(document, 'mousemove', x + (deltaX * step) / steps, y + (deltaY * step) / steps);
      }
      mouse(document, 'mouseup', x + deltaX, y + deltaY);
    }

    it('writes one undoable `label [dx, dy]` and keeps the owner selected', async () => {
      await modeler.importDSL(TEA_SHOP);
      // MouseEvent coordinates are integers, so drag at 100 % to get exact offsets.
      const zoom = modeler.get<Canvas>('canvas').zoom(1);
      drag(parts('Kettle').name, 30 * zoom, -10 * zoom);
      const kettle = findByLabel(registry, 'Kettle');
      expect(kettle.labelOffset).toEqual({ dx: 30, dy: -10 });
      expect(modeler.exportDSL()).toContain('component Kettle [0.43, 0.35] label [30, -10]');
      expect(modeler.get<Selection>('selection').get()).toEqual([kettle]);

      modeler.undo();
      expect(kettle.labelOffset).toBeUndefined();
      expect(modeler.exportDSL()).toContain('component Kettle [0.43, 0.35]\n');
      expect(modeler.exportDSL()).not.toContain('label [');
    });

    it('takes keyboard focus from a host input, so Backspace deletes the owner', async () => {
      await modeler.importDSL(TEA_SHOP);
      const title = document.createElement('input');
      title.value = 'Tea Shop';
      document.body.appendChild(title);
      try {
        title.focus();
        const name = parts('Kettle').name;
        const rect = name.getBoundingClientRect();
        mouse(name, 'mousedown', rect.left + 4, rect.top + 4);
        mouse(document, 'mouseup', rect.left + 4, rect.top + 4);
        mouse(name, 'click', rect.left + 4, rect.top + 4);

        const svg = container.querySelector('svg')!;
        expect(document.activeElement).toBe(svg);
        expect(svg.matches(':focus-visible')).toBe(false);
        svg.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
        );
        expect(registry.find((el) => isWardleyShape(el) && el.wardleyLabel === 'Kettle')).toBe(
          undefined,
        );
        expect(title.value).toBe('Tea Shop');
      } finally {
        title.remove();
      }
    });

    it('takes keyboard focus from a host input when the evolve handle is pressed', async () => {
      await modeler.importDSL(TEA_SHOP);
      const title = document.createElement('input');
      document.body.appendChild(title);
      try {
        title.focus();
        const handle = parts('Kettle').target!;
        const rect = handle.getBoundingClientRect();
        mouse(handle, 'mousedown', rect.left + 2, rect.top + 2);
        mouse(document, 'mouseup', rect.left + 2, rect.top + 2);
        expect(document.activeElement).toBe(container.querySelector('svg'));
      } finally {
        title.remove();
      }
    });

    it('ends the drag without an extra undo step when the owner is deleted mid-drag', async () => {
      await modeler.importDSL(TEA_SHOP);
      const kettle = findByLabel(registry, 'Kettle');
      const name = parts('Kettle').name;
      const rect = name.getBoundingClientRect();
      const x = rect.left + 4;
      const y = rect.top + 4;
      mouse(name, 'mousedown', x, y);
      mouse(document, 'mousemove', x + 25, y);
      mouse(document, 'mousemove', x + 50, y);
      modeler
        .get<{ removeElements(elements: unknown[]): void }>('modeling')
        .removeElements([kettle]);
      mouse(document, 'mouseup', x + 50, y);

      expect(modeler.exportDSL()).not.toContain('component Kettle');
      modeler.undo();
      expect(modeler.exportDSL()).toContain('component Kettle [0.43, 0.35]\n');
      expect(modeler.canUndo()).toBe(false);
    });

    it('selects the owner on a click without movement and changes nothing', async () => {
      await modeler.importDSL(TEA_SHOP);
      const name = parts('Hot Water').name;
      const rect = name.getBoundingClientRect();
      mouse(name, 'mousedown', rect.left + 4, rect.top + 4);
      mouse(document, 'mouseup', rect.left + 4, rect.top + 4);
      mouse(name, 'click', rect.left + 4, rect.top + 4);
      expect(modeler.get<Selection>('selection').get()).toEqual([
        findByLabel(registry, 'Hot Water'),
      ]);
      expect(modeler.canUndo()).toBe(false);
    });

    it('starts from the drawn position of an automatically placed label', async () => {
      await modeler.importDSL(`title Short
component Online Ordering [0.8, 0.55]
evolve Online Ordering 0.6`);
      // MouseEvent coordinates are integers, so drag at 100 % to get exact offsets.
      const zoom = modeler.get<Canvas>('canvas').zoom(1);
      const before = box(parts('Online Ordering').name);
      drag(parts('Online Ordering').name, 0, 20 * zoom);
      const after = box(parts('Online Ordering').name);
      expect(Math.abs(after.left - before.left)).toBeLessThan(2 * zoom);
      expect((after.top - before.top) / zoom).toBeCloseTo(20, 0);
      expect(findByLabel(registry, 'Online Ordering').labelOffset?.dy).toBe(20);
    });

    it('drags the evolve target name into the evolve offset', async () => {
      await modeler.importDSL(TEA_SHOP);
      // MouseEvent coordinates are integers, so drag at 100 % to get exact offsets.
      const zoom = modeler.get<Canvas>('canvas').zoom(1);
      drag(parts('Kettle').targetLabel!, -12 * zoom, 18 * zoom);
      expect(findByLabel(registry, 'Kettle').movement?.labelOffset).toEqual({ dx: -12, dy: 18 });
      expect(modeler.exportDSL()).toContain('evolve Kettle 0.62 label [-12, 18]');
    });

    it('clamps the offset to ±200px', async () => {
      await modeler.importDSL(TEA_SHOP);
      // MouseEvent coordinates are integers, so drag at 100 % to get exact offsets.
      const zoom = modeler.get<Canvas>('canvas').zoom(1);
      drag(parts('Business').name, 400 * zoom, 0, 6);
      expect(findByLabel(registry, 'Business').labelOffset).toEqual({ dx: 200, dy: 0 });
    });

    it('resets an imported offset with Alt+double-click, also in the export', async () => {
      await modeler.importDSL(`title Reset
component Kettle [0.43, 0.35] label [-57, 4]`);
      const name = parts('Kettle').name;
      const rect = name.getBoundingClientRect();
      mouse(name, 'dblclick', rect.left + 4, rect.top + 4, { altKey: true });
      expect(findByLabel(registry, 'Kettle').labelOffset).toBeUndefined();
      expect(modeler.exportDSL()).not.toContain('label [');
      expect(container.querySelector('.wardley-label-input')).toBeNull();
      modeler.undo();
      expect(modeler.exportDSL()).toContain('component Kettle [0.43, 0.35] label [-57, 4]');
    });

    it('snaps back home (no offset) when dropped onto the default slot', async () => {
      await modeler.importDSL(`title Home
component Kettle [0.43, 0.35] label [20, 0]`);
      // MouseEvent coordinates are integers, so drag at 100 % to get exact offsets.
      const zoom = modeler.get<Canvas>('canvas').zoom(1);
      drag(parts('Kettle').name, -18 * zoom, 0);
      expect(findByLabel(registry, 'Kettle').labelOffset).toBeUndefined();
    });

    it('leaves panning on empty canvas alone', async () => {
      await modeler.importDSL(TEA_SHOP);
      const canvas = modeler.get<Canvas>('canvas');
      const before = canvas.viewbox();
      const svg = container.querySelector('svg')!;
      const rect = svg.getBoundingClientRect();
      const x = rect.left + 20;
      const y = rect.top + rect.height - 20;
      mouse(svg, 'mousedown', x, y);
      mouse(document, 'mousemove', x + 30, y + 30);
      mouse(document, 'mousemove', x + 60, y + 60);
      mouse(document, 'mouseup', x + 60, y + 60);
      const after = canvas.viewbox();
      expect([after.x, after.y]).not.toEqual([before.x, before.y]);
      expect(modeler.canUndo()).toBe(false);
    });
  });

  describe('canon and colours', () => {
    it('titles attitude regions canonically, above the region', async () => {
      await modeler.importDSL(`title Regions
townplanners [0.35, 0.72, 0.05, 0.99]
pioneers [1, 0.02, 0.7, 0.3]`);
      const titleOf = (kind: string) => {
        const shape = registry.find(
          (el) => isWardleyShape(el) && el.attitudeKind === kind,
        ) as WardleyShape;
        const graphics = registry.getGraphics(shape) as SVGGElement;
        return {
          title: graphics.querySelector('.wardley-attitude-title')!,
          frame: graphics.querySelector('.djs-visual > rect')!,
        };
      };
      const townPlanners = titleOf('townplanners');
      expect(townPlanners.title.textContent).toBe('Town Planners');
      expect(box(townPlanners.title).bottom).toBeLessThanOrEqual(box(townPlanners.frame).top);
      expect(townPlanners.title.getAttribute('style') ?? '').toContain('fill: rgb(11, 122, 85)');
      // At the top of the plot there is no room above, so the title stays inside the corner.
      const pioneers = titleOf('pioneers');
      expect(pioneers.title.textContent).toBe('Pioneers');
      expect(box(pioneers.title).top).toBeGreaterThanOrEqual(box(pioneers.frame).top);
    });

    it('ignores a stored region label: regions are unlabelled as in OWM', async () => {
      await modeler.importDSL(`title Regions
settlers [0.6, 0.3, 0.4, 0.6]`);
      const settlers = registry.find(
        (el) => isWardleyShape(el) && el.attitudeKind === 'settlers',
      ) as WardleyShape;
      settlers.wardleyLabel = 'Team Alpha';
      modeler.get<EventBus>('eventBus').fire('element.changed', { element: settlers });
      const title = (registry.getGraphics(settlers) as SVGGElement).querySelector(
        '.wardley-attitude-title',
      );
      expect(title?.textContent).toBe('Settlers');
    });

    it('keeps the evolve knock-out and the colours of a selected component (no filter)', async () => {
      await modeler.importDSL(TEA_SHOP);
      const underlay = gfx('Kettle').querySelector('.wardley-movement-underlay')!;
      expect(getComputedStyle(underlay).visibility).toBe('visible');
      modeler.get<Selection>('selection').select(findByLabel(registry, 'Kettle'));
      expect(getComputedStyle(underlay).visibility).toBe('visible');
      const circle = gfx('Kettle').querySelector('.djs-visual circle')!;
      expect(getComputedStyle(circle).filter).toBe('none');
    });

    it('keeps the inertia bar clear of the default name label', async () => {
      await modeler.importDSL(`title Inertia
component Legacy [0.5, 0.5] inertia`);
      const graphics = gfx('Legacy');
      const bar = graphics.querySelector('.djs-visual > line')!;
      const name = graphics.querySelector('.wardley-name-label')!;
      const zoom = modeler.get<Canvas>('canvas').zoom();
      expect((box(name).left - box(bar).right) / zoom).toBeGreaterThanOrEqual(6);
    });

    it('draws dependencies in the design-system kontur grey and text in Geist', async () => {
      await modeler.importDSL(TEA_SHOP);
      const edge = registry.find((el) => !isWardleyShape(el) && 'waypoints' in el)!;
      const line = (registry.getGraphics(edge) as SVGGElement).querySelector('polyline')!;
      expect(getComputedStyle(line).stroke).toBe('rgb(143, 138, 138)');
      expect(COLORS.dependency).toBe(MIRAGON.kontur);
      const name = parts('Kettle').name;
      expect(getComputedStyle(name).fontFamily).toBe(
        FONT.family.replace(/'/g, '"').replace('"Geist",', 'Geist,'),
      );
    });

    it('draws a `style dark` map like any other: the directive round-trips, nothing turns navy', async () => {
      await modeler.importDSL(`title Dark
style dark
component Kettle [0.43, 0.35]`);
      expect(container.className).not.toMatch(/wardley-dark/);
      expect(getComputedStyle(container).backgroundColor).toBe('rgb(249, 247, 247)');
      const stageLabel = container.querySelector('.layer-wardley-axes .wardley-axis-text')!;
      expect(getComputedStyle(stageLabel).fill).toBe('rgb(107, 102, 102)');
      expect(modeler.exportDSL()).toContain('style dark');
    });
  });
});
