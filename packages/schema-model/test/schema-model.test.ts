import { describe, it, expect } from 'vitest';
import {
  evolutionStage,
  DEFAULT_STAGE_BOUNDARIES,
  loadMap,
  serializeMap,
  parseMapJSON,
  validateMap,
  createEmptyMap,
  type WardleyMap,
} from '../src/index.js';

describe('evolutionStage', () => {
  it('ordnet die vier Stages korrekt zu', () => {
    expect(evolutionStage(0.0)).toBe(0);
    expect(evolutionStage(0.16)).toBe(0);
    expect(evolutionStage(0.17)).toBe(1);
    expect(evolutionStage(0.39)).toBe(1);
    expect(evolutionStage(0.4)).toBe(2);
    expect(evolutionStage(0.69)).toBe(2);
    expect(evolutionStage(0.7)).toBe(3);
    expect(evolutionStage(1.0)).toBe(3);
  });

  it('respektiert eigene Grenzen', () => {
    expect(evolutionStage(0.5, [0.6, 0.7, 0.8])).toBe(0);
    expect(DEFAULT_STAGE_BOUNDARIES).toEqual([0.17, 0.4, 0.7]);
  });
});

const sample: WardleyMap = {
  schemaVersion: 1,
  config: { title: 'Tea Shop', style: 'wardley' },
  elements: [
    {
      id: 'cmp_kettle',
      elementType: 'component',
      label: 'Kettle',
      position: { visibility: 0.43, evolution: 0.35 },
    },
    {
      id: 'anchor_1',
      elementType: 'anchor',
      label: 'User',
      position: { visibility: 0.95, evolution: 0.63 },
    },
  ],
  edges: [{ id: 'dep_1', edgeType: 'dependency', from: 'anchor_1', to: 'cmp_kettle' }],
};

describe('Serialisierung', () => {
  it('ist deterministisch: Elemente nach id sortiert, Keys stabil, Koordinaten gerundet', () => {
    const out = serializeMap(sample);
    expect(out.indexOf('anchor_1')).toBeLessThan(out.indexOf('cmp_kettle'));
    // round-trip ist stabil
    expect(serializeMap(parseMapJSON(out))).toBe(out);
  });

  it('rundet Koordinaten auf 3 Nachkommastellen', () => {
    const noisy = {
      ...sample,
      elements: [
        { ...sample.elements[0]!, position: { visibility: 0.123456, evolution: 0.987654 } },
      ],
    };
    expect(serializeMap(noisy as WardleyMap)).toContain('0.123');
    expect(serializeMap(noisy as WardleyMap)).toContain('0.988');
  });
});

describe('Validierung', () => {
  it('akzeptiert eine leere Map', () => {
    expect(() => validateMap(createEmptyMap())).not.toThrow();
  });

  it('weist Edges mit unbekanntem Endpunkt ab', () => {
    const bad = {
      ...sample,
      edges: [{ id: 'x', edgeType: 'dependency', from: 'ghost', to: 'cmp_kettle' }],
    };
    expect(() => loadMap(bad)).toThrow(/referenziert kein Element/);
  });

  it('weist Koordinaten ausserhalb [0,1] ab', () => {
    const bad = {
      ...sample,
      elements: [{ ...sample.elements[0]!, position: { visibility: 1.5, evolution: 0.5 } }],
    };
    expect(() => loadMap(bad)).toThrow();
  });

  it('weist unbekannte hoehere schemaVersion ab', () => {
    expect(() => loadMap({ ...sample, schemaVersion: 99 })).toThrow(/schemaVersion/);
  });
});
