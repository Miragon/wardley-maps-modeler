import OrderingProvider from 'diagram-js/lib/features/ordering/OrderingProvider';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ElementLike, ShapeLike } from 'diagram-js/lib/model/Types';
import { isWardleyConnection, isWardleyShape, type WardleyShape } from '../model/di-types.js';

/** Frame types sit at the very back (concept doc: frames -> connections -> nodes). */
function isFrame(el: unknown): boolean {
  return (
    isWardleyShape(el) &&
    ((el as WardleyShape).wardleyType === 'attitude' ||
      (el as WardleyShape).wardleyType === 'pipeline')
  );
}

/**
 * Keeps the z-order stable for INTERACTIVELY created/moved elements, matching the import order:
 * frames (attitude/pipeline) at the back, connections in the middle, nodes on top. Without this,
 * connections drawn in the editor would land above the nodes (unlike imported ones).
 */
export default class WardleyOrderingProvider extends OrderingProvider {
  static override $inject = ['eventBus'];

  constructor(eventBus: EventBus) {
    super(eventBus);
  }

  override getOrdering(
    element: ElementLike,
    newParent: ShapeLike,
  ): { parent: ShapeLike; index?: number } {
    const siblings = (newParent.children ?? []) as ElementLike[];
    if (isWardleyConnection(element)) {
      // Behind the nodes: after all frames and existing connections.
      const index = siblings.filter(
        (c) => c !== element && (isFrame(c) || isWardleyConnection(c)),
      ).length;
      return { parent: newParent, index };
    }
    if (isFrame(element)) {
      // All the way to the back (after the other frames).
      const index = siblings.filter((c) => c !== element && isFrame(c)).length;
      return { parent: newParent, index };
    }
    // Nodes: on top (append).
    return { parent: newParent };
  }
}
