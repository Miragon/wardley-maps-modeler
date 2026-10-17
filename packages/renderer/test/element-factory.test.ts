import { describe, it, expect } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import EvolutionGrid from '../src/evolution-grid/EvolutionGrid.js';
import WardleyElementFactory, { nextFreeLabel } from '../src/model/WardleyElementFactory.js';

interface ExistingElement {
  id?: string;
  wardleyType?: string;
  wardleyLabel?: string;
  annotationNumber?: number;
}

/** Factory with mocked ElementFactory/Registry (createShape returns the attributes). */
function factoryWith(existing: ExistingElement[]): WardleyElementFactory {
  const elementFactory = {
    createShape: (attrs: Record<string, unknown>) => attrs,
    createConnection: (attrs: Record<string, unknown>) => attrs,
  } as unknown as ElementFactory;
  const grid = new EvolutionGrid(undefined as unknown as Canvas);
  const registry = { getAll: () => existing } as unknown as ElementRegistry;
  return new WardleyElementFactory(elementFactory, grid, registry);
}

/** Factory whose registry holds components with the given labels. */
function factory(existingLabels: string[]): WardleyElementFactory {
  return factoryWith(
    existingLabels.map((wardleyLabel) => ({ wardleyType: 'component', wardleyLabel })),
  );
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

  it('applies to every linkable type (anchor, submap, pipeline, accelerator)', () => {
    const f = factory(['User', 'Submap', 'Pipeline', 'Accelerate']);
    expect(f.createNew('anchor', 'User').wardleyLabel).toBe('User 2');
    expect(f.createNew('submap', 'Submap').wardleyLabel).toBe('Submap 2');
    expect(f.createNew('pipeline', 'Pipeline').wardleyLabel).toBe('Pipeline 2');
    expect(f.createNew('accelerator', 'Accelerate').wardleyLabel).toBe('Accelerate 2');
  });

  // Notes are never edge endpoints, so repeating their text is harmless.
  it('does not suffix notes', () => {
    const f = factoryWith([{ wardleyType: 'note', wardleyLabel: 'Note' }]);
    expect(f.createNew('note', 'Note').wardleyLabel).toBe('Note');
  });

  it('ignores notes and regions when checking a linkable label', () => {
    const f = factoryWith([
      { wardleyType: 'note', wardleyLabel: 'Component' },
      { wardleyType: 'attitude', wardleyLabel: 'Pioneers' },
    ]);
    expect(f.createNew('component', 'Component').wardleyLabel).toBe('Component');
    expect(f.uniqueLabel('Pioneers')).toBe('Pioneers');
  });

  // OWM regions are unlabelled: the title is the canonical kind, never "Pioneers 2".
  it('labels palette-created regions with their kind, without suffix', () => {
    const f = factoryWith([{ wardleyType: 'attitude', wardleyLabel: 'pioneers' }]);
    expect(f.createNew('attitude', 'Pioneers', { attitudeKind: 'pioneers' }).wardleyLabel).toBe(
      'pioneers',
    );
    expect(
      f.createNew('attitude', 'Town Planners', { attitudeKind: 'townplanners' }).wardleyLabel,
    ).toBe('townplanners');
  });

  it('continues an existing counter instead of stacking a second one', () => {
    expect(factory(['Cup', 'Cup 2']).uniqueLabel('Cup 2')).toBe('Cup 3');
    expect(factory(['Cup 5', 'Cup 6']).uniqueLabel('Cup 5')).toBe('Cup 7');
  });

  it('uniqueLabel excludes the element being renamed itself (rename to its own name)', () => {
    const f = factory([]);
    const registry = {
      getAll: () => [
        { id: 'cmp_kettle', wardleyType: 'component', wardleyLabel: 'Kettle' },
        { id: 'cmp_power', wardleyType: 'component', wardleyLabel: 'Power' },
      ],
    };
    Object.assign(f, { elementRegistry: registry });
    expect(f.uniqueLabel('Kettle', 'cmp_kettle')).toBe('Kettle');
    expect(f.uniqueLabel('Power', 'cmp_kettle')).toBe('Power 2');
  });
});

describe('nextFreeLabel', () => {
  it('returns the base when it is free', () => {
    expect(nextFreeLabel('Tea', new Set(['Cup']))).toBe('Tea');
  });

  it('counts up from 2 for a base without counter', () => {
    expect(nextFreeLabel('Tea', new Set(['Tea', 'Tea 2']))).toBe('Tea 3');
  });

  it('continues the counter of a numbered base', () => {
    expect(nextFreeLabel('Cup 2', new Set(['Cup 2']))).toBe('Cup 3');
    expect(nextFreeLabel('Cup 2', new Set(['Cup 2', 'Cup 3']))).toBe('Cup 4');
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
