import type EventBus from 'diagram-js/lib/core/EventBus';
import type { MapConfig, WardleyMap } from '@miragon/wardley-schema-model';
import type WardleyExporter from '../io/WardleyExporter.js';

/** The config fields a live preview changes: the plot size, the X-axis stage labels. */
export type PreviewedField = 'size' | 'evolutionLabels';

/**
 * Fired before a command changes the document: `preExecute` for a command, `execute` for a redo
 * (which skips `preExecute`), `revert` for an undo.
 */
export const COMMAND_START_EVENTS = [
  'commandStack.preExecute',
  'commandStack.execute',
  'commandStack.revert',
];

/** Ahead of the other listeners of these events; the command's handler runs after all of them. */
export const PUT_BACK_PRIORITY = 10_000;

/**
 * The document as it was committed while a live preview (a plot-resize drag, the size or the axis
 * labels being typed into a popover) shows something else on the canvas. A host autosaves the
 * export at any moment, also mid-drag, and must store the document, never the preview.
 */
export default class LivePreview {
  static $inject = ['eventBus', 'wardleyExporter'];

  private committed: WardleyMap | undefined;
  private readonly previewed = new Set<PreviewedField>();

  constructor(
    eventBus: EventBus,
    private readonly exporter: WardleyExporter,
  ) {
    eventBus.on(['import.render.start', 'diagram.clear'], () => this.endAll());
    // A command can land under an axis-label preview (a title a host sets) and changes the
    // document there; the preview itself only ever changes its own fields. A size preview is put
    // back before any command instead (MapResizeHandles, WardleyBaseViewer).
    eventBus.on('commandStack.changed', () => {
      if (this.committed) this.committed = this.withCommittedFields(this.exporter.export());
    });
  }

  /** Before a preview changes `field` on the canvas: keeps the document as it is now. */
  begin(field: PreviewedField): void {
    this.committed ??= this.exporter.export();
    this.previewed.add(field);
  }

  /**
   * The canvas shows the committed `field` again (its preview was put back or is being
   * committed). The preview of the other field may still be open and keeps its committed value.
   */
  end(field: PreviewedField): void {
    this.previewed.delete(field);
    if (!this.previewed.size) this.committed = undefined;
  }

  /** The committed document while a preview is open, `undefined` while none is. */
  committedMap(): WardleyMap | undefined {
    return this.committed;
  }

  private endAll(): void {
    this.previewed.clear();
    this.committed = undefined;
  }

  private withCommittedFields(live: WardleyMap): WardleyMap {
    const config: Record<string, unknown> = { ...live.config };
    const committedConfig = this.committed?.config as Partial<MapConfig> | undefined;
    for (const field of this.previewed) {
      if (committedConfig?.[field] === undefined) delete config[field];
      else config[field] = committedConfig[field];
    }
    return { ...live, config: config as unknown as MapConfig };
  }
}
