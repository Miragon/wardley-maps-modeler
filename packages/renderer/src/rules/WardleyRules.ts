import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import type EventBus from 'diagram-js/lib/core/EventBus';
import { isWardleyShape, isPipeline, type WardleyShape } from '../model/di-types.js';

const CONNECTABLE: ReadonlySet<string> = new Set(['component', 'anchor']);

function isConnectable(el: unknown): el is WardleyShape {
  return isWardleyShape(el) && CONNECTABLE.has(el.wardleyType);
}

/**
 * Allowed editing operations (concept doc §5.4). On success the `connection.create` rule returns
 * the new connection's attributes (`{ wardleyType: 'dependency' }`) — diagram-js Connect adopts
 * them as connection attributes.
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
      return { wardleyType: 'dependency' };
    });

    this.addRule(['shape.move', 'elements.move'], () => true);
    this.addRule('shape.create', () => true);
    this.addRule('shape.resize', (context: { shape?: unknown }) => isPipeline(context.shape));
  }
}
