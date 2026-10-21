import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Root } from 'diagram-js/lib/model/Types';
import type { Injector } from 'didi';
import type { MapEdge, MapElement, WardleyMap } from '@miragon/wardley-schema-model';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';
import type { WardleyShape } from '../model/di-types.js';
import type { FreeRect } from '../free-rect/index.js';
import { ROOT_ID, type ImportWarning, type RootBusinessObject } from './types.js';
import { fitViewbox } from './fitViewbox.js';

/** "Frame" types sit behind the connections (concept doc requirement: frames at the very back). */
const FRAME_TYPES: ReadonlySet<string> = new Set(['attitude', 'pipeline']);

/** Z-order of the nodes among themselves: smaller number = further back. */
const TYPE_ORDER: Record<string, number> = {
  attitude: 0,
  pipeline: 1,
  note: 2,
  component: 3,
  anchor: 4,
  annotation: 5,
  submap: 3,
  accelerator: 3,
};

/** Diagram config `wardleyImport` (viewer option `fitOnImport`). */
export interface WardleyImportConfig {
  /** `false`: the host fits the view itself, the import leaves it alone. */
  fit?: boolean;
}

/**
 * Bridges the WardleyMap model into the diagram-js canvas.
 * Uses `evolutionGrid` exclusively for the pixel projection (P7). Deliberately bypasses the
 * commandStack (import path, P4 exception): no undo, no dirty (concept doc §5.6).
 */
export default class WardleyImporter {
  static $inject = [
    'canvas',
    'elementFactory',
    'wardleyElementFactory',
    'evolutionGrid',
    'eventBus',
    'elementRegistry',
    'injector',
    'config.wardleyImport',
  ];

  private readonly freeRect: FreeRect | null;

  constructor(
    private readonly canvas: Canvas,
    private readonly elementFactory: ElementFactory,
    private readonly factory: WardleyElementFactory,
    private readonly grid: EvolutionGrid,
    private readonly eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
    injector: Injector,
    private readonly config: WardleyImportConfig | undefined,
  ) {
    this.freeRect = injector.get<FreeRect | null>('wardleyFreeRect', false) ?? null;
  }

  import(map: WardleyMap): ImportWarning[] {
    const warnings: ImportWarning[] = [];
    this.eventBus.fire('import.render.start', { map });

    this.grid.configure(map.config);

    const meta: RootBusinessObject = {
      config: map.config,
      ...(map.rawPassthrough ? { rawPassthrough: map.rawPassthrough } : {}),
    };

    // Reuse the existing root (re-import), otherwise create a new one.
    let existing: (Root & { businessObject?: RootBusinessObject }) | undefined;
    try {
      existing = this.canvas.getRootElement() as Root & { businessObject?: RootBusinessObject };
    } catch {
      existing = undefined;
    }
    let root: Root & { businessObject?: RootBusinessObject };
    if (existing && existing.id === ROOT_ID) {
      root = existing;
    } else {
      root = this.elementFactory.createRoot({ id: ROOT_ID }) as Root & {
        businessObject?: RootBusinessObject;
      };
      this.canvas.setRootElement(root);
    }
    root.businessObject = meta;

    this.grid.render();

    const shapeById = new Map<string, WardleyShape>();
    const ordered = [...map.elements].sort(
      (a, b) => (TYPE_ORDER[a.elementType] ?? 9) - (TYPE_ORDER[b.elementType] ?? 9),
    );

    // Z-order (back -> front): frames (attitude/pipeline) -> connections -> nodes.
    // Frames + nodes must be registered before the connections; the connections are then
    // inserted via parentIndex BEHIND the nodes (but before them in the DOM).
    const frames = ordered.filter((el) => FRAME_TYPES.has(el.elementType));
    const nodes = ordered.filter((el) => !FRAME_TYPES.has(el.elementType));

    let frameCount = 0;
    for (const el of frames) {
      const shape = this.createShape(el);
      if (!shape) continue;
      this.canvas.addShape(shape, root);
      shapeById.set(el.id, shape);
      frameCount++;
    }
    for (const el of nodes) {
      const shape = this.createShape(el);
      if (!shape) continue;
      this.canvas.addShape(shape, root);
      shapeById.set(el.id, shape);
    }

    const resolvedEdges: { edge: MapEdge; source: WardleyShape; target: WardleyShape }[] = [];
    for (const edge of map.edges) {
      const source = shapeById.get(edge.from);
      const target = shapeById.get(edge.to);
      if (!source || !target) {
        warnings.push({ message: `Edge ${edge.id}: endpoint missing.`, elementId: edge.id });
        continue;
      }
      resolvedEdges.push({ edge, source, target });
    }

    // Flows sit above dependencies so a dependency on the same pair cannot strike through the flow
    // value; within each group, a later declaration paints on top (like interactive creation).
    const connectionPaintOrder = [
      ...resolvedEdges.filter(({ edge }) => edge.edgeType !== 'flow'),
      ...resolvedEdges.filter(({ edge }) => edge.edgeType === 'flow'),
    ];
    let insertedConnections = 0;
    for (const { edge, source, target } of connectionPaintOrder) {
      const conn =
        edge.edgeType === 'flow'
          ? this.factory.createFlow(edge, source, target)
          : this.factory.createDependency(edge, source, target);
      // Behind all nodes, in front of the frames and the connections inserted so far.
      this.canvas.addConnection(conn, root, frameCount + insertedConnections);
      insertedConnections++;
    }

    // Frames render BEFORE the nodes exist, but pipeline visuals depend on whether a
    // same-named anchor component exists — re-render them now that everything is in place.
    for (const el of frames) {
      const shape = shapeById.get(el.id);
      if (shape && el.elementType === 'pipeline') {
        this.eventBus.fire('element.changed', { element: shape });
      }
    }

    if (this.config?.fit !== false) this.fitPlot();
    this.eventBus.fire('import.render.done', { warnings });
    return warnings;
  }

  /**
   * The plot with its axis margins, centred in the host's free rectangle, at most at 100 %: where
   * the host's own fit puts it. With a free area the pan constraint leaves it there; without one
   * it may still move a map smaller than the view to keep its own margins around it.
   */
  private fitPlot(): void {
    const plot = this.grid.outerBounds();
    const insets = this.freeRect?.insets();
    this.canvas.viewbox(fitViewbox(plot, this.canvas.getSize(), insets) ?? plot);
  }

  private createShape(el: MapElement): WardleyShape | undefined {
    return this.factory.createFromModel(el);
  }

  clear(): void {
    // Root elements are planes, not shapes: removing diagram-js's implicit root (created by any canvas
    // access before the first import) as a shape corrupts the canvas and breaks setRootElement.
    const roots = new Set<unknown>(this.canvas.getRootElements());
    for (const el of [...this.elementRegistry.getAll()]) {
      const e = el as { waypoints?: unknown; id: string };
      if (roots.has(el)) continue;
      try {
        if (e.waypoints) this.canvas.removeConnection(e.id);
        else this.canvas.removeShape(e.id);
      } catch {
        // already removed (e.g. edge on a removed shape) — ignore
      }
    }
  }
}
