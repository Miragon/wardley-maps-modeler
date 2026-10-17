import Diagram from 'diagram-js/lib/Diagram';
import type { ModuleDeclaration } from 'didi';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import type { Root } from 'diagram-js/lib/model/Types';
import {
  DEFAULT_MAP_TITLE,
  normalizeEvolutionLabels,
  normalizeMapSize,
  sameEvolutionLabels,
  presetIdForSize,
  type MapConfig,
  type MapSizePresetId,
  type WardleyMap,
} from '@miragon/wardley-schema-model';
import { parseDSLWithDiagnostics, serializeDSL } from '@miragon/wardley-dsl';
import { saveSVG } from './io/saveSvg.js';
import { exportBounds } from './io/exportBounds.js';
import type WardleyImporter from './io/WardleyImporter.js';
import type WardleyExporter from './io/WardleyExporter.js';
import type EvolutionGrid from './evolution-grid/EvolutionGrid.js';
import type { ImportWarning, RootBusinessObject } from './io/types.js';
import {
  configWithSize,
  wardleyRootOf,
  withoutRawSizeStatements,
} from './map-resize/MapProjection.js';
import type WardleyModeling from './modeling/WardleyModeling.js';
import { applyConfigUpdate, type MapConfigUpdate } from './modeling/cmd/UpdateConfigHandler.js';

export interface WardleyViewerOptions {
  /** Host element. If missing, a detached <div> is created (can be attached later via attachTo). */
  container?: HTMLElement;
  width?: number | string;
  height?: number | string;
  /** Concatenated to the end of the module list (extension point, §12). */
  additionalModules?: ModuleDeclaration[];
  /**
   * Modeler keyboard behaviour. `undoRedo: false` leaves Cmd/Ctrl+Z/Y to the host (e.g. VS Code,
   * which owns the document's undo stack). Default: the canvas handles undo/redo.
   */
  keyboard?: { undoRedo?: boolean };
}

export type EventCallback<T = unknown> = (event: T) => void;

/** The plot size as drawn, plus whether the map writes it explicitly (`size [w, h]`). */
export interface MapSizeInfo {
  width: number;
  height: number;
  isExplicit: boolean;
  presetId?: MapSizePresetId;
}

/** Payload of `wardley.config.changed`: title, size or axis labels changed. */
export interface WardleyConfigChangedEvent {
  config: MapConfig;
  /** A live preview (typing, dragging the plot corner): not a change to persist. */
  transient?: true;
}

export interface SetEvolutionLabelsOptions {
  /** Live preview: applied directly, without an undo step (commit later without this flag). */
  transient?: boolean;
}

type EvolutionLabels = readonly [string, string, string, string];

