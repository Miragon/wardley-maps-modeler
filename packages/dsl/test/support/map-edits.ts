import type { MapEdge, MapElement, WardleyMap } from '@miragon/wardley-schema-model';
import { parseDSL } from '../../src/index.js';

/** Line-level difference between two texts (longest common subsequence). */
export function lineDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const common: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i]![j] =
        a[i] === b[j]
          ? common[i + 1]![j + 1]! + 1
          : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
    }
  }
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (common[i + 1]![j]! >= common[i]![j + 1]!) removed.push(a[i++]!);
    else added.push(b[j++]!);
  }
  return { removed: [...removed, ...a.slice(i)], added: [...added, ...b.slice(j)] };
}

export function elementNamed(map: WardleyMap, label: string): MapElement {
  const found = map.elements.find((el) => el.label === label);
  if (!found) throw new Error(`No element "${label}"`);
  return found;
}

export function withElement(
  map: WardleyMap,
  label: string,
  change: (el: MapElement) => MapElement,
): WardleyMap {
  const target = elementNamed(map, label);
  return { ...map, elements: map.elements.map((el) => (el === target ? change(el) : el)) };
}

export function moveTo(
  map: WardleyMap,
  label: string,
  position: { visibility: number; evolution: number },
): WardleyMap {
  return withElement(map, label, (el) => ({ ...el, position }) as MapElement);
}

export function rename(map: WardleyMap, label: string, newLabel: string): WardleyMap {
  return withElement(map, label, (el) => ({ ...el, label: newLabel }) as MapElement);
}

/** Deletes an element the way the modeler does: its edges go with it, its children stay behind. */
export function deleteElement(map: WardleyMap, label: string): WardleyMap {
  const target = elementNamed(map, label);
  const elements = map.elements
    .filter((el) => el !== target)
    .map((el): MapElement => {
      if (el.elementType === 'component' && el.pipelineId === target.id) {
        const { pipelineId: _removed, ...rest } = el;
        return rest;
      }
      if (el.elementType === 'pipeline') {
        return { ...el, childIds: el.childIds.filter((id) => id !== target.id) };
      }
      return el;
    });
  const edges = map.edges.filter((edge) => edge.from !== target.id && edge.to !== target.id);
  return { ...map, elements, edges };
}

export function addElements(map: WardleyMap, ...elements: MapElement[]): WardleyMap {
  return { ...map, elements: [...map.elements, ...elements] };
}

export function addEdges(map: WardleyMap, ...edges: MapEdge[]): WardleyMap {
  return { ...map, edges: [...map.edges, ...edges] };
}

export function link(map: WardleyMap, id: string, from: string, to: string): MapEdge {
  return {
    id,
    edgeType: 'dependency',
    from: elementNamed(map, from).id,
    to: elementNamed(map, to).id,
  };
}

export function component(
  id: string,
  label: string,
  visibility: number,
  evolution: number,
): MapElement {
  return { id, elementType: 'component', label, position: { visibility, evolution } };
}

const RENDERER_TYPE_ORDER = ['attitude', 'pipeline', 'note', 'component', 'anchor', 'annotation'];

/** The element order the modeler exports: grouped by drawing layer, not by source line. */
export function inRendererOrder(map: WardleyMap): WardleyMap {
  const rank = (el: MapElement) => {
    const index = RENDERER_TYPE_ORDER.indexOf(el.elementType);
    return index < 0 ? RENDERER_TYPE_ORDER.length : index;
  };
  return { ...map, elements: [...map.elements].sort((a, b) => rank(a) - rank(b)) };
}

export function parsed(text: string): WardleyMap {
  return parseDSL(text);
}
