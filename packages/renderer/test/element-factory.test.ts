import { describe, it, expect } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import EvolutionGrid from '../src/evolution-grid/EvolutionGrid.js';
import WardleyElementFactory from '../src/model/WardleyElementFactory.js';

/** Factory with mocked ElementFactory/Registry (createShape returns the attributes). */
function factory(existingLabels: string[]): WardleyElementFactory {
  const elementFactory = {
    createShape: (attrs: Record<string, unknown>) => attrs,
    createConnection: (attrs: Record<string, unknown>) => attrs,
  } as unknown as ElementFactory;
  const grid = new EvolutionGrid(undefined as unknown as Canvas);
  const registry = {
    getAll: () => existingLabels.map((wardleyLabel) => ({ wardleyLabel })),
  } as unknown as ElementRegistry;
  return new WardleyElementFactory(elementFactory, grid, registry);
}

describe('WardleyElementFactory.createNew: unique labels', () => {
  // Regression: duplicate labels cause ID collisions on the DSL round-trip and lose edges.
  it('assigns the base label when free', () => {
    expect(factory([]).createNew('component', 'Component').wardleyLabel).toBe('Component');
  });

  it('appends a counter when the label is taken', () => {
    expect(factory(['Component']).createNew('component', 'Component').wardleyLabel).toBe(
      'Component 2',
    );
    expect(
      factory(['Component', 'Component 2']).createNew('component', 'Component').wardleyLabel,
    ).toBe('Component 3');
  });

  it('applies to other types as well (e.g. note)', () => {
    expect(factory(['Note']).createNew('note', 'Note').wardleyLabel).toBe('Note 2');
  });

  it('uniqueLabel excludes the element being renamed itself (rename to its own name)', () => {
    const f = factory([]);
    const registry = {
      getAll: () => [
        { id: 'cmp_kettle', wardleyLabel: 'Kettle' },
        { id: 'cmp_power', wardleyLabel: 'Power' },
      ],
    };
    Object.assign(f, { elementRegistry: registry });
    expect(f.uniqueLabel('Kettle', 'cmp_kettle')).toBe('Kettle');
    expect(f.uniqueLabel('Power', 'cmp_kettle')).toBe('Power 2');
  });
});

describe('WardleyElementFactory.createNew: annotation auto-numbering', () => {
  // Regression: a fixed number 1 produced duplicates from the second annotation onwards.
  it('assigns the next free number (max + 1)', () => {
    const f = factory([]);
    const registry = {
      getAll: () => [{ wardleyLabel: 'A', annotationNumber: 1 }, { annotationNumber: 4 }],
    };
    Object.assign(f, { elementRegistry: registry });
    expect(f.createNew('annotation', 'Annotation').annotationNumber).toBe(5);
  });

  it('starts at 1 on an empty map', () => {
    expect(factory([]).createNew('annotation', 'Annotation').annotationNumber).toBe(1);
  });
});

describe('WardleyElementFactory.createAttitude: corner2 (normalized)', () => {
  it('computes the pixel box from both corners', () => {
    const f = factory([]);
    const shape = f.createAttitude({
      id: 'attitude_pioneers',
      elementType: 'attitude',
      kind: 'pioneers',
      label: '',
      position: { visibility: 0.9, evolution: 0.1 },
      corner2: { visibility: 0.7, evolution: 0.3 },
    });
    const grid = new EvolutionGrid(undefined as unknown as Canvas);
    const tl = grid.toCanvas({ visibility: 0.9, evolution: 0.1 });
    const br = grid.toCanvas({ visibility: 0.7, evolution: 0.3 });
    expect(shape.x).toBeCloseTo(tl.x, 6);
    expect(shape.y).toBeCloseTo(tl.y, 6);
    expect(shape.width).toBeCloseTo(br.x - tl.x, 6);
    expect(shape.height).toBeCloseTo(br.y - tl.y, 6);
    expect(shape.corner2).toEqual({ visibility: 0.7, evolution: 0.3 });
  });
});
