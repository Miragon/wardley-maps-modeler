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
  validateMap,
  type MapConfig,
  type MapSize,
  type MapSizePresetId,
  type WardleyMap,
} from '@miragon/wardley-schema-model';
import { parseDSLWithDiagnostics, serializeDSL } from '@miragon/wardley-dsl';
import { saveSVG } from './io/saveSvg.js';
import { exportBounds } from './io/exportBounds.js';
import type WardleyImporter from './io/WardleyImporter.js';
import type WardleyExporter from './io/WardleyExporter.js';
import type EvolutionGrid from './evolution-grid/EvolutionGrid.js';
import { ROOT_ID, type ImportWarning, type RootBusinessObject } from './io/types.js';
import {
  configWithSize,
  wardleyRootOf,
  withoutRawSizeStatements,
  type default as MapProjection,
  type ProjectionSnapshot,
} from './map-resize/MapProjection.js';
import type WardleyModeling from './modeling/WardleyModeling.js';
import type { FreeArea } from '@miragon/modeler-api';
import type { FreeRectConfig, FreeRectInsets } from './free-rect/index.js';
import { COMMAND_START_EVENTS, PUT_BACK_PRIORITY, type LivePreview } from './live-preview/index.js';
import { applyConfigUpdate, type MapConfigUpdate } from './modeling/cmd/UpdateConfigHandler.js';

export interface WardleyViewerOptions {
  /** Host element. If missing, a detached <div> is created (can be attached later via attachTo). */
  container?: HTMLElement;
  width?: number | string;
  height?: number | string;
  /** Concatenated to the end of the module list (extension point, §12). */
  additionalModules?: ModuleDeclaration[];
  /**
   * The part of the canvas no host chrome covers (`@miragon/modeler-api` `freeArea`), read
   * whenever it is needed. `{ insets }` names what the chrome covers along the container's edges,
   * in px (e.g. `() => shell.fitInsets()` of the Miragon modeler shell): the import fits the plot
   * into the rest, panning keeps the map inside it, and keyboard creation places elements in its
   * centre. `{ center }` gives only that centre, in diagram coordinates. Default: the whole
   * container.
   */
  freeArea?: FreeArea | undefined;
  /**
   * Fit the plot into the view after every import. Default `true`; `false` when the host's chrome
   * fits the view itself.
   */
  fitOnImport?: boolean | undefined;
  /**
   * Bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y to the canvas history. Default `true`;
   * `false` leaves them to the host (e.g. VS Code, which owns the document's undo stack).
   */
  undoRedoKeys?: boolean | undefined;
  /** @deprecated Since 0.9, for one minor release: use `undoRedoKeys`, which wins over it. */
  keyboard?: { undoRedo?: boolean } | undefined;
  /** @deprecated Since 0.9, for one minor release: use `freeArea: { insets }`, which wins over it. */
  freeRectInsets?: (() => FreeRectInsets) | undefined;
}

