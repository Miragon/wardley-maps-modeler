import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import type EventBus from 'diagram-js/lib/core/EventBus';
import { isWardleyShape, isPipeline, isAttitude, type WardleyShape } from '../model/di-types.js';
import type WardleyConnectMode from '../modeling/WardleyConnectMode.js';

// Submaps are referenceable nodes on the parent map (OWM serializes their edges by name).
const CONNECTABLE: ReadonlySet<string> = new Set(['component', 'anchor', 'submap']);

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
 * Allowed editing operations (concept doc §5.4). On success the `connection.create` rule returns
 * the new connection's attributes — the connection type comes from `wardleyConnectMode`
 * (default dependency; the context pad sets 'flow' once for "Connect as flow").
 */
export default class WardleyRules extends RuleProvider {
  static override $inject = ['eventBus', 'wardleyConnectMode'];

  constructor(
    eventBus: EventBus,
    private readonly connectMode: WardleyConnectMode,
  ) {
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
      // Duplicate lines between the same endpoints are never useful (and not distinguishable
      // in the DSL) — prevent them instead of silently stacking.
      if (alreadyConnected(source, target)) return false;
      return { wardleyType: this.connectMode.current };
    });

    this.addRule(['shape.move', 'elements.move'], () => true);
    this.addRule('shape.create', () => true);
    this.addRule(
      'shape.resize',
      (context: { shape?: unknown }) => isPipeline(context.shape) || isAttitude(context.shape),
    );
  }
}
