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
});
