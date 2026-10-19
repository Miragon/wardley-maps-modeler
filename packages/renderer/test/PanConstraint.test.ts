// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Injector } from 'didi';
import EvolutionGrid from '../src/evolution-grid/EvolutionGrid.js';
import PanConstraint from '../src/pan-constraint/PanConstraint.js';

type ViewBox = { x: number; y: number; width: number; height: number };
type Handler = (event: Record<string, unknown>) => void;

const IDENTITY = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
  inverse: () => IDENTITY,
  multiply: () => IDENTITY,
};

/** An element layer with one drawn visual covering `box` (what the export bounds measure). */
function drawnLayer(box: ViewBox) {
  const visual = { getBBox: () => box, getCTM: () => IDENTITY };
  return { getCTM: () => IDENTITY, querySelectorAll: () => [visual] };
}

const noInjector = { get: () => null } as unknown as Injector;

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function injectorWith(insets: Insets): Injector {
  const freeRect = { insets: () => insets };
  return { get: (name: string) => (name === 'wardleyFreeRect' ? freeRect : null) } as Injector;
}

function setup(initial: ViewBox, contentBox?: ViewBox, injector: Injector = noInjector) {
  const handlers = new Map<string, Handler[]>();
  const on = (events: string | string[], priorityOrHandler: number | Handler, maybe?: Handler) => {
    const handler = typeof priorityOrHandler === 'function' ? priorityOrHandler : maybe!;
    for (const name of Array.isArray(events) ? events : [events]) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    }
  };
  const emit = (name: string, event: Record<string, unknown> = {}) => {
    for (const handler of handlers.get(name) ?? []) handler(event);
  };
  const eventBus = { on } as unknown as EventBus;

  let current = initial;
  const setCalls: ViewBox[] = [];
  const canvas = {
    viewbox: (box?: ViewBox) => {
      if (box) {
        setCalls.push(box);
        current = box;
        emit('canvas.viewbox.changed', { viewbox: box });
        return box;
      }
      return current;
    },
    getContainer: () => ({ querySelector: () => null }),
    getActiveLayer: () => (contentBox ? drawnLayer(contentBox) : null),
  } as unknown as Canvas;

  const grid = new EvolutionGrid(undefined as unknown as Canvas);
  new PanConstraint(eventBus, canvas, grid, injector);
  return {
    fire: (vb: ViewBox) => emit('canvas.viewbox.changed', { viewbox: vb }),
    emit,
    grid,
    setCalls,
    setViewbox: (vb: ViewBox) => {
      current = vb;
    },
  };
}

