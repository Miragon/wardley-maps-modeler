import Diagram from 'diagram-js/lib/Diagram';
import type { ModuleDeclaration } from 'didi';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Root } from 'diagram-js/lib/model/Types';
import type { MapConfig, WardleyMap } from '@miragon/wardley-schema-model';
import { parseDSLWithDiagnostics, serializeDSL } from '@miragon/wardley-dsl';
import { saveSVG } from './io/saveSvg.js';
import type WardleyImporter from './io/WardleyImporter.js';
import type WardleyExporter from './io/WardleyExporter.js';
import type EvolutionGrid from './evolution-grid/EvolutionGrid.js';
import { ROOT_ID, type ImportWarning, type RootBusinessObject } from './io/types.js';

export interface WardleyViewerOptions {
  /** Host element. If missing, a detached <div> is created (can be attached later via attachTo). */
  container?: HTMLElement;
  width?: number | string;
  height?: number | string;
  /** Concatenated to the end of the module list (extension point, §12). */
  additionalModules?: ModuleDeclaration[];
}

export type EventCallback<T = unknown> = (event: T) => void;

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
      this._diagram = new Diagram({ canvas: { container: this._container }, modules });
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
    importer.clear();
    const warnings = importer.import(map);
    this._applyStyleClass(map.config.style);
    // Discard the PREVIOUS map's undo history (concept doc §5.6): undo on orphaned
    // elements would otherwise crash or insert zombie elements into the new map.
    diagram.get<CommandStack>('commandStack').clear();
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
        ...diagnostics.map((d) => ({ message: `Line ${d.line}: ${d.message} — "${d.text}"` })),
        ...warnings,
      ],
    };
  }

  /** Current state as the canonical model (from the DI properties). */
  exportMap(): WardleyMap {
    return this.get<WardleyExporter>('wardleyExporter').export();
  }

  /**
   * Changes the map's logical plot size (in diagram-px) and re-projects all elements.
   * Sets `config.size` and re-imports the current state (normalized coordinates stay the truth).
   */
  async setMapSize(width: number, height: number): Promise<{ warnings: ImportWarning[] }> {
    const map = this.exportMap();
    return this.importMap({ ...map, config: { ...map.config, size: { width, height } } });
  }

  /**
   * Sets the four X-axis stage labels (`undefined` = default Genesis/Custom/Product/Commodity).
   * Changes only the labeling, not the geometry: updates the map config in-place and re-renders only
   * the axis background (no re-import -> no view jump, no selection loss). Fires
   * `wardley.config.changed` for consumers' URL/persistence sync.
   */
  setEvolutionLabels(labels: readonly [string, string, string, string] | undefined): void {
    const canvas = this.get<Canvas>('canvas');
    let root: (Root & { businessObject?: RootBusinessObject }) | undefined;
    try {
      root = canvas.getRootElement() as Root & { businessObject?: RootBusinessObject };
    } catch {
      return; // nothing imported yet -> nothing to configure
    }
    if (!root || root.id !== ROOT_ID) return;

    const current = root.businessObject?.config ?? { title: 'Untitled Map' };
    const { evolutionLabels: _drop, ...rest } = current;
    const config: MapConfig = labels ? { ...rest, evolutionLabels: labels } : rest;
    root.businessObject = { ...root.businessObject, config };

    const grid = this.get<EvolutionGrid>('evolutionGrid');
    grid.configure(config);
    grid.render();
    this.get<EventBus>('eventBus').fire('wardley.config.changed', { config });
  }

  exportDSL(): string {
    return serializeDSL(this.exportMap());
  }

  /** Static, standalone SVG. */
  async saveSVG(): Promise<{ svg: string }> {
    // viewBox from the ACTUAL plot size (config.size), not the defaults —
    // otherwise the export clips enlarged maps.
    return saveSVG(
      this.get<Canvas>('canvas'),
      this.get<EvolutionGrid>('evolutionGrid').outerBounds(),
    );
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
