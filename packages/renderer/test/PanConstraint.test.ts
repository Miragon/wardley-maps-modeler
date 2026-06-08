// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import EvolutionGrid from '../src/evolution-grid/EvolutionGrid.js';
import PanConstraint from '../src/pan-constraint/PanConstraint.js';

type ViewBox = { x: number; y: number; width: number; height: number };

function setup(initial: ViewBox) {
  let handler: ((e: { viewbox?: ViewBox }) => void) | undefined;
  const eventBus = {
    on: (_event: string, cb: (e: { viewbox?: ViewBox }) => void) => {
      handler = cb;
    },
  } as unknown as EventBus;

  let current = initial;
  const setCalls: ViewBox[] = [];
  const canvas = {
    viewbox: (box?: ViewBox) => {
      if (box) {
        setCalls.push(box);
        current = box;
        handler?.({ viewbox: box });
        return box;
      }
      return current;
    },
  } as unknown as Canvas;

  const grid = new EvolutionGrid(undefined as unknown as Canvas);
  new PanConstraint(eventBus, canvas, grid);
  return { fire: (vb: ViewBox) => handler?.({ viewbox: vb }), setCalls };
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
});
