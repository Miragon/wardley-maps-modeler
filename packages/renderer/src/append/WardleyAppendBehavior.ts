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
    shape?: { wardleyType?: unknown };
    elements?: readonly object[];
    canExecute?: { connect?: unknown } | false | null;
    /** Set by WardleyCopyPaste: pasted copies keep their names, no editor. */
    wardleyPaste?: boolean;
  };
}

/** Types that carry a visible name — placing one goes straight into naming it. */
const NAMED_TYPES: ReadonlySet<unknown> = new Set([
  'component',
  'anchor',
  'submap',
  'pipeline',
  'accelerator',
  'note',
]);

// diagram-js runs listeners in descending priority order; the default create.end handler (creation)
// sits at 1000 -> with < 1000 we run AFTERWARDS, once the shape already exists.
const AFTER_CREATE = 500;

/**
 * Create behavior for palette, keyboard and "append component" (`create.start`, the latter with
 * `context.source`):
 *  1. Append only: LIVE arrow preview from the source to the cursor (analogous to diagram-js
 *     ConnectPreview, but in the create flow) — requires the `connectionPreview` service.
 *  2. After placing a single named element (component, user, submap, pipeline, accelerator, note)
 *     the label editor opens with the placeholder selected, so typing names it right away.
 *     Regions, drawings and pasted copies are left alone.
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

    // (2) automatically open the label editor after placing a named element
    if (labelEditing) {
      eventBus.on('create.end', AFTER_CREATE, (event: CreateEvent) => {
        const { context } = event;
        const shape = context.shape;
        if (!context.canExecute || !shape || context.wardleyPaste) return;
        if ((context.elements?.length ?? 1) !== 1 || !NAMED_TYPES.has(shape.wardleyType)) return;
        // Activate only after render/cleanup so the editor is positioned correctly.
        setTimeout(() => labelEditing.activate(shape), 0);
      });
    }
  }
}
