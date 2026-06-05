import Diagram from 'diagram-js/lib/Diagram';
import type { ModuleDeclaration } from 'didi';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Root } from 'diagram-js/lib/model/Types';
import type { MapConfig, WardleyMap } from '@wardley/schema-model';
import { parseDSL, serializeDSL } from '@wardley/dsl';
import { saveSVG } from './io/saveSvg.js';
import type WardleyImporter from './io/WardleyImporter.js';
import type WardleyExporter from './io/WardleyExporter.js';
import type EvolutionGrid from './evolution-grid/EvolutionGrid.js';
import { ROOT_ID, type ImportWarning, type RootBusinessObject } from './io/types.js';

export interface WardleyViewerOptions {
  /** Host-Element. Fehlt es, wird ein detached <div> erzeugt (spaeter via attachTo einhaengbar). */
  container?: HTMLElement;
  width?: number | string;
  height?: number | string;
  /** Werden ans Ende der Modulliste konkateniert (Erweiterungspunkt, §12). */
  additionalModules?: ModuleDeclaration[];
}

export type EventCallback<T = unknown> = (event: T) => void;

function sizeToCss(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * Gemeinsamer Lebenszyklus & DI-Bootstrap fuer alle Wardley-Viewer (analog bpmn-js BaseViewer,
 * jedoch EIGENER Code — kein bpmn-js als Dependency, §3.3). Subklassen ueberschreiben nur
 * `_getModules()` (Methode statt Feld, um die Konstruktor-/Feld-Initialisierungsreihenfolge zu
 * umgehen). `attachTo`/`detach` sind Eigenimplementierungen (kein diagram-js-Primitiv, §6.1).
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

  /** Aufloesen eines diagram-js-Service (didi-Injector). */
  get<T>(name: string): T {
    return this._ensureDiagram().get<T>(name);
  }

  on<T = unknown>(event: string, callback: EventCallback<T>, priority = 1000): void {
    this.get<EventBus>('eventBus').on(event, priority, callback as EventCallback);
  }

  off(event: string, callback: EventCallback): void {
    this.get<EventBus>('eventBus').off(event, callback);
  }

  /** Modell in den Canvas laden (ersetzt bestehenden Inhalt). */
  async importMap(map: WardleyMap): Promise<{ warnings: ImportWarning[] }> {
    const diagram = this._ensureDiagram();
    const eventBus = diagram.get<EventBus>('eventBus');
    const importer = diagram.get<WardleyImporter>('wardleyImporter');
    importer.clear();
    const warnings = importer.import(map);
    eventBus.fire('import.done', { warnings });
    return { warnings };
  }

  /** OWM-DSL-Text laden (intern parse -> importMap). */
  async importDSL(text: string): Promise<{ warnings: ImportWarning[] }> {
    const eventBus = this._ensureDiagram().get<EventBus>('eventBus');
    eventBus.fire('import.parse.start', { text });
    const map = parseDSL(text);
    eventBus.fire('import.parse.done', { map });
    return this.importMap(map);
  }

  /** Aktuellen Zustand als kanonisches Modell (aus den DI-Properties). */
  exportMap(): WardleyMap {
    return this.get<WardleyExporter>('wardleyExporter').export();
  }

  /**
   * Aendert die logische Plotgroesse der Map (in diagram-px) und projiziert alle Elemente neu.
   * Setzt `config.size` und importiert den aktuellen Stand neu (normierte Koordinaten bleiben Wahrheit).
   */
  async setMapSize(width: number, height: number): Promise<{ warnings: ImportWarning[] }> {
    const map = this.exportMap();
    return this.importMap({ ...map, config: { ...map.config, size: { width, height } } });
  }

  /**
   * Setzt die vier X-Achsen-Stage-Labels (`undefined` = Default Genesis/Custom/Product/Commodity).
   * Aendert nur die Beschriftung, nicht die Geometrie: aktualisiert die Map-Config in-place und
   * re-rendert ausschliesslich den Achsen-Hintergrund (kein Re-Import -> kein View-Sprung, keine
   * Auswahl-Aufloesung). Feuert `wardley.config.changed` fuer URL-/Persistenz-Sync der Konsumenten.
   */
  setEvolutionLabels(labels: readonly [string, string, string, string] | undefined): void {
    const canvas = this.get<Canvas>('canvas');
    let root: (Root & { businessObject?: RootBusinessObject }) | undefined;
    try {
      root = canvas.getRootElement() as Root & { businessObject?: RootBusinessObject };
    } catch {
      return; // noch nichts importiert -> nichts zu konfigurieren
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

  /** Als OWM-DSL serialisieren. */
  exportDSL(): string {
    return serializeDSL(this.exportMap());
  }

  /** Statisches, eigenstaendiges SVG. */
  async saveSVG(): Promise<{ svg: string }> {
    return saveSVG(this.get<Canvas>('canvas'));
  }

  /** Eigenimplementierung (kein diagram-js-Primitiv): Container in `target` einhaengen. */
  attachTo(target: HTMLElement): void {
    target.appendChild(this._container);
    this.get<Canvas>('canvas').resized();
  }

  /** Eigenimplementierung: Container aus dem DOM loesen, Zustand erhalten. */
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
