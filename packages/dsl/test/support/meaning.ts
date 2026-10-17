import type { WardleyMap } from '@miragon/wardley-schema-model';
import { parseDSL } from '../../src/index.js';

function rounded(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(rounded);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
    entries.sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, entry]) => [key, rounded(entry)]));
  }
  return value;
}

/**
 * What a map text means, without the ids the parser derives from names and order and without
 * statement order: elements and edges point at each other by type and label.
 */
export function meaningOf(text: string): string[] {
  const map: WardleyMap = parseDSL(text);
  const byId = new Map(map.elements.map((el) => [el.id, el]));
  const name = (id: string | undefined) => {
    const el = id === undefined ? undefined : byId.get(id);
    return el ? `${el.elementType} ${el.label}` : String(id);
  };
  const lines = [`config ${JSON.stringify(rounded(map.config))}`];
  for (const el of map.elements) {
    const { id: _id, ...rest } = el;
    const described: Record<string, unknown> = { ...rest };
    if ('pipelineId' in el) described['pipelineId'] = name(el.pipelineId);
    if ('childIds' in el) described['childIds'] = el.childIds.map(name).sort();
    lines.push(`element ${JSON.stringify(rounded(described))}`);
  }
  for (const edge of map.edges) {
    const { id: _id, ...rest } = edge;
    lines.push(
      `edge ${JSON.stringify(rounded({ ...rest, from: name(edge.from), to: name(edge.to) }))}`,
    );
  }
  for (const raw of map.rawPassthrough ?? []) lines.push(`raw ${raw}`);
  return lines.sort();
}
