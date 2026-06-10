import { describe, it, expect } from 'vitest';
import {
  evolutionStage,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_STAGE_BOUNDARIES,
  DEFAULT_EVOLUTION_LABELS,
  EVOLUTION_PRESETS,
  loadMap,
  serializeMap,
  parseMapJSON,
  validateMap,
  createEmptyMap,
  type WardleyMap,
} from '../src/index.js';

describe('EVOLUTION_PRESETS (Landscape-Cheat-Sheet)', () => {
  it('the first preset (Activities) matches the default', () => {
    expect(EVOLUTION_PRESETS[0]?.id).toBe('activities');
    expect(EVOLUTION_PRESETS[0]?.labels).toEqual(DEFAULT_EVOLUTION_LABELS);
  });

  it('each preset has exactly four stage labels and a unique id', () => {
    for (const p of EVOLUTION_PRESETS) {
      expect(p.labels).toHaveLength(4);
      expect(p.labels.every((l) => l.length > 0)).toBe(true);
    }
    const ids = EVOLUTION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains the classic Landscape variants', () => {
    const ids = EVOLUTION_PRESETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['activities', 'practices', 'data', 'knowledge']));
  });
});

describe('evolutionStage', () => {
  it('maps the four stages correctly', () => {
    expect(evolutionStage(0.0)).toBe(0);
    expect(evolutionStage(0.16)).toBe(0);
    expect(evolutionStage(0.17)).toBe(1);
    expect(evolutionStage(0.39)).toBe(1);
    expect(evolutionStage(0.4)).toBe(2);
    expect(evolutionStage(0.69)).toBe(2);
    expect(evolutionStage(0.7)).toBe(3);
    expect(evolutionStage(1.0)).toBe(3);
  });

  it('respects custom boundaries', () => {
    expect(evolutionStage(0.5, [0.6, 0.7, 0.8])).toBe(0);
    expect(DEFAULT_STAGE_BOUNDARIES).toEqual([0.17, 0.4, 0.7]);
  });
});

const sample: WardleyMap = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
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

describe('Serialization', () => {
  it('is deterministic: elements sorted by id, keys stable, coordinates rounded', () => {
    const out = serializeMap(sample);
    expect(out.indexOf('anchor_1')).toBeLessThan(out.indexOf('cmp_kettle'));
    expect(serializeMap(parseMapJSON(out))).toBe(out);
  });

  it('rounds coordinates to 3 decimal places', () => {
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

describe('Validation', () => {
  it('accepts an empty map', () => {
    expect(() => validateMap(createEmptyMap())).not.toThrow();
  });

  it('rejects edges with an unknown endpoint', () => {
    const bad = {
      ...sample,
      edges: [{ id: 'x', edgeType: 'dependency', from: 'ghost', to: 'cmp_kettle' }],
    };
    expect(() => loadMap(bad)).toThrow(/references no element/);
  });

  it('rejects coordinates outside [0,1]', () => {
    const bad = {
      ...sample,
      elements: [{ ...sample.elements[0]!, position: { visibility: 1.5, evolution: 0.5 } }],
    };
    expect(() => loadMap(bad)).toThrow();
  });

  it('rejects an unknown higher schemaVersion', () => {
    expect(() => loadMap({ ...sample, schemaVersion: 99 })).toThrow(/schemaVersion/);
  });

  it('rejects edge IDs that collide with element IDs (shared namespace)', () => {
    const bad = {
      ...sample,
      edges: [{ id: 'cmp_kettle', edgeType: 'dependency', from: 'anchor_1', to: 'cmp_kettle' }],
    };
    expect(() => loadMap(bad)).toThrow(/collides/);
  });

  it('rejects unsorted stageBoundaries', () => {
    const bad = { ...sample, config: { ...sample.config, stageBoundaries: [0.7, 0.4, 0.17] } };
    expect(() => loadMap(bad)).toThrow(/ascending/);
  });

  it('accepts an attitude with a normalized corner2', () => {
    const map = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'attitude_pioneers',
          elementType: 'attitude',
          kind: 'pioneers',
          label: '',
          position: { visibility: 0.9, evolution: 0.1 },
          corner2: { visibility: 0.7, evolution: 0.3 },
        },
      ],
    };
    expect(() => loadMap(map)).not.toThrow();
  });
});
