import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Injector } from 'didi';

interface ConnectionPreviewLike {
  drawPreview(context: object, canConnect: unknown, hints: object): void;
  cleanUp(context: object): void;
}

interface LabelEditingLike {
  activate(element: object): void;
}

interface SourceShape {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CreateEvent {
  x: number;
  y: number;
  context: {
    source?: SourceShape;
    shape?: object;
    canExecute?: { connect?: unknown } | false | null;
  };
}

// diagram-js runs listeners in descending priority order; the default create.end handler (creation)
// sits at 1000 -> with < 1000 we run AFTERWARDS, once the shape already exists.
const AFTER_CREATE = 500;

/**
 * Behavior for "append component" (`create.start` with `context.source`):
 *  1. LIVE arrow preview from the source to the cursor (analogous to diagram-js ConnectPreview, but
 *     in the create flow) — requires the `connectionPreview` service (ConnectionPreviewModule).
 *  2. After creation, automatically opens the new component's label editor so it can be named
 *     (uniquely) right away.
 * Both only when `context.source` is set; ordinary palette-create stays untouched.
 */
export default class WardleyAppendBehavior {
  static $inject = ['injector', 'eventBus'];

  constructor(injector: Injector, eventBus: EventBus) {
    const connectionPreview = injector.get(
      'connectionPreview',
      false,
    ) as ConnectionPreviewLike | null;
    const labelEditing = injector.get('wardleyLabelEditing', false) as LabelEditingLike | null;

    // (1) arrow preview
    if (connectionPreview) {
      eventBus.on('create.move', (event: CreateEvent) => {
        const { context } = event;
        const source = context.source;
        if (!source) return;
        const canConnect =
          context.canExecute && (context.canExecute as { connect?: unknown }).connect;
        connectionPreview.drawPreview(context, canConnect ?? false, {
          source,
          connectionStart: { x: source.x + source.width / 2, y: source.y + source.height / 2 },
          connectionEnd: { x: event.x, y: event.y },
        });
      });

      eventBus.on(
        ['create.end', 'create.cancel', 'create.cleanup'],
        (event: { context: object }) => {
          connectionPreview.cleanUp(event.context);
        },
      );
    }

    // (2) automatically open the label editor after appending
    if (labelEditing) {
      eventBus.on('create.end', AFTER_CREATE, (event: CreateEvent) => {
        const { context } = event;
        if (!context.source || !context.canExecute || !context.shape) return;
        const shape = context.shape;
        // Activate only after render/cleanup so the editor is positioned correctly.
        setTimeout(() => labelEditing.activate(shape), 0);
      });
    }
  }
}
