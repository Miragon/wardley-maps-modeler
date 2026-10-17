import type EventBus from 'diagram-js/lib/core/EventBus';
import type { WardleyMap } from '@miragon/wardley-schema-model';

interface Identified {
  readonly id: string;
}

/**
 * Remembers the order in which elements and edges appeared in the imported map, so the export can
 * write them back in that order. The registry/DOM order cannot serve: it is the z-order (frames,
 * connections, nodes), and exporting in it reshuffles every hand-written file on the first edit.
 */
export default class WardleySourceOrder {
  static $inject = ['eventBus'];

  private elementIndex = new Map<string, number>();
  private edgeIndex = new Map<string, number>();

  constructor(eventBus: EventBus) {
    eventBus.on('import.render.start', (event: { map: WardleyMap }) => this.remember(event.map));
    eventBus.on('diagram.clear', () => this.remember({ elements: [], edges: [] }));
  }

  remember(map: Pick<WardleyMap, 'elements' | 'edges'>): void {
    this.elementIndex = new Map(map.elements.map((element, index) => [element.id, index]));
    this.edgeIndex = new Map(map.edges.map((edge, index) => [edge.id, index]));
  }

  /** Imported elements in source order, followed by the rest in their given (creation) order. */
  sortElements<T extends Identified>(elements: readonly T[]): T[] {
    return sortBySourceIndex(elements, this.elementIndex);
  }

  /** Imported edges in source order, followed by the rest in their given (creation) order. */
  sortEdges<T extends Identified>(edges: readonly T[]): T[] {
    return sortBySourceIndex(edges, this.edgeIndex);
  }
}

function sortBySourceIndex<T extends Identified>(
  items: readonly T[],
  sourceIndex: ReadonlyMap<string, number>,
): T[] {
  const indexOf = (item: T): number => sourceIndex.get(item.id) ?? Number.POSITIVE_INFINITY;
  // Array.prototype.sort is stable, so items without a source index keep their relative order.
  return [...items].sort((a, b) => {
    const left = indexOf(a);
    const right = indexOf(b);
    return left === right ? 0 : left < right ? -1 : 1;
  });
}
