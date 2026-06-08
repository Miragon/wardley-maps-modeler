import { describe, it, expect } from 'vitest';
import {
  createEmptyMap,
  type ComponentElement,
  type WardleyMap,
} from '@miragon/wardley-schema-model';
import { evolveComponent, setMethod, toggleInertia, setPipelineRange } from '../src/index.js';

function mapWith(...elements: WardleyMap['elements']): WardleyMap {
  return { ...createEmptyMap('T'), elements };
}

const comp: ComponentElement = {
  id: 'cmp_x',
  elementType: 'component',
  label: 'X',
  position: { visibility: 0.5, evolution: 0.3 },
};

describe('transforms', () => {
  it('evolveComponent sets movement immutably', () => {
    const before = mapWith(comp);
    const after = evolveComponent(before, 'cmp_x', 0.8, { method: 'buy' });
    expect(before.elements[0]).toBe(comp);
    const x = after.elements[0];
    expect(x?.elementType === 'component' && x.movement).toEqual({
      targetEvolution: 0.8,
      method: 'buy',
    });
  });

  it('evolveComponent rejects values outside [0,1]', () => {
    expect(() => evolveComponent(mapWith(comp), 'cmp_x', 1.4)).toThrow();
  });

  it('setMethod sets and removes the method', () => {
    const set = setMethod(mapWith(comp), 'cmp_x', 'outsource');
    const x = set.elements[0];
    expect(x?.elementType === 'component' && x.decorators?.method).toBe('outsource');
    const cleared = setMethod(set, 'cmp_x', undefined);
    const y = cleared.elements[0];
    expect(y?.elementType === 'component' && y.decorators).toBeUndefined();
  });

  it('toggleInertia toggles', () => {
    const on = toggleInertia(mapWith(comp), 'cmp_x');
    const x = on.elements[0];
    expect(x?.elementType === 'component' && x.decorators?.inertia).toBe(true);
    const off = toggleInertia(on, 'cmp_x');
    const y = off.elements[0];
    expect(y?.elementType === 'component' && y.decorators).toBeUndefined();
  });

  it('setPipelineRange validates the range', () => {
    const pipe: WardleyMap['elements'][number] = {
      id: 'pipe_1',
      elementType: 'pipeline',
      label: 'P',
      position: { visibility: 0.5, evolution: 0.5 },
      evolutionStart: 0.2,
      evolutionEnd: 0.6,
      childIds: [],
    };
    const out = setPipelineRange(mapWith(pipe), 'pipe_1', 0.1, 0.9);
    const p = out.elements[0];
    expect(p?.elementType === 'pipeline' && p.evolutionEnd).toBe(0.9);
    expect(() => setPipelineRange(mapWith(pipe), 'pipe_1', 0.9, 0.1)).toThrow();
  });
});
