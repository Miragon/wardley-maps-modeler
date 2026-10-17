import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import type EventBus from 'diagram-js/lib/core/EventBus';
import { isWardleyShape, isPipeline, isAttitude, type WardleyShape } from '../model/di-types.js';

// Submaps are referenceable nodes on the parent map (OWM serializes their edges by name);
// pipelines connect via their ■ anchor.
const CONNECTABLE: ReadonlySet<string> = new Set(['component', 'anchor', 'submap', 'pipeline']);

const HORIZONTAL_RESIZE_DIRECTIONS: ReadonlySet<string> = new Set(['e', 'w']);

function isConnectable(el: unknown): el is WardleyShape {
  return isWardleyShape(el) && CONNECTABLE.has(el.wardleyType);
}

/** Is there already a connection between the two shapes (in either direction)? */
function alreadyConnected(source: WardleyShape, target: WardleyShape): boolean {
  return (
    (source.outgoing ?? []).some((c) => c.target === (target as unknown)) ||
    (source.incoming ?? []).some((c) => c.source === (target as unknown))
  );
}

/**
 * Allowed edit operations (concept doc §5.4). On success the `connection.create` rule returns
 * the new connection's attributes. The editor deliberately only creates dependencies — flow
 * links (`+>`) exist for OWM import compatibility but are not authored interactively.
 */
export default class WardleyRules extends RuleProvider {
  static override $inject = ['eventBus'];

  constructor(eventBus: EventBus) {
    super(eventBus);
  }

  override init(): void {
    this.addRule('connection.start', (context: { source?: unknown }) =>
      isConnectable(context.source),
    );

    this.addRule('connection.create', (context: { source?: unknown; target?: unknown }) => {
      const { source, target } = context;
      if (!isConnectable(source) || !isConnectable(target)) return false;
      if (source === target) return false;
      // Duplicate lines between the same endpoints are never meaningful (and indistinguishable
      // in the DSL) — prevent them instead of silently stacking.
      if (alreadyConnected(source, target)) return false;
      return { wardleyType: 'dependency' };
    });

    this.addRule('shape.move', () => true);
    // Shapes never nest: hovering another element during a drag must neither re-parent the moved
    // shapes under it nor mark it as a drop target, so such hovers are ignored (null), not refused.
    this.addRule('elements.move', (context: { target?: { parent?: unknown } | null }) =>
      context.target?.parent ? null : true,
    );
    this.addRule('shape.create', () => true);
    // Group create (paste preview): diagram-js Create checks this rule for element arrays.
    this.addRule('elements.create', () => true);
    // Pipelines only stretch along the evolution axis — their height is not part of the model.
    this.addRule('shape.resize', (context: { shape?: unknown; direction?: string }) => {
      if (isPipeline(context.shape)) {
        return !context.direction || HORIZONTAL_RESIZE_DIRECTIONS.has(context.direction);
      }
      return isAttitude(context.shape);
    });
  }
}
