import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type BaseLayouter from 'diagram-js/lib/layout/BaseLayouter';
import type { Element, Root } from 'diagram-js/lib/model/Types';
import type { Point } from 'diagram-js/lib/util/Types';
import type { MapConfig, MapSize, WardleyMap } from '@miragon/wardley-schema-model';
import { withoutRawStatements } from '@miragon/wardley-dsl';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type WardleyExporter from '../io/WardleyExporter.js';
import { ROOT_ID, type RootBusinessObject } from '../io/index.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';
import type { LivePreview } from '../live-preview/index.js';
import { isWardleyConnection, isWardleyShape, type WardleyShape } from '../model/di-types.js';

export type WardleyRoot = Root & { businessObject?: RootBusinessObject };

interface ShapeGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly drawingPoints?: Array<{ x: number; y: number }>;
}

/** Exact pixel state of the map, to undo a live preview without any rounding or clamping. */
export interface ProjectionSnapshot {
  readonly businessObject: RootBusinessObject;
  readonly shapes: ReadonlyMap<string, ShapeGeometry>;
  readonly waypoints: ReadonlyMap<string, Point[]>;
}

/** `config` with `size` set, or without the key when `size` is undefined. */
export function configWithSize(config: MapConfig, size: MapSize | undefined): MapConfig {
  const { size: _previous, ...rest } = config;
  return size ? { ...rest, size: { width: size.width, height: size.height } } : rest;
}

/**
 * The imported Wardley root, or undefined before the first import. Unlike
 * `canvas.getRootElement()` this never creates diagram-js's implicit root, which the next
 * import's `clear()` would remove and so break `setRootElement`.
 */
export function wardleyRootOf(canvas: Canvas): WardleyRoot | undefined {
  return canvas.getRootElements().find((root) => root.id === ROOT_ID) as WardleyRoot | undefined;
}

/**
 * `rawPassthrough` without unreadable `size` statements: once the map writes a valid size, a kept
 * one would be written after it, and OWM lets the last size line win. Comment text is never dropped.
 */
export function withoutRawSizeStatements(
  rawPassthrough: readonly string[] | undefined,
): readonly string[] | undefined {
  return withoutRawStatements(rawPassthrough, 'size');
}

/**
 * Re-projects the live shapes onto a new plot size in place — no re-import, so the shape objects,
 * the selection and the undo history survive. The normalized model is the truth; every element is
 * placed by the same factory projection the importer uses (P7), so a resize looks exactly like a
 * fresh import at the new size.
 */
export default class MapProjection {
  static $inject = [
    'canvas',
    'elementRegistry',
    'evolutionGrid',
    'wardleyElementFactory',
    'wardleyExporter',
    'layouter',
    'eventBus',
    'wardleyLivePreview',
  ];

  constructor(
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    private readonly grid: EvolutionGrid,
    private readonly factory: WardleyElementFactory,
    private readonly exporter: WardleyExporter,
    private readonly layouter: BaseLayouter,
    private readonly eventBus: EventBus,
    private readonly livePreview: LivePreview,
  ) {}

  /** The Wardley root, or undefined before the first import. */
  root(): WardleyRoot | undefined {
    const root = wardleyRootOf(this.canvas);
    return root?.businessObject ? root : undefined;
  }

  /** The normalized truth, read under the CURRENT grid (drawings keep px-relative points). */
  captureModel(): WardleyMap {
    return this.exporter.export();
  }

