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

    /** The insets of an inspector open on the right, and of a compact embedded chrome. */
    const INSPECTOR = { top: 88, right: 324, bottom: 64, left: 24 };
    const EMBEDDED = { top: 60, right: 16, bottom: 12, left: 16 };

    function fittedInto(insets: Insets, bounds: ViewBox, width: number, height: number) {
      const free = {
        width: width - insets.left - insets.right,
        height: height - insets.top - insets.bottom,
      };
      const scale = Math.min(1, free.width / bounds.width, free.height / bounds.height);
      return {
        x: bounds.x + bounds.width / 2 - (insets.left + free.width / 2) / scale,
        y: bounds.y + bounds.height / 2 - (insets.top + free.height / 2) / scale,
        width: width / scale,
        height: height / scale,
        scale,
      };
    }

    it.each([
      ['the shell', INSETS, 1440, 790],
      ['the shell', INSETS, 2560, 1600],
      ['an inspector', INSPECTOR, 1600, 1000],
      ['an embedded chrome', EMBEDDED, 1000, 640],
      ['an embedded chrome', EMBEDDED, 1440, 790],
    ])(
      'never pulls a view %s fitted to the plot while a long label reaches beyond it (%#)',
      (_host, insets, width, height) => {
        const grid = new EvolutionGrid(undefined as unknown as Canvas);
        const plot = grid.outerBounds();
        // A commodity label 46px beyond the plot: the content is not centred where the plot is.
        const content = { ...plot, width: plot.width + 46 };
        const view = fittedInto(insets, plot, width, height);
        const { fire, setCalls } = setup(view, content, injectorWith(insets));
        fire(view);
        expect(setCalls).toHaveLength(0);
      },
    );

    /** A commodity label of some twenty words: the content is far wider than the plot. */
    const withLongLabel = (plot: ViewBox) => ({ ...plot, width: plot.width + 1000 });

    // Wide and low: the fit is limited by the height and leaves room beside the plot.
    it.each([
      ['the shell', INSETS, 1440, 790],
      ['the shell', INSETS, 1680, 860],
      ['an inspector', INSPECTOR, 1800, 800],
      ['an embedded chrome', EMBEDDED, 1440, 790],
    ])(
      'never pulls a view %s fitted to the plot while a label makes the content wider than the free rectangle (%#)',
      (_host, insets, width, height) => {
        const plot = new EvolutionGrid(undefined as unknown as Canvas).outerBounds();
        const content = withLongLabel(plot);
        const view = fittedInto(insets, plot, width, height);
        expect(content.width * view.scale).toBeGreaterThan(width - insets.left - insets.right);
        const { fire, setCalls } = setup(view, content, injectorWith(insets));
        fire(view);
        expect(setCalls).toHaveLength(0);
      },
    );

    it('lets the view follow a label wider than the free rectangle to its end, and no further', () => {
      const plot = new EvolutionGrid(undefined as unknown as Canvas).outerBounds();
      const content = withLongLabel(plot);
      const fitted = fittedInto(INSETS, plot, 1440, 790);
      const freeEnd = (1440 - INSETS.right) / fitted.scale;
      const atLabelEnd = { ...fitted, x: content.x + content.width - freeEnd };
      const { fire, setCalls } = setup(atLabelEnd, content, injectorWith(INSETS));
      fire(atLabelEnd);
      expect(setCalls).toHaveLength(0);

      fire({ ...atLabelEnd, x: atLabelEnd.x + 400 / fitted.scale });
      expect(setCalls).toHaveLength(1);
      expect((setCalls[0]!.x - atLabelEnd.x) * fitted.scale).toBeCloseTo(96, 6);
    });

    it('lets a zoomed-out map rest anywhere inside the free rectangle', () => {
      // 1600 × 1000 at 25 %: the free rectangle is 5008 × 3392 diagram px, the plot 1190 × 776.
      const view = {
        x: -24 / 0.25 - 600,
        y: -88 / 0.25 - 900,
        width: 6400,
        height: 4000,
        scale: 0.25,
      };
      const { fire, setCalls } = setup(view, undefined, injectorWith(INSPECTOR));
      fire(view);
      expect(setCalls).toHaveLength(0);
    });

    it('pulls a zoomed-out map back from under the inspector', () => {
      // The plot's right edge would sit 400 screen px inside the 324px inspector.
      const scale = 0.25;
      const width = 1600;
      const x = 1190 - (width - 324 + 400) / scale;
      const view = { x, y: -500, width: width / scale, height: 1000 / scale, scale };
      const { fire, setCalls } = setup(view, undefined, injectorWith(INSPECTOR));
      fire(view);
      expect(setCalls).toHaveLength(1);
      const rightEdgeOnScreen = (1190 - setCalls[0]!.x) * scale;
      expect(rightEdgeOnScreen).toBeCloseTo(width - 324 + 96, 6);
    });

    it('treats an axis without free room as free across the whole container', () => {
      const short = { top: 300, right: 24, bottom: 300, left: 24 };
      const view = fittedInto(
        { ...short, top: 0, bottom: 0 },
        { x: 0, y: 0, width: 1190, height: 776 },
        1440,
        500,
      );
      const { fire, setCalls } = setup(view, undefined, injectorWith(short));
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
