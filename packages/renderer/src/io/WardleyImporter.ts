import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Root } from 'diagram-js/lib/model/Types';
import type { MapElement, WardleyMap } from '@miragon/wardley-schema-model';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';
import type { WardleyShape } from '../model/di-types.js';
import { ROOT_ID, type ImportWarning, type RootBusinessObject } from './types.js';

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
  ];

  constructor(
    private readonly canvas: Canvas,
    private readonly elementFactory: ElementFactory,
    private readonly factory: WardleyElementFactory,
    private readonly grid: EvolutionGrid,
    private readonly eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
  ) {}

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

    for (const edge of map.edges) {
      const source = shapeById.get(edge.from);
      const target = shapeById.get(edge.to);
      if (!source || !target) {
        warnings.push({ message: `Edge ${edge.id}: endpoint missing.`, elementId: edge.id });
        continue;
      }
      const conn =
        edge.edgeType === 'flow'
          ? this.factory.createFlow(edge, source, target)
          : this.factory.createDependency(edge, source, target);
      // Insert directly behind the frames, before all nodes.
      this.canvas.addConnection(conn, root, frameCount);
    }

    // Frames render BEFORE the nodes exist, but pipeline visuals depend on whether a
    // same-named anchor component exists — re-render them now that everything is in place.
    for (const el of frames) {
      const shape = shapeById.get(el.id);
      if (shape && el.elementType === 'pipeline') {
        this.eventBus.fire('element.changed', { element: shape });
      }
    }

    this.canvas.viewbox(this.grid.outerBounds());
    this.eventBus.fire('import.render.done', { warnings });
    return warnings;
  }

  private createShape(el: MapElement): WardleyShape | undefined {
    switch (el.elementType) {
      case 'component':
        return this.factory.createComponent(el);
      case 'anchor':
        return this.factory.createAnchor(el);
      case 'note':
        return this.factory.createNote(el);
      case 'pipeline':
        return this.factory.createPipeline(el);
      case 'annotation':
        return this.factory.createAnnotation(el);
      case 'attitude':
        return this.factory.createAttitude(el);
      case 'accelerator':
        return this.factory.createAccelerator(el);
      case 'submap':
        return this.factory.createSubmap(el);
      case 'drawing':
        return this.factory.createDrawing(el);
      default: {
        const exhaustive: never = el;
        void exhaustive;
        return undefined;
      }
    }
  }

  clear(): void {
    for (const el of [...this.elementRegistry.getAll()]) {
      const e = el as { waypoints?: unknown; id: string };
      if (e.id === ROOT_ID) continue;
      try {
        if (e.waypoints) this.canvas.removeConnection(e.id);
        else this.canvas.removeShape(e.id);
      } catch {
        // already removed (e.g. edge on a removed shape) — ignore
      }
    }
  }
}