function sizeToCss(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * Shared lifecycle & DI bootstrap for all Wardley viewers (analogous to bpmn-js BaseViewer, but OUR
 * OWN code — no bpmn-js as a dependency, §3.3). Subclasses only override `_getModules()` (a method
 * rather than a field, to sidestep the constructor/field initialization order). `attachTo`/`detach`
 * are own implementations (not a diagram-js primitive, §6.1).
 */
export abstract class WardleyBaseViewer {
  protected abstract _getModules(): ModuleDeclaration[];

  private _diagram: Diagram | undefined;
  private readonly _container: HTMLElement;
  private readonly _options: WardleyViewerOptions;
  /** Labels before the first transient preview, so the commit becomes one undo step from there. */
  private _labelsBeforePreview: { labels: EvolutionLabels | undefined } | undefined;

  constructor(options: WardleyViewerOptions = {}) {
    this._options = options;
    this._container = this._createContainer(options);
  }

  private _createContainer(options: WardleyViewerOptions): HTMLElement {
    const container = options.container ?? document.createElement('div');
    container.classList.add('wardley-container');
    container.style.width = sizeToCss(options.width ?? '100%');
    container.style.height = sizeToCss(options.height ?? (options.container ? '100%' : '600px'));
    return container;
  }

  private _ensureDiagram(): Diagram {
    if (!this._diagram) {
      const modules = [...this._getModules(), ...(this._options.additionalModules ?? [])];
      this._diagram = new Diagram({
        canvas: { container: this._container },
        modules,
        ...(this._options.keyboard ? { wardleyKeyboard: this._options.keyboard } : {}),
      });
    }
    return this._diagram;
  }

  get<T>(name: string): T {
    return this._ensureDiagram().get<T>(name);
  }

  on<T = unknown>(event: string, callback: EventCallback<T>, priority = 1000): void {
    this.get<EventBus>('eventBus').on(event, priority, callback as EventCallback);
  }

  off(event: string, callback: EventCallback): void {
    this.get<EventBus>('eventBus').off(event, callback);
  }

  /** Load a model into the canvas (replaces existing content). */
  async importMap(map: WardleyMap): Promise<{ warnings: ImportWarning[] }> {
    const diagram = this._ensureDiagram();
    const eventBus = diagram.get<EventBus>('eventBus');
    const importer = diagram.get<WardleyImporter>('wardleyImporter');
    this._labelsBeforePreview = undefined;
    // A running drag (move, connect, create, resize) holds the previous map's shapes. Released after
    // the import, its command would fail half-way and leave the command stack stuck, so no later
    // edit would fire commandStack.changed again (VS Code: external edit during a drag).
    diagram.get<Dragging>('dragging', false)?.cancel(false);
    importer.clear();
    const warnings = importer.import(map);
    this._applyStyleClass(map.config.style);
    // Discard the PREVIOUS map's undo history (concept doc §5.6): undo on orphaned
    // elements would otherwise crash or insert zombie elements into the new map.
    // The read-only Viewer has no command stack.
    diagram.get<CommandStack>('commandStack', false)?.clear();
    eventBus.fire('import.done', { warnings });
    return { warnings };
  }

  /** DSL `style` directive as a CSS class on the container (`wardley-dark` etc., concept §8.1). */
  private _applyStyleClass(style?: string): void {
    const cls = this._container.classList;
    for (const s of ['wardley', 'handwritten', 'colour', 'dark']) cls.remove(`wardley-${s}`);
    if (style && style !== 'wardley') cls.add(`wardley-${style}`);
  }

  /** Load OWM DSL text (internally parse -> importMap). Parser findings land in the warnings. */
  async importDSL(text: string): Promise<{ warnings: ImportWarning[] }> {
    const eventBus = this._ensureDiagram().get<EventBus>('eventBus');
    eventBus.fire('import.parse.start', { text });
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    eventBus.fire('import.parse.done', { map, diagnostics });
    const { warnings } = await this.importMap(map);
    return {
      warnings: [
        ...diagnostics.map((d) => ({
          message: `Line ${d.line}: ${d.message} — "${d.text}"`,
          line: d.line,
          source: d.text,
        })),
        ...warnings,
      ],
    };
  }

  /** Current state as the canonical model (from the DI properties). */
  exportMap(): WardleyMap {
    return this.get<WardleyExporter>('wardleyExporter').export();
  }

  /**
   * Sets the plot size in diagram-px. The size is normalized first (whole pixels, clamped to
   * PLOT_MIN..PLOT_MAX); non-finite input throws a RangeError before anything changes. In the
   * Modeler this is one undoable step that re-projects the shapes in place (selection, viewport and
   * history survive); the read-only viewers re-import. An explicit size line is written even for
   * the default size — only `resetMapSize` removes it.
   */
  async setMapSize(width: number, height: number): Promise<{ warnings: ImportWarning[] }> {
    const size = normalizeMapSize(width, height);
    const modeling = this._wardleyModeling();
    if (modeling) {
      modeling.resizeMap(size);
      return { warnings: [] };
    }
    return this._reimportWithSize(size);
  }

  /** Removes the `size` line: the map is drawn at the default plot size again. */
  async resetMapSize(): Promise<{ warnings: ImportWarning[] }> {
    const modeling = this._wardleyModeling();
    if (modeling) {
      modeling.resizeMap(undefined);
      return { warnings: [] };
    }
    return this._reimportWithSize(undefined);
  }

  getMapSize(): MapSizeInfo {
    const { width, height } = this.get<EvolutionGrid>('evolutionGrid').getPlotSize();
    const presetId = presetIdForSize({ width, height });
    return {
      width,
      height,
      isExplicit: this._rootBusinessObject()?.config.size !== undefined,
      ...(presetId ? { presetId } : {}),
    };
  }

  private async _reimportWithSize(
    size: { width: number; height: number } | undefined,
  ): Promise<{ warnings: ImportWarning[] }> {
    if (!this._rootBusinessObject()) return { warnings: [] };
    const map = this.exportMap();
    const current = map.config.size;
    const unchanged = size
      ? current?.width === size.width && current.height === size.height
      : current === undefined;
    if (unchanged) return { warnings: [] };
    const rawPassthrough = withoutRawSizeStatements(map.rawPassthrough);
    const { rawPassthrough: _previous, ...rest } = map;
    return this.importMap({
      ...rest,
      config: configWithSize(map.config, size),
      ...(rawPassthrough?.length ? { rawPassthrough } : {}),
    });
  }

  /**
   * Sets the map title (one undoable step in the Modeler). Line breaks become spaces so the DSL
   * `title` line stays one line; an empty title falls back to the default.
   */
  setTitle(title: string): void {
    const cleaned = title.replace(/\s*[\r\n]+\s*/g, ' ').trim() || DEFAULT_MAP_TITLE;
    const modeling = this._wardleyModeling();
    if (modeling) modeling.updateConfig({ title: cleaned });
    else this._applyConfigDirectly({ title: cleaned });
  }

  /**
   * Sets the four X-axis stage labels (`undefined` = default Genesis/Custom/Product/Commodity).
   * Empty stages fall back to their default and a `->` becomes `→`, so the labels always write a
   * valid `evolution` line; the default set is stored as `undefined`.
   * Changes only the labeling, not the geometry (no re-import -> no view jump, no selection loss).
   * In the Modeler this is one undoable step; `{ transient: true }` applies a live preview without
   * an undo step, and the next non-transient call commits it as ONE step from the state before the
   * preview (no step at all when the labels end where the preview started). Fires
   * `wardley.config.changed` (`{ config, transient? }`): transient events are live previews and
   * must not be persisted; in the Modeler every committed change is followed by
   * `commandStack.changed`.
   */
  setEvolutionLabels(
    requested: readonly string[] | undefined,
    options: SetEvolutionLabelsOptions = {},
  ): void {
    // Labels that would break the `evolution` line (empty stage, `->`) never reach the map.
    const labels = normalizeEvolutionLabels(requested);
    const modeling = this._wardleyModeling();
    if (options.transient && modeling) {
      if (!this._labelsBeforePreview) {
        const businessObject = this._rootBusinessObject();
        if (!businessObject) return;
        this._labelsBeforePreview = { labels: businessObject.config.evolutionLabels };
      }
      this._applyConfigDirectly({ evolutionLabels: labels }, { transient: true });
      return;
    }
    if (modeling) {
      if (this._labelsBeforePreview) {
        const before = this._labelsBeforePreview.labels;
        this._applyConfigDirectly({ evolutionLabels: before });
        this._labelsBeforePreview = undefined;
        // A preview that ends where it started (typed, then reverted) is no edit: no undo step.
        if (sameEvolutionLabels(before, labels)) return;
      }
      modeling.updateConfig({ evolutionLabels: labels });
      return;
    }
    this._applyConfigDirectly({ evolutionLabels: labels });
  }

  /**
   * Config change without the command stack (read-only viewers, live previews): updates the root
   * config in place and re-renders only the axis background.
   */
  private _applyConfigDirectly(
    update: MapConfigUpdate,
    options: { transient?: boolean } = {},
  ): void {
    applyConfigUpdate(
      this.get<Canvas>('canvas'),
      this.get<EvolutionGrid>('evolutionGrid'),
      this.get<EventBus>('eventBus'),
      update,
      options,
    );
  }

  /** The Modeler's command API, or null in the read-only viewers. */
  private _wardleyModeling(): WardleyModeling | null {
    return this._ensureDiagram().get<WardleyModeling>('wardleyModeling', false);
  }

  private _root(): (Root & { businessObject?: RootBusinessObject }) | undefined {
    return wardleyRootOf(this.get<Canvas>('canvas'));
  }

  private _rootBusinessObject(): RootBusinessObject | undefined {
    return this._root()?.businessObject;
  }

  exportDSL(): string {
    return serializeDSL(this.exportMap());
  }

  /**
   * Static, standalone SVG covering the whole plot (at its actual `config.size`) plus any content
   * drawn beyond it, such as long labels of commodity components.
   */
  async saveSVG(): Promise<{ svg: string }> {
    const canvas = this.get<Canvas>('canvas');
    return saveSVG(canvas, exportBounds(canvas, this.get<EvolutionGrid>('evolutionGrid')));
  }

  /** Own implementation (not a diagram-js primitive): attach the container to `target`. */
  attachTo(target: HTMLElement): void {
    target.appendChild(this._container);
    this.get<Canvas>('canvas').resized();
  }

  /** Own implementation: detach the container from the DOM, keeping state. */
  detach(): void {
    this._container.remove();
  }

  clear(): void {
    this._ensureDiagram().clear();
  }

  destroy(): void {
    if (this._diagram) {
      this._diagram.destroy();
      this._diagram = undefined;
    }
    this._container.remove();
  }

  get container(): HTMLElement {
    return this._container;
  }
}
