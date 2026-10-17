import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import { MAP_SIZE_PRESETS } from '@miragon/wardley-schema-model';
import { patchDSL } from '@miragon/wardley-dsl';
import { Modeler, PLOT, Viewer } from '../../src/index.js';
import type EvolutionGrid from '../../src/evolution-grid/EvolutionGrid.js';
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyShape,
} from '../../src/model/di-types.js';
// Pull the real stylesheet in so layout (getBBox) matches production. src/index.ts also imports it.
import '../../src/assets/wardley.css';

// Label offsets, evolve (with label offset and method), a pipeline block with children and a
// standalone pipeline with (y …), attitudes, notes, a multi-point annotation, accelerators, a
// submap with a url, drawings and links with labels and flows.
const RICH = `title Rich size test
annotations [0.97, 0.03]
url Payments URL [https://example.com/payments]
anchor Business [0.95, 0.63] label [-30, -8]
anchor Public [0.95, 0.78]
component Cup of Tea [0.79, 0.61] label [19, -4]
component Tea [0.63, 0.81] inertia label [-63, 4]
component Hot Water [0.52, 0.8] label [5, 8]
component Kettle [0.43, 0.35] label [-57, 4]
component Power [0.1, 0.7] label [-27, 20]
component Water [0.38, 0.82] (buy)
pioneers [0.6, 0.05, 0.45, 0.25]
townplanners [0.3, 0.8, 0.15, 0.97]
accelerator Open source [0.33, 0.12]
deaccelerator Regulation [0.2, 0.3]
submap Payments [0.55, 0.45] url(Payments URL)
note Standardising power allows Kettles to evolve faster [0.3, 0.49]
note Hot water is obvious [0.66, 0.91] (color #0B7A55)
annotation 1 [[0.43, 0.49], [0.08, 0.79]] Standardising power
annotation 2 [0.48, 0.85] Hot water is obvious
line [[0.9, 0.1], [0.85, 0.2], [0.88, 0.33]] (dashed) (color #C92A2A)
line [[0.1, 0.1], [0.1, 0.22], [0.02, 0.22]] (closed)
pipeline Kettle [0.23, 0.68]
{
  component Electric Kettle [0.45] label [10, 6]
  component Smart Kettle [0.29]
}
pipeline Brewing [0.15, 0.55] (y 0.24)
evolve Kettle 0.62 label [16, 5]
evolve Power 0.89 (buy)
Business -> Cup of Tea
Public -> Cup of Tea
Cup of Tea -> Tea
Cup of Tea -> Hot Water; served hot
Hot Water -> Water
Hot Water -> Kettle
Kettle -> Power
Electric Kettle -> Power
Tea +'£1.20'> Water
Business +<> Public; settles`;

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  points?: Array<{ x: number; y: number }>;
}

function geometryOf(registry: ElementRegistry): Map<string, Geometry> {
  const result = new Map<string, Geometry>();
  for (const element of registry.getAll()) {
    if (isWardleyShape(element)) {
      result.set(element.id, {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        ...(element.drawingPoints ? { points: element.drawingPoints } : {}),
      });
    } else if (isWardleyConnection(element)) {
      result.set(element.id, {
        x: element.waypoints[0]!.x,
        y: element.waypoints[0]!.y,
        width: element.waypoints[1]!.x,
        height: element.waypoints[1]!.y,
      });
    }
  }
  return result;
}

function expectSameGeometry(actual: Map<string, Geometry>, expected: Map<string, Geometry>): void {
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
  for (const [id, want] of expected) {
    const got = actual.get(id)!;
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(got[key], `${id}.${key}`).toBeCloseTo(want[key], 6);
    }
    (want.points ?? []).forEach((point, index) => {
      expect(got.points?.[index]?.x, `${id}.points[${index}].x`).toBeCloseTo(point.x, 6);
      expect(got.points?.[index]?.y, `${id}.points[${index}].y`).toBeCloseTo(point.y, 6);
    });
  }
}

