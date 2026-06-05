import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Injector } from 'didi';

/** Minimal-Schnittstelle des diagram-js connectionPreview-Service (drawPreview/cleanUp). */
interface ConnectionPreviewLike {
  drawPreview(context: object, canConnect: unknown, hints: object): void;
  cleanUp(context: object): void;
}

/** Minimal-Schnittstelle des Inline-Label-Editors. */
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

// diagram-js fuehrt Listener absteigend nach Prioritaet aus; der Standard-create.end-Handler (Erzeugung)
// liegt bei 1000 -> mit < 1000 laufen wir DANACH, wenn die Shape bereits existiert.
const AFTER_CREATE = 500;

/**
 * Verhalten fuer „Komponente anhängen" (`create.start` mit `context.source`):
 *  1. LIVE-Pfeil-Vorschau von der Quelle zum Cursor (analog diagram-js ConnectPreview, aber im
 *     Create-Flow) — benoetigt den `connectionPreview`-Service (ConnectionPreviewModule).
 *  2. Oeffnet nach dem Anlegen automatisch den Label-Editor der neuen Komponente, sodass man sie
 *     sofort (eindeutig) benennen kann.
 * Beides nur bei gesetztem `context.source`; normales Palette-Create bleibt unberuehrt.
 */
export default class WardleyAppendBehavior {
  static $inject = ['injector', 'eventBus'];

  constructor(injector: Injector, eventBus: EventBus) {
    const connectionPreview = injector.get(
      'connectionPreview',
      false,
    ) as ConnectionPreviewLike | null;
    const labelEditing = injector.get('wardleyLabelEditing', false) as LabelEditingLike | null;

    // (1) Pfeil-Vorschau
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

    // (2) Label-Editor nach dem Anhängen automatisch öffnen
    if (labelEditing) {
      eventBus.on('create.end', AFTER_CREATE, (event: CreateEvent) => {
        const { context } = event;
        if (!context.source || !context.canExecute || !context.shape) return;
        const shape = context.shape;
        // Erst nach Render/Cleanup aktivieren, damit der Editor korrekt positioniert.
        setTimeout(() => labelEditing.activate(shape), 0);
      });
    }
  }
}