  /**
   * Stores `businessObject` on the root, redraws the grid for its config and re-projects every
   * element of `model` onto it. Fires `wardley.config.changed`; returns the changed elements so
   * the caller (command stack or live preview) can redraw them.
   */
  apply(
    businessObject: RootBusinessObject,
    model: WardleyMap = this.captureModel(),
    options: { transient?: boolean } = {},
  ): Element[] {
    const root = this.root();
    if (!root) return [];
    if (options.transient) this.livePreview.begin('size');
    root.businessObject = businessObject;
    this.grid.configure(businessObject.config);
    this.grid.render();

    const changed: Element[] = [];
    for (const element of model.elements) {
      const shape = this.elementRegistry.get(element.id);
      if (!isWardleyShape(shape)) continue;
      const template = this.factory.createFromModel(element);
      if (!template) continue;
      assignGeometry(shape, template);
      changed.push(shape);
    }
    changed.push(...this.layoutConnections());
    this.fireConfigChanged(businessObject.config, options.transient === true);
    return changed;
  }

  snapshot(): ProjectionSnapshot | undefined {
    const root = this.root();
    if (!root?.businessObject) return undefined;
    const shapes = new Map<string, ShapeGeometry>();
    const waypoints = new Map<string, Point[]>();
    for (const element of this.elementRegistry.getAll()) {
      if (isWardleyShape(element)) {
        shapes.set(element.id, {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          ...(element.drawingPoints
            ? { drawingPoints: element.drawingPoints.map((point) => ({ ...point })) }
            : {}),
        });
      } else if (isWardleyConnection(element)) {
        waypoints.set(
          element.id,
          element.waypoints.map((point) => ({ x: point.x, y: point.y })),
        );
      }
    }
    return { businessObject: root.businessObject, shapes, waypoints };
  }

  /**
   * Puts the size and every element's geometry back exactly as they were when `snapshot` was
   * taken. The rest of the root stays: an axis-label preview opened since then is no part of it.
   */
  restore(snapshot: ProjectionSnapshot, options: { transient?: boolean } = {}): Element[] {
    const root = this.root();
    const businessObject = this.withSize(snapshot.businessObject.config.size);
    if (!root || !businessObject) return [];
    root.businessObject = businessObject;
    this.grid.configure(businessObject.config);
    this.grid.render();
    const changed: Element[] = [];
    for (const [id, geometry] of snapshot.shapes) {
      const shape = this.elementRegistry.get(id);
      if (!isWardleyShape(shape)) continue;
      assignGeometry(shape, geometry);
      changed.push(shape);
    }
    for (const [id, points] of snapshot.waypoints) {
      const connection = this.elementRegistry.get(id);
      if (!isWardleyConnection(connection)) continue;
      connection.waypoints = points.map((point) => ({ ...point }));
      changed.push(connection);
    }
    this.livePreview.end('size');
    this.fireConfigChanged(businessObject.config, options.transient === true);
    return changed;
  }

  /**
   * The live root with `size` set (removed when undefined), for a size preview; undefined before
   * the first import.
   */
  withSize(size: MapSize | undefined): RootBusinessObject | undefined {
    const businessObject = this.root()?.businessObject;
    return (
      businessObject && { ...businessObject, config: configWithSize(businessObject.config, size) }
    );
  }

  /** `transient` marks a live preview that is not part of the document (yet). */
  private fireConfigChanged(config: MapConfig, transient: boolean): void {
    this.eventBus.fire('wardley.config.changed', { config, ...(transient ? { transient } : {}) });
  }

  /** Redraws elements changed outside the command stack (the live preview). */
  redraw(elements: readonly Element[]): void {
    for (const element of elements) this.eventBus.fire('element.changed', { element });
  }

  private layoutConnections(): Element[] {
    const connections: Element[] = [];
    for (const element of this.elementRegistry.getAll()) {
      if (!isWardleyConnection(element)) continue;
      element.waypoints = this.layouter.layoutConnection(element);
      connections.push(element);
    }
    return connections;
  }
}

function assignGeometry(shape: WardleyShape, geometry: ShapeGeometry): void {
  shape.x = geometry.x;
  shape.y = geometry.y;
  shape.width = geometry.width;
  shape.height = geometry.height;
  if (geometry.drawingPoints) {
    shape.drawingPoints = geometry.drawingPoints.map((point) => ({ ...point }));
  }
}
