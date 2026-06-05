import { wardleyMapSchema } from './schema.js';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations.js';
import type { MapConfig, WardleyMap } from './types.js';

/** Anzahl Nachkommastellen fuer Koordinaten in der Serialisierung (Konzept §7.1). */
const COORD_PRECISION = 3;

function round(n: number, digits = COORD_PRECISION): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Validiert beliebige Daten gegen das Schema und ergaenzende Kreuzfeld-Invarianten
 * (eindeutige IDs, Edge-Endpunkte existieren). Wirft bei Verstoss.
 */
export function validateMap(data: unknown): WardleyMap {
  const parsed = wardleyMapSchema.parse(data);

  const ids = new Set<string>();
  for (const el of parsed.elements) {
    if (ids.has(el.id)) throw new Error(`Doppelte Element-ID: ${el.id}`);
    ids.add(el.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of parsed.edges) {
    if (edgeIds.has(edge.id)) throw new Error(`Doppelte Edge-ID: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!ids.has(edge.from)) {
      throw new Error(`Edge ${edge.id}: Quelle "${edge.from}" referenziert kein Element.`);
    }
    if (!ids.has(edge.to)) {
      throw new Error(`Edge ${edge.id}: Ziel "${edge.to}" referenziert kein Element.`);
    }
  }

  return parsed as unknown as WardleyMap;
}

/** Liest ein (ggf. aelteres) Map-Objekt: migriert -> validiert. */
export function loadMap(data: unknown): WardleyMap {
  return validateMap(migrate(data));
}

/** Liest eine JSON-Zeichenkette in ein validiertes WardleyMap. */
export function parseMapJSON(json: string): WardleyMap {
  return loadMap(JSON.parse(json) as unknown);
}

/**
 * Deterministische Serialisierung: stabile (alphabetische) Key-Reihenfolge, Elemente/Edges
 * nach `id` sortiert, Koordinaten auf 3 Nachkommastellen gerundet. Erzeugt saubere Git-Diffs
 * und zuverlaessige Aenderungserkennung (Konzept §7.1).
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

/** Tiefes Runden aller Zahlen (Koordinaten); Strukturen bleiben erhalten. */
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

/** JSON.stringify mit rekursiv sortierten Object-Keys (stabile Ausgabe). */
function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') {
      if (seen.has(v as object)) throw new Error('Zyklische Referenz in WardleyMap.');
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

/** Erzeugt eine leere, gueltige Map. */
export function createEmptyMap(title = 'Untitled Map'): WardleyMap {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    config: { title },
    elements: [],
    edges: [],
  };
}
