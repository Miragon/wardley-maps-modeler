import { wardleyMapSchema } from './schema.js';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations.js';
import type { MapConfig, WardleyMap } from './types.js';

/** Number of decimal places for coordinates in serialization (concept doc §7.1). */
const COORD_PRECISION = 3;

function round(n: number, digits = COORD_PRECISION): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Validates arbitrary data against the schema plus additional cross-field invariants
 * (unique IDs, edge endpoints exist). Throws on violation.
 */
export function validateMap(data: unknown): WardleyMap {
  const parsed = wardleyMapSchema.parse(data);

  const ids = new Set<string>();
  for (const el of parsed.elements) {
    if (ids.has(el.id)) throw new Error(`Duplicate element id: ${el.id}`);
    ids.add(el.id);
  }

  // Shared ID namespace: diagram-js' ElementRegistry has only ONE namespace for
  // shapes and connections — an edge with an element ID would crash the import midway.
  const edgeIds = new Set<string>();
  for (const edge of parsed.edges) {
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate edge id: ${edge.id}`);
    if (ids.has(edge.id)) throw new Error(`Edge id collides with element id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!ids.has(edge.from)) {
      throw new Error(`Edge ${edge.id}: source "${edge.from}" references no element.`);
    }
    if (!ids.has(edge.to)) {
      throw new Error(`Edge ${edge.id}: target "${edge.to}" references no element.`);
    }
  }

  return parsed as unknown as WardleyMap;
}

export function loadMap(data: unknown): WardleyMap {
  return validateMap(migrate(data));
}

export function parseMapJSON(json: string): WardleyMap {
  return loadMap(JSON.parse(json) as unknown);
}

/**
 * Deterministic serialization: stable (alphabetical) key order, elements/edges sorted by `id`,
 * coordinates rounded to 3 decimal places. Produces clean Git diffs and reliable change
 * detection (concept doc §7.1).
 */
export function serializeMap(map: WardleyMap): string {
  return stableStringify(canonicalize(map));
}

function canonicalize(map: WardleyMap): WardleyMap {
  const elements = [...map.elements]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((el) => roundNumbers(el) as WardleyMap['elements'][number]);
  const edges = [...map.edges].sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...map,
    config: roundNumbers(map.config) as MapConfig,
    elements,
    edges,
  };
}

function roundNumbers<T>(value: T): T {
  if (typeof value === 'number') return round(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => roundNumbers(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = roundNumbers(v);
    }
    return out as T;
  }
  return value;
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') {
      if (seen.has(v as object)) throw new Error('Cyclic reference in WardleyMap.');
      seen.add(v as object);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        out[key] = sortDeep((v as Record<string, unknown>)[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sortDeep(value), null, 2) + '\n';
}

export function createEmptyMap(title = 'Untitled Map'): WardleyMap {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    config: { title },
    elements: [],
    edges: [],
  };
}
