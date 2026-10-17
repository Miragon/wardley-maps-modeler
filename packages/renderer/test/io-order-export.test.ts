import { describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import EventBus from 'diagram-js/lib/core/EventBus';
import type { WardleyMap } from '@miragon/wardley-schema-model';
import WardleySourceOrder from '../src/io/WardleySourceOrder.js';
import { exportBounds } from '../src/io/exportBounds.js';
import { rasterSize } from '../src/io/rasterize.js';

const plotFrame = { x: 0, y: 0, width: 1190, height: 776 };
const grid = { outerBounds: () => plotFrame };

function canvasWithLayer(layer: unknown): Canvas {
  return { getActiveLayer: () => layer } as unknown as Canvas;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Just enough of SVGMatrix for pure translations. */
class Translation {
  readonly a = 1;
  readonly b = 0;
  readonly c = 0;
  readonly d = 1;
  constructor(
    readonly e: number,
    readonly f: number,
  ) {}
  inverse(): Translation {
    return new Translation(-this.e, -this.f);
  }
  multiply(other: Translation): Translation {
    return new Translation(this.e + other.e, this.f + other.f);
  }
}

/** A layer under a pan offset, holding element visuals each translated like a diagram-js shape. */
function layerWithVisuals(visuals: { at: [number, number]; box: Box }[]): unknown {
  const pan = new Translation(250, -80);
  return {
    getCTM: () => pan,
    querySelectorAll: () =>
      visuals.map(({ at: [x, y], box }) => ({
        getBBox: () => box,
        getCTM: () => pan.multiply(new Translation(x, y)),
      })),
  };
}

describe('exportBounds', () => {
  it('falls back to the plot frame when SVG geometry is unavailable (jsdom) or throws', () => {
    const throwing = {
      getCTM: () => {
        throw new Error('not rendered');
      },
    };
    expect(exportBounds(canvasWithLayer({}), grid)).toEqual(plotFrame);
    expect(exportBounds(canvasWithLayer(throwing), grid)).toEqual(plotFrame);
    expect(exportBounds(canvasWithLayer({ getCTM: () => null }), grid)).toEqual(plotFrame);
    expect(exportBounds(canvasWithLayer(null), grid)).toEqual(plotFrame);
  });

  it('ignores an empty layer and hidden (zero-size) visuals', () => {
    const hidden = {
      at: [5000, 5000] as [number, number],
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
    expect(exportBounds(canvasWithLayer(layerWithVisuals([])), grid)).toEqual(plotFrame);
    expect(exportBounds(canvasWithLayer(layerWithVisuals([hidden])), grid)).toEqual(plotFrame);
  });

  it('grows the plot frame to the padded visuals in diagram coordinates, rounded outward', () => {
    const layer = layerWithVisuals([
      { at: [10, 30], box: { x: -30.4, y: 0, width: 50, height: 20 } },
      { at: [1100, 700], box: { x: -10, y: -10, width: 129.8, height: 90.5 } },
    ]);
    expect(exportBounds(canvasWithLayer(layer), grid, 16)).toEqual({
      x: -37,
      y: 0,
      width: 1273,
      height: 797,
    });
  });

  it('keeps the plot frame when the content fits inside it', () => {
    const layer = layerWithVisuals([
      { at: [100, 100], box: { x: 0, y: 0, width: 400, height: 300 } },
    ]);
    expect(exportBounds(canvasWithLayer(layer), grid)).toEqual(plotFrame);
  });
});

function mapWith(elementIds: string[], edgeIds: string[]): WardleyMap {
  return {
    elements: elementIds.map((id) => ({ id })),
    edges: edgeIds.map((id) => ({ id })),
  } as unknown as WardleyMap;
}

const ids = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);

describe('WardleySourceOrder', () => {
  it('sorts by the last imported map and appends unknown items in their given order', () => {
    const eventBus = new EventBus();
    const sourceOrder = new WardleySourceOrder(eventBus);
    eventBus.fire('import.render.start', { map: mapWith(['c', 'a', 'b'], ['e2', 'e1']) });

    const registryOrder = [{ id: 'a' }, { id: 'new1' }, { id: 'b' }, { id: 'new2' }, { id: 'c' }];
    expect(ids(sourceOrder.sortElements(registryOrder))).toEqual(['c', 'a', 'b', 'new1', 'new2']);
    expect(ids(sourceOrder.sortEdges([{ id: 'e1' }, { id: 'e3' }, { id: 'e2' }]))).toEqual([
      'e2',
      'e1',
      'e3',
    ]);
  });

  it('forgets the imported order when the diagram is cleared', () => {
    const eventBus = new EventBus();
    const sourceOrder = new WardleySourceOrder(eventBus);
    eventBus.fire('import.render.start', { map: mapWith(['b', 'a'], ['e2', 'e1']) });
    eventBus.fire('diagram.clear');
    expect(ids(sourceOrder.sortElements([{ id: 'a' }, { id: 'b' }]))).toEqual(['a', 'b']);
    expect(ids(sourceOrder.sortEdges([{ id: 'e1' }, { id: 'e2' }]))).toEqual(['e1', 'e2']);
  });

  it('forgets the previous map on re-import', () => {
    const eventBus = new EventBus();
    const sourceOrder = new WardleySourceOrder(eventBus);
    eventBus.fire('import.render.start', { map: mapWith(['a', 'b'], []) });
    eventBus.fire('import.render.start', { map: mapWith(['b', 'x'], []) });
    expect(ids(sourceOrder.sortElements([{ id: 'a' }, { id: 'x' }, { id: 'b' }]))).toEqual([
      'b',
      'x',
      'a',
    ]);
  });
});

describe('rasterSize', () => {
  it('multiplies the SVG size by the scale', () => {
    expect(rasterSize(1190, 776, 2)).toEqual({ width: 2380, height: 1552 });
    expect(rasterSize(1190, 776, 4)).toEqual({ width: 4760, height: 3104 });
  });

  it('lowers the density of a huge export to fit the canvas area limit, keeping the aspect', () => {
    const { width, height } = rasterSize(5110, 5096, 4);
    expect(width * height).toBeLessThanOrEqual(2 ** 27 * 1.001);
    expect(width).toBeGreaterThan(10_000);
    expect(width / height).toBeCloseTo(5110 / 5096, 3);
  });

  it('caps a very wide export at the canvas side limit', () => {
    expect(rasterSize(20_000, 300, 4)).toEqual({
      width: 32_767,
      height: Math.round((300 * 32_767) / 20_000),
    });
  });
});