function withoutSizeLine(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('size '))
    .join('\n');
}

function sizeLinesOf(text: string): string[] {
  return text.split('\n').filter((line) => line.startsWith('size '));
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  // Explicit pixel size: without it the canvas collapses to 0 height and getBBox boxes are empty.
  container.style.width = '1024px';
  container.style.height = '768px';
  document.body.appendChild(container);
  return container;
}

describe('map resize (Modeler, real browser DOM)', () => {
  let container: HTMLElement;
  let modeler: Modeler;
  let registry: ElementRegistry;

  beforeEach(async () => {
    container = createContainer();
    modeler = new Modeler({ container, width: 1024, height: 768 });
    await modeler.importDSL(RICH);
    registry = modeler.get<ElementRegistry>('elementRegistry');
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
  });

  it('changes only the size line for every preset and arbitrary sizes', async () => {
    const original = modeler.exportDSL();
    expect(sizeLinesOf(original)).toEqual([]);
    const sizes = [
      ...MAP_SIZE_PRESETS.map((preset) => [preset.width, preset.height] as const),
      [480, 320] as const,
      [5000, 3000] as const,
      [1234, 777] as const,
      [1000, 1600] as const,
    ];
    for (const [width, height] of sizes) {
      await modeler.setMapSize(width, height);
      const exported = modeler.exportDSL();
      expect(sizeLinesOf(exported)).toEqual([`size [${width}, ${height}]`]);
      expect(withoutSizeLine(exported)).toBe(original);
    }
  });

  it('keeps block comment lines that start with "size" and patches only the size line', async () => {
    const source = `title Market map
/* Context for the workshop:
   Size of market: large, growing 20% a year
   size: unknown
*/
component Customer [0.9, 0.5] // who pays
component Product [0.6, 0.6]

Customer -> Product
`;
    await modeler.importDSL(source);
    await modeler.setMapSize(1440, 900);
    expect(patchDSL(source, modeler.exportMap())).toBe(
      source.replace('title Market map\n', 'title Market map\nsize [1440, 900]\n'),
    );
    await modeler.resetMapSize();
    expect(patchDSL(source, modeler.exportMap())).toBe(source);
  });

  it('leaves the view where it is when the smaller plot stays fully visible', async () => {
    const canvas = modeler.get<Canvas>('canvas');
    const grid = modeler.get<EvolutionGrid>('evolutionGrid');
    const outer = grid.outerBounds();
    canvas.viewbox({ x: outer.x - 40, y: outer.y - 60, width: 1600, height: 1200 });
    const before = canvas.viewbox();
    await modeler.setMapSize(720, 460);
    const after = canvas.viewbox();
    expect([after.x, after.y]).toEqual([before.x, before.y]);
  });

  it('stays byte-stable over 30 random resizes', async () => {
    const original = modeler.exportDSL();
    const originalGeometry = geometryOf(registry);
    const random = seededRandom(42);
    for (let step = 0; step < 30; step++) {
      await modeler.setMapSize(400 + random() * 5000, 200 + random() * 5000);
      expect(withoutSizeLine(modeler.exportDSL())).toBe(original);
    }
    await modeler.resetMapSize();
    expect(modeler.exportDSL()).toBe(original);
    expectSameGeometry(geometryOf(registry), originalGeometry);
  });

  it('places every element exactly like a fresh import at the new size', async () => {
    await modeler.setMapSize(1440, 900);
    const resized = geometryOf(registry);

    const otherContainer = createContainer();
    const fresh = new Modeler({ container: otherContainer, width: 1024, height: 768 });
    try {
      await fresh.importDSL(modeler.exportDSL());
      expectSameGeometry(resized, geometryOf(fresh.get<ElementRegistry>('elementRegistry')));
    } finally {
      fresh.destroy();
      otherContainer.remove();
    }
  });

  it('is one undo step that restores size and pixel geometry, and redo re-applies it', async () => {
    const original = modeler.exportDSL();
    const before = geometryOf(registry);
    await modeler.setMapSize(1760, 720);
    const after = geometryOf(registry);
    const resizedText = modeler.exportDSL();
    expect(modeler.canUndo()).toBe(true);

    modeler.undo();
    expect(modeler.exportDSL()).toBe(original);
    expect(modeler.getMapSize()).toMatchObject({ width: 1080, height: 680, isExplicit: false });
    expectSameGeometry(geometryOf(registry), before);

    modeler.redo();
    expect(modeler.exportDSL()).toBe(resizedText);
    expectSameGeometry(geometryOf(registry), after);
  });

  it('keeps earlier history: move, resize, undo twice restores the original', async () => {
    const original = modeler.exportDSL();
    const before = geometryOf(registry);
    const water = registry.get('cmp_water') as WardleyShape;
    modeler.get<Modeling>('modeling').moveShape(water, { x: 40, y: 0 });
    const moved = modeler.exportDSL();
    expect(moved).not.toBe(original);

    await modeler.setMapSize(720, 460);
    expect(withoutSizeLine(modeler.exportDSL())).toBe(moved);

    modeler.undo();
    expect(modeler.exportDSL()).toBe(moved);
    modeler.undo();
    expect(modeler.exportDSL()).toBe(original);
    expectSameGeometry(geometryOf(registry), before);
  });

  it('keeps the selection and the viewbox', async () => {
    const selection = modeler.get<Selection>('selection');
    const canvas = modeler.get<Canvas>('canvas');
    const tea = registry.get('cmp_tea')!;
    selection.select(tea);
    canvas.viewbox({ x: 100, y: 50, width: 800, height: 600 });
    const viewbox = canvas.viewbox();

    await modeler.setMapSize(1440, 900);
    expect(selection.get().map((element) => element.id)).toEqual(['cmp_tea']);
    const after = canvas.viewbox();
    expect(after.x).toBeCloseTo(viewbox.x, 6);
    expect(after.y).toBeCloseTo(viewbox.y, 6);
    expect(after.scale).toBeCloseTo(viewbox.scale, 6);

    modeler.undo();
    expect(selection.get().map((element) => element.id)).toEqual(['cmp_tea']);
  });

  it('pulls the view back onto the map after shrinking while scrolled into a far corner', async () => {
    const canvas = modeler.get<Canvas>('canvas');
    await modeler.setMapSize(5000, 3000);
    canvas.viewbox({ x: 4300, y: 2600, width: 800, height: 600 });
    await modeler.setMapSize(720, 460);
    const viewbox = canvas.viewbox();
    const outer = modeler.get<EvolutionGrid>('evolutionGrid').outerBounds();
    expect(viewbox.x).toBeLessThan(outer.x + outer.width);
    expect(viewbox.y).toBeLessThan(outer.y + outer.height);
  });

  it('throws on NaN and Infinity without changing anything', async () => {
    const original = modeler.exportDSL();
    const before = geometryOf(registry);
    let commands = 0;
    modeler.on('commandStack.changed', () => commands++);

    await expect(modeler.setMapSize(Number.NaN, 600)).rejects.toThrow(RangeError);
    await expect(modeler.setMapSize(800, Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError);
    expect(commands).toBe(0);
    expect(modeler.canUndo()).toBe(false);
    expect(modeler.exportDSL()).toBe(original);
    expectSameGeometry(geometryOf(registry), before);
  });

  it('clamps and rounds out-of-range sizes before writing them', async () => {
    await modeler.setMapSize(100, 9000.4);
    expect(sizeLinesOf(modeler.exportDSL())).toEqual(['size [480, 5000]']);
    await modeler.setMapSize(1234.6, 777.2);
    expect(sizeLinesOf(modeler.exportDSL())).toEqual(['size [1235, 777]']);
  });

  it('writes an explicit line for the default size; only reset removes it', async () => {
    const before = geometryOf(registry);
    await modeler.setMapSize(1080, 680);
    expect(sizeLinesOf(modeler.exportDSL())).toEqual(['size [1080, 680]']);
    expect(modeler.getMapSize()).toEqual({
      width: 1080,
      height: 680,
      isExplicit: true,
      presetId: 'standard',
    });
    expectSameGeometry(geometryOf(registry), before);

    await modeler.resetMapSize();
    expect(modeler.exportMap().config.size).toBeUndefined();
    expect(modeler.getMapSize()).toEqual({
      width: 1080,
      height: 680,
      isExplicit: false,
      presetId: 'standard',
    });
    modeler.undo();
    expect(modeler.exportMap().config.size).toEqual({ width: 1080, height: 680 });
  });

  it('does nothing when the size does not change', async () => {
    await modeler.setMapSize(720, 460);
    let commands = 0;
    modeler.on('commandStack.changed', () => commands++);
    await modeler.setMapSize(720.2, 459.8);
    expect(commands).toBe(0);
    await modeler.resetMapSize();
    await modeler.resetMapSize();
    expect(commands).toBe(1);
  });

  it('reports the size with getMapSize', async () => {
    await modeler.setMapSize(1234, 777);
    expect(modeler.getMapSize()).toEqual({ width: 1234, height: 777, isExplicit: true });
    await modeler.setMapSize(1440, 900);
    expect(modeler.getMapSize()).toMatchObject({ presetId: 'large', isExplicit: true });
  });

  it('fires commandStack.changed once and wardley.config.changed on execute, undo and redo', async () => {
    const commandEvents: string[] = [];
    const configSizes: Array<number | undefined> = [];
    modeler.on<{ trigger: string }>('commandStack.changed', (event) =>
      commandEvents.push(event.trigger),
    );
    modeler.on<{ config: { size?: { width: number } } }>('wardley.config.changed', (event) =>
      configSizes.push(event.config.size?.width),
    );
    await modeler.setMapSize(1440, 900);
    modeler.undo();
    modeler.redo();
    expect(commandEvents).toEqual(['execute', 'undo', 'redo']);
    expect(configSizes).toEqual([1440, undefined, 1440]);
  });

  it('drops an unreadable raw size line and restores it on undo', async () => {
    await modeler.importDSL('title K\nsize [1e3, 5e2]\ncomponent A [0.5, 0.5]');
    expect(modeler.exportMap().rawPassthrough).toEqual(['size [1e3, 5e2]']);
    await modeler.setMapSize(720, 460);
    expect(modeler.exportMap().rawPassthrough).toBeUndefined();
    expect(sizeLinesOf(modeler.exportDSL())).toEqual(['size [720, 460]']);
    modeler.undo();
    expect(modeler.exportMap().rawPassthrough).toEqual(['size [1e3, 5e2]']);
    expect(sizeLinesOf(modeler.exportDSL())).toEqual(['size [1e3, 5e2]']);
  });
});

describe('config updates (Modeler)', () => {
  let container: HTMLElement;
  let modeler: Modeler;

  beforeEach(async () => {
    container = createContainer();
    modeler = new Modeler({ container, width: 1024, height: 768 });
    await modeler.importDSL(RICH);
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
  });

  it('normalizes X-axis labels that would break the evolution line', async () => {
    modeler.setEvolutionLabels(['A->B', '', 'Product', 'Commodity']);
    const exported = modeler.exportDSL();
    const { warnings } = await modeler.importDSL(exported);
    expect(warnings).toEqual([]);
    expect(modeler.exportMap().config.evolutionLabels).toEqual([
      'A→B',
      'Custom-Built',
      'Product',
      'Commodity',
    ]);
  });

  it('makes evolution labels one undo step', () => {
    const labels = ['Novel', 'Emerging', 'Good', 'Best'] as const;
    modeler.setEvolutionLabels(labels);
    expect(modeler.exportMap().config.evolutionLabels).toEqual(labels);
    expect(modeler.canUndo()).toBe(true);
    modeler.undo();
    expect(modeler.exportMap().config.evolutionLabels).toBeUndefined();
    modeler.redo();
    expect(modeler.exportMap().config.evolutionLabels).toEqual(labels);
  });

  it('commits transient label previews as one step from the state before the preview', () => {
    modeler.setEvolutionLabels(['N', 'E', 'G', 'B'], { transient: true });
    modeler.setEvolutionLabels(['No', 'Em', 'Go', 'Be'], { transient: true });
    expect(modeler.canUndo()).toBe(false);
    expect(modeler.exportMap().config.evolutionLabels).toEqual(['No', 'Em', 'Go', 'Be']);

    modeler.setEvolutionLabels(['Novel', 'Emerging', 'Good', 'Best']);
    expect(modeler.exportMap().config.evolutionLabels).toEqual([
      'Novel',
      'Emerging',
      'Good',
      'Best',
    ]);
    modeler.undo();
    expect(modeler.exportMap().config.evolutionLabels).toBeUndefined();
    expect(modeler.canUndo()).toBe(false);
  });

  it('adds no undo step when a preview ends where it started', () => {
    modeler.setEvolutionLabels(['N', 'E', 'G', 'B'], { transient: true });
    modeler.setEvolutionLabels(undefined);
    expect(modeler.exportMap().config.evolutionLabels).toBeUndefined();
    expect(modeler.canUndo()).toBe(false);
  });

  it('sets the title as one undo step, on one line, with a default fallback', () => {
    modeler.setTitle('  Payments\nPlatform \r\n v2 ');
    expect(modeler.exportMap().config.title).toBe('Payments Platform v2');
    expect(modeler.exportDSL().split('\n')[0]).toBe('title Payments Platform v2');
    modeler.undo();
    expect(modeler.exportMap().config.title).toBe('Rich size test');
    modeler.setTitle(' \n ');
    expect(modeler.exportMap().config.title).toBe('Untitled Map');
  });

  it('changes only the config line it is about', () => {
    const original = modeler.exportDSL();
    modeler.setTitle('Renamed');
    const lines = modeler.exportDSL().split('\n');
    const originalLines = original.split('\n');
    expect(lines.filter((line, index) => line !== originalLines[index])).toEqual(['title Renamed']);
  });
});

describe('map resize handles (Modeler)', () => {
  let container: HTMLElement;
  let modeler: Modeler;
  let registry: ElementRegistry;

  beforeEach(async () => {
    container = createContainer();
    // Small enough to fit the test page, so elementFromPoint can hit the handles.
    modeler = new Modeler({ container, width: 400, height: 400 });
    await modeler.importDSL(RICH);
    registry = modeler.get<ElementRegistry>('elementRegistry');
    showPlotCorner();
  });

  /** A 1:1 view (diagram px = screen px) around the plot's bottom-right corner. */
  function showPlotCorner(): void {
    const { width, height } = modeler.get<EvolutionGrid>('evolutionGrid').getPlotSize();
    const corner = { x: PLOT.marginLeft + width, y: PLOT.marginTop + height };
    modeler
      .get<Canvas>('canvas')
      .viewbox({ x: corner.x - 200, y: corner.y - 200, width: 400, height: 400 });
  }

  afterEach(() => {
    modeler.destroy();
    container.remove();
  });

  /** A point on the handle, close to the corner so it is on screen. */
  function handlePoint(axis: 'x' | 'y' | 'xy'): { x: number; y: number } {
    const hit = container.querySelector(`.wardley-map-resize-${axis} .wardley-map-resize-hit`)!;
    const box = hit.getBoundingClientRect();
    return {
      x: axis === 'y' ? box.right - 30 : box.x + box.width / 2,
      y: axis === 'x' ? box.bottom - 30 : box.y + box.height / 2,
    };
  }

  function mouse(type: string, target: EventTarget, point: { x: number; y: number }, init = {}) {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        button: 0,
        ...init,
      }),
    );
  }

  function startDrag(axis: 'x' | 'y' | 'xy'): { x: number; y: number } {
    const start = handlePoint(axis);
    const target = document.elementFromPoint(start.x, start.y)!;
    expect(target.classList.contains('wardley-map-resize-hit')).toBe(true);
    mouse('mousedown', target, start);
    return start;
  }

  it('sits above the axes and below the elements', () => {
    const viewport = container.querySelector('.viewport')!;
    const layers = [...viewport.children].map((child) => child.getAttribute('class') ?? '');
    const axes = layers.findIndex((name) => name.includes('layer-wardley-axes'));
    const handles = layers.findIndex((name) => name.includes('layer-wardley-map-resize'));
    const elements = layers.findIndex((name) => name.includes('layer-root'));
    expect(axes).toBeGreaterThanOrEqual(0);
    expect(handles).toBeGreaterThan(axes);
    expect(elements).toBeGreaterThan(handles);
  });

  it('resizes by dragging the corner: live preview, one undo step, only the size line', () => {
    const original = modeler.exportDSL();
    let commands = 0;
    modeler.on('commandStack.changed', () => commands++);
    const start = startDrag('xy');

    mouse('mousemove', document, { x: start.x + 180, y: start.y + 110 });
    mouse('mousemove', document, { x: start.x + 363, y: start.y + 223 });
    // Live preview: the grid is already drawn at the snapped preset size, without a command.
    expect(modeler.get<EvolutionGrid>('evolutionGrid').getPlotSize()).toEqual({
      width: 1440,
      height: 900,
    });
    expect(commands).toBe(0);
    expect(container.querySelector('.wardley-map-resize-badge')?.textContent).toBe(
      '1440 × 900 · Large',
    );

    mouse('mouseup', document, { x: start.x + 363, y: start.y + 223 });
    expect(commands).toBe(1);
    const exported = modeler.exportDSL();
    expect(sizeLinesOf(exported)).toEqual(['size [1440, 900]']);
    expect(withoutSizeLine(exported)).toBe(original);
    expect((container.querySelector('.wardley-map-resize-badge') as HTMLElement).hidden).toBe(true);

    modeler.undo();
    expect(modeler.exportDSL()).toBe(original);
    expect(modeler.canUndo()).toBe(false);
  });

  it('does not auto-scroll the view while the corner is held at the viewport edge', async () => {
    const canvas = modeler.get<Canvas>('canvas');
    const before = canvas.viewbox();
    const start = startDrag('xy');
    const edge = container.getBoundingClientRect();
    const nearEdge = { x: edge.right - 3, y: edge.bottom - 3 };
    mouse('mousemove', document, { x: start.x + 20, y: start.y + 20 });
    mouse('mousemove', document, nearEdge);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const during = canvas.viewbox();
    expect([during.x, during.y]).toEqual([before.x, before.y]);
    const badge = container.querySelector('.wardley-map-resize-badge')?.textContent;
    mouse('mouseup', document, nearEdge);
    const size = modeler.exportMap().config.size!;
    expect(badge?.startsWith(`${size.width} × ${size.height}`)).toBe(true);
  });

  it('snaps an edge drag to 10px steps and keeps the other side', () => {
    const start = startDrag('x');
    mouse('mousemove', document, { x: start.x + 57, y: start.y + 30 });
    mouse('mouseup', document, { x: start.x + 57, y: start.y + 30 });
    expect(modeler.exportMap().config.size).toEqual({ width: 1140, height: 680 });

    const bottom = startDrag('y');
    mouse('mousemove', document, { x: bottom.x - 20, y: bottom.y - 104 });
    mouse('mouseup', document, { x: bottom.x - 20, y: bottom.y - 104 });
    expect(modeler.exportMap().config.size).toEqual({ width: 1140, height: 580 });
  });

  it('keeps the aspect ratio with Shift', () => {
    const start = startDrag('xy');
    const end = { x: start.x + 540, y: start.y + 10 };
    mouse('mousemove', document, end, { shiftKey: true });
    mouse('mouseup', document, end, { shiftKey: true });
    expect(modeler.exportMap().config.size).toEqual({ width: 1620, height: 1020 });
  });

  it('cancels with Escape and restores the exact start state', () => {
    const original = modeler.exportDSL();
    const before = geometryOf(registry);
    let commands = 0;
    modeler.on('commandStack.changed', () => commands++);
    const start = startDrag('xy');
    mouse('mousemove', document, { x: start.x - 300, y: start.y - 200 });
    expect(modeler.get<EvolutionGrid>('evolutionGrid').getPlotSize().width).toBe(780);

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    expect(commands).toBe(0);
    expect(modeler.get<EvolutionGrid>('evolutionGrid').getPlotSize()).toEqual({
      width: 1080,
      height: 680,
    });
    expect(modeler.exportDSL()).toBe(original);
    expectSameGeometry(geometryOf(registry), before);
  });

  it('leaves the view where it was when a drag is cancelled', () => {
    const canvas = modeler.get<Canvas>('canvas');
    // Zoomed out, the whole map is centred in the view. The grown preview reaches beyond the
    // start plot; measuring it on cancel would re-centre the view.
    canvas.zoom(0.25);
    const before = canvas.viewbox();
    const start = startDrag('xy');
    mouse('mousemove', document, { x: start.x + 80, y: start.y + 50 });
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    const after = canvas.viewbox();
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.scale).toBeCloseTo(before.scale, 6);
  });

  it('keeps the handles the same size on screen at every zoom level', () => {
    const canvas = modeler.get<Canvas>('canvas');
    const cornerHit = () =>
      container
        .querySelector('.wardley-map-resize-xy .wardley-map-resize-hit')!
        .getBoundingClientRect();
    const edgeHit = () =>
      container
        .querySelector('.wardley-map-resize-x .wardley-map-resize-hit')!
        .getBoundingClientRect();
    for (const zoom of [0.4, 1, 2.5]) {
      canvas.zoom(zoom);
      expect(cornerHit().width).toBeCloseTo(16, 0);
      expect(edgeHit().width).toBeCloseTo(8, 0);
    }
  });

  it('cancels a running drag when a map is imported, keeping the new map intact', async () => {
    const start = startDrag('xy');
    mouse('mousemove', document, { x: start.x + 200, y: start.y + 100 });
    await modeler.importDSL('title Replaced\nsize [800, 500]\ncomponent Fresh [0.5, 0.5]');
    mouse('mouseup', document, { x: start.x + 220, y: start.y + 120 });
    const map = modeler.exportMap();
    expect(map.config.title).toBe('Replaced');
    expect(map.config.size).toEqual({ width: 800, height: 500 });
    expect(modeler.canUndo()).toBe(false);
  });

  it('does not create a step when the drag ends at the start size', () => {
    let commands = 0;
    modeler.on('commandStack.changed', () => commands++);
    const start = startDrag('xy');
    mouse('mousemove', document, { x: start.x + 100, y: start.y + 100 });
    mouse('mousemove', document, { x: start.x + 2, y: start.y + 1 });
    mouse('mouseup', document, { x: start.x + 2, y: start.y + 1 });
    expect(commands).toBe(0);
    expect(modeler.exportMap().config.size).toBeUndefined();
  });

  it('resets to the default size on a double-click on the corner', async () => {
    await modeler.setMapSize(1440, 900);
    showPlotCorner();
    const corner = handlePoint('xy');
    mouse('dblclick', document.elementFromPoint(corner.x, corner.y)!, corner);
    expect(modeler.exportMap().config.size).toBeUndefined();
    modeler.undo();
    expect(modeler.exportMap().config.size).toEqual({ width: 1440, height: 900 });
  });

  it('keeps the selection while dragging a handle', () => {
    const selection = modeler.get<Selection>('selection');
    selection.select(registry.get('cmp_tea')!);
    const start = startDrag('xy');
    mouse('mousemove', document, { x: start.x + 100, y: start.y + 100 });
    mouse('mouseup', document, { x: start.x + 100, y: start.y + 100 });
    expect(selection.get().map((element) => element.id)).toEqual(['cmp_tea']);
  });

  it('leaves the handle styling to the stylesheet (no inline style)', () => {
    const visual = container.querySelector('.wardley-map-resize-xy .wardley-map-resize-visual')!;
    expect(visual.getAttribute('style')).toBeNull();
    expect(getComputedStyle(visual).stroke).not.toBe('none');
    const start = startDrag('xy');
    mouse('mousemove', document, { x: start.x + 40, y: start.y + 40 });
    expect(container.querySelector('.wardley-map-resize')!.classList).toContain('is-dragging');
    mouse('mouseup', document, { x: start.x + 40, y: start.y + 40 });
  });

  it('leaves no trace of the handles in the SVG export', async () => {
    const { svg } = await modeler.saveSVG();
    expect(svg).not.toContain('wardley-map-resize');
    const grid = modeler.get<EvolutionGrid>('evolutionGrid');
    const bounds = grid.outerBounds();
    const { width, height } = grid.getPlotSize();
    const image = new Image();
    image.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await image.decode();
    const canvasElement = document.createElement('canvas');
    canvasElement.width = bounds.width;
    canvasElement.height = bounds.height;
    const context = canvasElement.getContext('2d')!;
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(image.src);
    // Just outside the plot's right edge, on the right edge's hit strip: nothing is drawn there.
    const alpha = context.getImageData(
      PLOT.marginLeft + width + 3 - bounds.x,
      PLOT.marginTop + height / 3 - bounds.y,
      1,
      1,
    ).data[3];
    expect(alpha).toBe(0);
  });

  it('lets an element at the plot edge win the hit test over the edge handle', async () => {
    await modeler.importDSL('title Edge\ncomponent Edge Case [0.5, 1]');
    modeler.get<Canvas>('canvas').viewbox({ x: 950, y: 180, width: 400, height: 400 });
    const edge = registry.find(
      (element) => isWardleyShape(element) && element.wardleyLabel === 'Edge Case',
    ) as WardleyShape;
    const hitGfx = registry.getGraphics(edge).querySelector('.djs-hit')!;
    const box = hitGfx.getBoundingClientRect();
    const onEdge = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    expect(onEdge).toBe(hitGfx);
  });
});

