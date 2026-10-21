import type EventBus from 'diagram-js/lib/core/EventBus';
import type { MapConfig, WardleyMap } from '@miragon/wardley-schema-model';
import type WardleyExporter from '../io/WardleyExporter.js';

/** The config fields a live preview changes: the plot size, the X-axis stage labels. */
export type PreviewedField = 'size' | 'evolutionLabels';

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
    eventBus.on(['import.render.start', 'diagram.clear'], () => this.end());
    // A command that lands during a preview (a title set by the host, a key pressed mid-drag)
    // changes the document under the preview, which itself only ever changes its own fields.
    eventBus.on('commandStack.changed', () => {
      if (this.committed) this.committed = this.withCommittedFields(this.exporter.export());
    });
  }

  /** Before a preview changes `field` on the canvas: keeps the document as it is now. */
  begin(field: PreviewedField): void {
    this.committed ??= this.exporter.export();
    this.previewed.add(field);
  }

  /** The canvas shows the committed document again (the preview was put back or committed). */
  end(): void {
    this.committed = undefined;
    this.previewed.clear();
  }

  /** The committed document while a preview is open, `undefined` while none is. */
  committedMap(): WardleyMap | undefined {
    return this.committed;
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