/** The diagram config the viewer options stand for, the aligned names over their aliases. */
function diagramConfig(options: WardleyViewerOptions): Record<string, unknown> {
  const undoRedo = options.undoRedoKeys ?? options.keyboard?.undoRedo;
  const freeArea: FreeRectConfig | undefined = options.freeArea
    ? options.freeArea.insets
      ? { insets: options.freeArea.insets }
      : { center: options.freeArea.center }
    : options.freeRectInsets
      ? { insets: options.freeRectInsets }
      : undefined;
  return {
    ...(undoRedo === undefined ? {} : { wardleyKeyboard: { undoRedo } }),
    ...(freeArea ? { wardleyFreeRect: freeArea } : {}),
    ...(options.fitOnImport === false ? { wardleyImport: { fit: false } } : {}),
  };
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

export interface SetMapSizeOptions {
  /** Live preview: drawn at once, without an undo step (commit later without this flag). */
  transient?: boolean;
}

type EvolutionLabels = readonly [string, string, string, string];

/** diagram-js names its implicit roots so; an element of that id would replace the plane. */
const IMPLICIT_ROOT_PREFIX = '__implicitroot';

/** `map`, validated, or a throw when the canvas cannot hold it. */
function importableMap(map: WardleyMap): WardleyMap {
  const checked = validateMap(map);
  const reserved = [...checked.elements, ...checked.edges].find(
    ({ id }) => id === ROOT_ID || id.startsWith(IMPLICIT_ROOT_PREFIX),
  );
  if (reserved) throw new Error(`The id "${reserved.id}" is reserved for the canvas itself.`);
  return checked;
}

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
  /** The map before the first transient size preview, put back before the size is committed. */
  private _sizePreview: { snapshot: ProjectionSnapshot; model: WardleyMap } | undefined;

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
        ...diagramConfig(this._options),
      });
      // The size preview re-projects the map it started with and puts it back before its commit,
      // which would overwrite a command in between (a title a host sets mid-preview) and leave
      // the history out of step with the document: the preview goes first.
      this._diagram
        .get<EventBus>('eventBus')
        .on(COMMAND_START_EVENTS, PUT_BACK_PRIORITY, () => this._putBackSizePreview());
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

  /**
   * Load a model into the canvas (replaces existing content). Rejects a map the canvas cannot
   * hold (invalid, or ids the canvas reserves for itself) before anything changes, so the current
   * map, its rendering and its undo history stay as they were.
   */
  async importMap(map: WardleyMap): Promise<{ warnings: ImportWarning[] }> {
    const checked = importableMap(map);
    const diagram = this._ensureDiagram();
    const eventBus = diagram.get<EventBus>('eventBus');
    const importer = diagram.get<WardleyImporter>('wardleyImporter');
    const commandStack = diagram.get<CommandStack>('commandStack', false);
    // Kept to put back if rendering fails half-way: a blank canvas is no way to fail an import.
    const previous = this._rootBusinessObject() ? this.exportMap() : undefined;
    this._labelsBeforePreview = undefined;
    this._sizePreview = undefined;
    // A running drag (move, connect, create, resize) holds the previous map's shapes. Released after
    // the import, its command would fail half-way and leave the command stack stuck, so no later
    // edit would fire commandStack.changed again (VS Code: external edit during a drag).
    diagram.get<Dragging>('dragging', false)?.cancel(false);
    importer.clear();
    let warnings: ImportWarning[];
    try {
      warnings = importer.import(checked);
    } catch (error) {
      importer.clear();
      if (previous) importer.import(previous);
      // The history pointed at the shapes the failed render removed.
      commandStack?.clear();
      eventBus.fire('import.done', { warnings: [] });
      throw error;
    }
    // Discard the PREVIOUS map's undo history (concept doc §5.6): undo on orphaned
    // elements would otherwise crash or insert zombie elements into the new map.
    // The read-only Viewer has no command stack.
    commandStack?.clear();
    eventBus.fire('import.done', { warnings });
    return { warnings };
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
   * the default size — only `resetMapSize` removes it. In the Modeler `{ transient: true }` shows
   * a live preview without an undo step, and the next call without it commits ONE step from the
   * size before the preview (none when the size ends where the preview started), like
   * `setEvolutionLabels`. A command before that call (e.g. `setTitle`) puts the preview back first.
   */
  async setMapSize(
    width: number,
    height: number,
    options: SetMapSizeOptions = {},
  ): Promise<{ warnings: ImportWarning[] }> {
    return this._resizeMap(normalizeMapSize(width, height), options);
  }

  /** Removes the `size` line: the map is drawn at the default plot size again. */
  async resetMapSize(options: SetMapSizeOptions = {}): Promise<{ warnings: ImportWarning[] }> {
    return this._resizeMap(undefined, options);
  }

  private async _resizeMap(
    size: MapSize | undefined,
    options: SetMapSizeOptions,
  ): Promise<{ warnings: ImportWarning[] }> {
    const modeling = this._wardleyModeling();
    if (!modeling) return this._reimportWithSize(size);
    const projection = this.get<MapProjection>('wardleyMapProjection');
    if (options.transient) {
      if (!this._sizePreview) {
        const snapshot = projection.snapshot();
        if (!snapshot) return { warnings: [] };
        this._sizePreview = { snapshot, model: projection.captureModel() };
      }
      const businessObject = projection.withSize(size);
      if (!businessObject) return { warnings: [] };
      projection.redraw(
        projection.apply(businessObject, this._sizePreview.model, { transient: true }),
      );
      return { warnings: [] };
    }
    // The command must take the size before the preview as its old state.
    this._putBackSizePreview();
    modeling.resizeMap(size);
    return { warnings: [] };
  }

  /** Shows the map without the size preview again, if one is open. */
  private _putBackSizePreview(): void {
    if (!this._sizePreview) return;
    const projection = this.get<MapProjection>('wardleyMapProjection');
    const { snapshot } = this._sizePreview;
    this._sizePreview = undefined;
    projection.redraw(projection.restore(snapshot, { transient: true }));
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
      this._livePreview()?.begin('evolutionLabels');
      this._applyConfigDirectly({ evolutionLabels: labels }, { transient: true });
      return;
    }
    if (modeling) {
      if (this._labelsBeforePreview) {
        const before = this._labelsBeforePreview.labels;
        this._applyConfigDirectly({ evolutionLabels: before });
        this._livePreview()?.end('evolutionLabels');
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

  private _livePreview(): LivePreview | null {
    return this._ensureDiagram().get<LivePreview>('wardleyLivePreview', false);
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