describe('Viewer (no command stack)', () => {
  let container: HTMLElement;
  let viewer: Viewer;

  beforeEach(async () => {
    container = createContainer();
    viewer = new Viewer({ container, width: 1024, height: 768 });
    await viewer.importDSL('title V\nsize [1e3, 5e2]\ncomponent A [0.5, 0.5]');
  });

  afterEach(() => {
    viewer.destroy();
    container.remove();
  });

  it('re-imports with the normalized size and drops a raw size line', async () => {
    await viewer.setMapSize(1440.4, 899.6);
    expect(viewer.exportMap().config.size).toEqual({ width: 1440, height: 900 });
    expect(viewer.exportMap().rawPassthrough).toBeUndefined();
    expect(viewer.getMapSize()).toEqual({
      width: 1440,
      height: 900,
      isExplicit: true,
      presetId: 'large',
    });
    await expect(viewer.setMapSize(Number.NaN, 1)).rejects.toThrow(RangeError);
    await viewer.resetMapSize();
    expect(viewer.exportMap().config.size).toBeUndefined();
  });

  it('applies title and labels directly', () => {
    viewer.setTitle('Viewer\ntitle');
    viewer.setEvolutionLabels(['A', 'B', 'C', 'D']);
    expect(viewer.exportMap().config).toMatchObject({
      title: 'Viewer title',
      evolutionLabels: ['A', 'B', 'C', 'D'],
    });
  });
});
