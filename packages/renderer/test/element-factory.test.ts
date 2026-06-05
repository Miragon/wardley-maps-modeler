import { describe, it, expect } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import EvolutionGrid from '../src/evolution-grid/EvolutionGrid.js';
import WardleyElementFactory from '../src/model/WardleyElementFactory.js';

/** Factory mit gemocktem ElementFactory/Registry (createShape gibt die Attribute zurueck). */
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

describe('WardleyElementFactory.createNew: eindeutige Labels', () => {
  // Regression: doppelte Labels fuehren beim DSL-Round-Trip zu ID-Kollisionen und verlieren Kanten.
  it('vergibt das Basis-Label, wenn frei', () => {
    expect(factory([]).createNew('component', 'Komponente').wardleyLabel).toBe('Komponente');
  });

  it('haengt einen Zaehler an, wenn das Label belegt ist', () => {
    expect(factory(['Komponente']).createNew('component', 'Komponente').wardleyLabel).toBe(
      'Komponente 2',
    );
    expect(
      factory(['Komponente', 'Komponente 2']).createNew('component', 'Komponente').wardleyLabel,
    ).toBe('Komponente 3');
  });

  it('gilt auch fuer andere Typen (z. B. Notiz)', () => {
    expect(factory(['Notiz']).createNew('note', 'Notiz').wardleyLabel).toBe('Notiz 2');
  });
});
