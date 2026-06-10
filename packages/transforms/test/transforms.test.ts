import { describe, it, expect } from 'vitest';
import {
  createEmptyMap,
  type ComponentElement,
  type PipelineElement,
  type WardleyMap,
} from '@miragon/wardley-schema-model';
import {
  evolveComponent,
  setMethod,
  toggleInertia,
  setPipelineRange,
  assignToPipeline,
  removeFromPipeline,
  recomputePipelineRange,
} from '../src/index.js';

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

  describe('pipeline membership', () => {
    const pipe: PipelineElement = {
      id: 'pipe_1',
      elementType: 'pipeline',
      label: 'P',
      position: { visibility: 0.7, evolution: 0.5 },
      evolutionStart: 0.2,
      evolutionEnd: 0.6,
      childIds: [],
    };

    it('assignToPipeline sets pipelineId, inherits visibility and maintains childIds', () => {
      const out = assignToPipeline(mapWith(pipe, comp), 'cmp_x', 'pipe_1');
      const c = out.elements.find((e) => e.id === 'cmp_x');
      expect(c?.elementType === 'component' && c.pipelineId).toBe('pipe_1');
      expect(c?.position.visibility).toBe(0.7);
      const p = out.elements.find((e) => e.id === 'pipe_1');
      expect(p?.elementType === 'pipeline' && p.childIds).toEqual(['cmp_x']);
    });

    it('removeFromPipeline clears the membership including childIds', () => {
      const assigned = assignToPipeline(mapWith(pipe, comp), 'cmp_x', 'pipe_1');
      const out = removeFromPipeline(assigned, 'cmp_x');
      const c = out.elements.find((e) => e.id === 'cmp_x');
      expect(c?.elementType === 'component' && c.pipelineId).toBeUndefined();
      const p = out.elements.find((e) => e.id === 'pipe_1');
      expect(p?.elementType === 'pipeline' && p.childIds).toEqual([]);
    });

    it('recomputePipelineRange derives the range from the child maturities', () => {
      const child2: ComponentElement = {
        id: 'cmp_y',
        elementType: 'component',
        label: 'Y',
        position: { visibility: 0.7, evolution: 0.85 },
      };
      let map = assignToPipeline(mapWith(pipe, comp, child2), 'cmp_x', 'pipe_1');
      map = assignToPipeline(map, 'cmp_y', 'pipe_1');
      const out = recomputePipelineRange(map, 'pipe_1');
      const p = out.elements.find((e) => e.id === 'pipe_1');
      expect(p?.elementType === 'pipeline' && p.evolutionStart).toBe(0.3);
      expect(p?.elementType === 'pipeline' && p.evolutionEnd).toBe(0.85);
    });
  });
});
