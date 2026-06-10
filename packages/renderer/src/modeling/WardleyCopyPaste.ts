import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type Create from 'diagram-js/lib/features/create/Create';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Mouse from 'diagram-js/lib/features/mouse/Mouse';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Element, Shape } from 'diagram-js/lib/model/Types';
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from '../model/di-types.js';

/** Offset (px) accumulated per paste operation. */
const PASTE_OFFSET = 24;

interface ShapeSnapshot {
  readonly props: Record<string, unknown>;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}
interface ConnectionSnapshot {
  readonly sourceIdx: number;
  readonly targetIdx: number;
  readonly props: Record<string, unknown>;
}

/** Wardley properties carried along when copying (geometry handled separately). */
const SHAPE_PROPS = [
  'wardleyType',
  'evolution',
  'visibility',
  'decorators',
  'movement',
  'evolutionStart',
  'evolutionEnd',
  'annotationNumber',
  'attitudeKind',
  'corner2',
  'acceleratorDirection',
  'labelOffset',
  'color',
  'drawingPoints',
  'closed',
  'strokeStyle',
] as const;
const CONNECTION_PROPS = ['wardleyType', 'bidirectional', 'flowValue', 'linkLabel'] as const;

function snapshotProps(
  el: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = el[key];
    if (value !== undefined) out[key] = structuredClone(value);
  }
  return out;
}

/**
 * Custom copy/paste for Wardley shapes: copies the selection including the connections BETWEEN
 * selected shapes and assigns unique labels (the DSL references by name!).
 * Paste attaches the clones to the cursor like palette create (live preview, click places,
 * Escape cancels); duplicate inserts immediately with an offset. Either way the insert is ONE
 * undoable `elements.create` command.
 */
export default class WardleyCopyPaste {
  static $inject = [
    'selection',
    'modeling',
    'elementFactory',
    'elementRegistry',
    'canvas',
    'create',
    'mouse',
  ];

  private clipboard: { shapes: ShapeSnapshot[]; connections: ConnectionSnapshot[] } | null = null;
  private pasteCount = 0;

  constructor(
    private readonly selection: Selection,
    private readonly modeling: Modeling,
    private readonly elementFactory: ElementFactory,
    private readonly elementRegistry: ElementRegistry,
    private readonly canvas: Canvas,
    private readonly create: Create,
    private readonly mouse: Mouse,
  ) {}

  /** Copies the current selection. Returns false if nothing copyable is selected. */
  copy(): boolean {
    const selected = this.selection.get() as Element[];
    const shapes = selected.filter((el) => isWardleyShape(el)) as WardleyShape[];
    if (!shapes.length) return false;

    const indexOf = new Map<WardleyShape, number>(shapes.map((s, i) => [s, i]));
    const connections: ConnectionSnapshot[] = [];
    const seen = new Set<WardleyConnection>();
    for (const shape of shapes) {
      for (const conn of [...(shape.incoming ?? []), ...(shape.outgoing ?? [])]) {
        if (!isWardleyConnection(conn) || seen.has(conn)) continue;
        const sourceIdx = indexOf.get(conn.source as unknown as WardleyShape);
        const targetIdx = indexOf.get(conn.target as unknown as WardleyShape);
        if (sourceIdx === undefined || targetIdx === undefined) continue;
        seen.add(conn);
        connections.push({
          sourceIdx,
          targetIdx,
          props: snapshotProps(conn as unknown as Record<string, unknown>, CONNECTION_PROPS),
        });
      }
    }

    this.clipboard = {
      shapes: shapes.map((s) => ({
        props: snapshotProps(s as unknown as Record<string, unknown>, SHAPE_PROPS),
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        label: s.wardleyLabel ?? '',
      })),
      connections,
    };
    this.pasteCount = 0;
    return true;
  }

  /**
   * Paste with placement preview: the clones attach to the cursor exactly like palette create —
   * click places them, Escape cancels. Falls back to an offset insert when the mouse position
   * is unknown (e.g. paste before the pointer ever entered the canvas).
   */
  paste(): boolean {
    if (!this.clipboard?.shapes.length) return false;
    const clones = this.buildClones();
    const lastMove = this.mouse.getLastMoveEvent();
    if (lastMove) {
      this.create.start(lastMove, [...clones.shapes, ...clones.connections] as Element[]);
      return true;
    }
    return this.insertWithOffset(clones);
  }

  /** Copy + immediate offset insert of the selection (Ctrl+D) — no placement step. */
  duplicate(): boolean {
    if (!this.copy()) return false;
    return this.insertWithOffset(this.buildClones());
  }

  /** Builds fresh clone elements (unique labels, internal connections rewired). */
  private buildClones(): { shapes: Shape[]; connections: Element[] } {
    const clipboard = this.clipboard!;
    const labels = this.uniqueLabels(clipboard.shapes.map((s) => s.label));
    const shapes = clipboard.shapes.map((snap, i) =>
      this.elementFactory.createShape({
        ...structuredClone(snap.props),
        x: snap.x,
        y: snap.y,
        width: snap.width,
        height: snap.height,
        wardleyLabel: labels[i]!,
        ...(snap.props['wardleyType'] === 'pipeline' || snap.props['wardleyType'] === 'attitude'
          ? { isFrame: true }
          : {}),
      }),
    );
    const connections = clipboard.connections.map((c) =>
      this.elementFactory.createConnection({
        ...structuredClone(c.props),
        source: shapes[c.sourceIdx]!,
        target: shapes[c.targetIdx]!,
        waypoints: [center(shapes[c.sourceIdx]!), center(shapes[c.targetIdx]!)],
      }),
    );
    return { shapes, connections: connections as Element[] };
  }

  /** One `elements.create` command = one undo step; position = group center + offset. */
  private insertWithOffset(clones: { shapes: Shape[]; connections: Element[] }): boolean {
    this.pasteCount++;
    const offset = PASTE_OFFSET * this.pasteCount;
    const bbox = groupBBox(clones.shapes);
    const created = this.modeling.createElements(
      [...clones.shapes, ...clones.connections] as Element[],
      { x: bbox.cx + offset, y: bbox.cy + offset },
      this.canvas.getRootElement() as Shape,
    );
    this.selection.select(created as Element[]);
    return true;
  }

  /** Labels unique against the registry AND within the paste batch. */
  private uniqueLabels(bases: string[]): string[] {
    const taken = new Set<string>();
    for (const el of this.elementRegistry.getAll()) {
      const lbl = (el as { wardleyLabel?: unknown }).wardleyLabel;
      if (typeof lbl === 'string') taken.add(lbl);
    }
    return bases.map((base) => {
      let label = base;
      let i = 2;
      while (taken.has(label)) label = `${base} ${i++}`;
      taken.add(label);
      return label;
    });
  }
}

function center(s: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
} {
  return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
}

function groupBBox(shapes: Array<{ x: number; y: number; width: number; height: number }>): {
  cx: number;
  cy: number;
} {
  const minX = Math.min(...shapes.map((s) => s.x));
  const minY = Math.min(...shapes.map((s) => s.y));
  const maxX = Math.max(...shapes.map((s) => s.x + s.width));
  const maxY = Math.max(...shapes.map((s) => s.y + s.height));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
