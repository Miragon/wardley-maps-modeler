// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import EvolutionGrid from '../src/evolution-grid/EvolutionGrid.js';
import PanConstraint from '../src/pan-constraint/PanConstraint.js';

type ViewBox = { x: number; y: number; width: number; height: number };
type Handler = (event: Record<string, unknown>) => void;

function setup(initial: ViewBox, contentBox?: ViewBox) {
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
    ...(contentBox ? { getActiveLayer: () => ({ getBBox: () => contentBox }) } : {}),
  } as unknown as Canvas;

  const grid = new EvolutionGrid(undefined as unknown as Canvas);
  new PanConstraint(eventBus, canvas, grid);
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
});