describe('PanConstraint', () => {
  it('clamps a panned-away viewbox back into the padded bounds', () => {
    const { fire, setCalls } = setup({ x: 5000, y: 5000, width: 400, height: 300 });
    fire({ x: 5000, y: 5000, width: 400, height: 300 });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toMatchObject({ x: 910, y: 556, width: 400, height: 300 });
  });

  it('centers the map when the viewbox is larger than the padded bounds', () => {
    const { fire, setCalls } = setup({ x: 9000, y: 9000, width: 2000, height: 1500 });
    fire({ x: 9000, y: 9000, width: 2000, height: 1500 });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toMatchObject({ x: -405, y: -412 });
  });

  it('leaves a viewbox within the bounds untouched', () => {
    const { fire, setCalls } = setup({ x: 100, y: 100, width: 400, height: 300 });
    fire({ x: 100, y: 100, width: 400, height: 300 });
    expect(setCalls).toHaveLength(0);
  });

  it('intervenes only once — its own setter does not cause recursion', () => {
    const { fire, setCalls } = setup({ x: 5000, y: 5000, width: 400, height: 300 });
    fire({ x: 5000, y: 5000, width: 400, height: 300 });
    expect(setCalls).toHaveLength(1);
  });

  it('lets the view reach content that sticks out beyond the plot', () => {
    // A long label at the commodity edge ends at x = 1600, far right of the plot's outer bounds.
    const content = { x: 60, y: 30, width: 1540, height: 700 };
    const { fire, setCalls } = setup({ x: 1300, y: 100, width: 400, height: 300 }, content);
    fire({ x: 1300, y: 100, width: 400, height: 300 });
    expect(setCalls).toHaveLength(0);

    const plotOnly = setup({ x: 1300, y: 100, width: 400, height: 300 });
    plotOnly.fire({ x: 1300, y: 100, width: 400, height: 300 });
    expect(plotOnly.setCalls[0]).toMatchObject({ x: 910 });
  });

  it('re-clamps the view when a resize shrinks the plot under it', () => {
    const { emit, grid, setCalls, setViewbox } = setup({ x: 0, y: 0, width: 400, height: 300 });
    grid.configure({ title: 'T', size: { width: 5000, height: 3000 } });
    setViewbox({ x: 4500, y: 2800, width: 400, height: 300 });
    grid.configure({ title: 'T', size: { width: 720, height: 460 } });
    emit('wardley.config.changed', { config: { title: 'T' } });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]).toMatchObject({ x: 550, y: 336 });
  });

  it('leaves the view alone during a transient (live preview) config change', () => {
    const { emit, grid, setCalls, setViewbox } = setup({ x: 0, y: 0, width: 400, height: 300 });
    setViewbox({ x: 4500, y: 2800, width: 400, height: 300 });
    grid.configure({ title: 'T', size: { width: 720, height: 460 } });
    emit('wardley.config.changed', { config: { title: 'T' }, transient: true });
    expect(setCalls).toHaveLength(0);
  });

  it('checks the view again once the resize command has redrawn its elements', () => {
    const { emit, grid, setCalls, setViewbox } = setup({ x: 0, y: 0, width: 400, height: 300 });
    emit('wardley.config.changed', { config: { title: 'T' } });
    expect(setCalls).toHaveLength(0);
    setViewbox({ x: 4500, y: 2800, width: 400, height: 300 });
    grid.configure({ title: 'T', size: { width: 720, height: 460 } });
    emit('commandStack.changed');
    expect(setCalls).toHaveLength(1);
    emit('commandStack.changed');
    expect(setCalls).toHaveLength(1);
  });

  it('keeps the view where it is when a resize leaves the smaller plot fully visible', () => {
    const { emit, grid, setCalls, setViewbox } = setup({ x: 0, y: 0, width: 400, height: 300 });
    setViewbox({ x: -125, y: -92, width: 1440, height: 900 });
    grid.configure({ title: 'T', size: { width: 830, height: 560 } });
    emit('wardley.config.changed', { config: { title: 'T' } });
    emit('commandStack.changed');
    expect(setCalls).toHaveLength(0);
  });

  describe('with the insets of a host chrome', () => {
    const INSETS = { top: 88, right: 24, bottom: 64, left: 24 };

    /** The view a host fits: the bounds centred in the free rectangle, never above 100 %. */
    function fitted(bounds: ViewBox, width: number, height: number) {
      const free = { width: width - 48, height: height - 152 };
      const scale = Math.min(1, free.width / bounds.width, free.height / bounds.height);
      return {
        x: bounds.x + bounds.width / 2 - (INSETS.left + free.width / 2) / scale,
        y: bounds.y + bounds.height / 2 - (INSETS.top + free.height / 2) / scale,
        width: width / scale,
        height: height / scale,
        scale,
      };
    }

    it.each([
      [1280, 900],
      [2560, 1600],
      [720, 700],
    ])('never pulls a view the host fitted into a %ix%i container', (width, height) => {
      const grid = new EvolutionGrid(undefined as unknown as Canvas);
      const view = fitted(grid.outerBounds(), width, height);
      const { fire, setCalls } = setup(view, undefined, injectorWith(INSETS));
      fire(view);
      expect(setCalls).toHaveLength(0);
    });

    it('still pulls a view panned far away back towards the map', () => {
      const { fire, setCalls } = setup(
        { x: 5000, y: 5000, width: 400, height: 300, scale: 1 } as ViewBox,
        undefined,
        injectorWith(INSETS),
      );
      fire({ x: 5000, y: 5000, width: 400, height: 300, scale: 1 } as ViewBox);
      expect(setCalls).toHaveLength(1);
    });
  });
});
