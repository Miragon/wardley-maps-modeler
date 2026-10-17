import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type {
  AcceleratorDirection,
  AcceleratorElement,
  AnchorElement,
  AnnotationElement,
  AttitudeElement,
  AttitudeKind,
  ComponentElement,
  DrawingElement,
  MapEdge,
  MapElement,
  NoteElement,
  PipelineElement,
  SubmapElement,
} from '@miragon/wardley-schema-model';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import { NODE_SIZE, PIPELINE_HEIGHT, noteMetrics } from '../draw/styles.js';
import { connectionAnchorOf } from '../layout/index.js';
import type { WardleyConnection, WardleyShape } from './di-types.js';

/** Element types that edges and DSL lines reference by name — their labels must be unique. */
const LINKABLE_TYPES: ReadonlySet<string> = new Set([
  'component',
  'anchor',
  'submap',
  'pipeline',
  'accelerator',
]);

function isLinkableType(type: unknown): boolean {
  return typeof type === 'string' && LINKABLE_TYPES.has(type);
}

/**
 * First label not in `taken`: `base` itself, otherwise the next counter. A base that already ends
 * in a counter continues it ('Cup 2' -> 'Cup 3') instead of stacking ('Cup 2 2').
 */
export function nextFreeLabel(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  const counterMatch = / (\d+)$/.exec(base);
  const stem = counterMatch ? base.slice(0, counterMatch.index) : base;
  let counter = counterMatch ? Number(counterMatch[1]) + 1 : 2;
  while (taken.has(`${stem} ${counter}`)) counter++;
  return `${stem} ${counter}`;
}

export interface CreateNewExtra {
  attitudeKind?: AttitudeKind;
  acceleratorDirection?: AcceleratorDirection;
  annotationNumber?: number;
  market?: boolean;
  ecosystem?: boolean;
}

/**
 * Creates diagram-js runtime elements with Wardley markers. Projects normalized coordinates to
 * pixels via the SINGLE math source (EvolutionGrid, P7).
 */
export default class WardleyElementFactory {
  static $inject = ['elementFactory', 'evolutionGrid', 'elementRegistry'];

  constructor(
    private readonly elementFactory: ElementFactory,
    private readonly grid: EvolutionGrid,
    private readonly elementRegistry: ElementRegistry,
  ) {}

  /**
   * Returns a unique label: `base`, otherwise `base 2`, `base 3`, … Unique labels are mandatory
   * because the OWM DSL references elements BY THEIR NAME — duplicate names would cause ID
   * collisions on serialize/re-import and lose edges (lines). Only linkable elements count:
   * notes and regions are never referenced, so their text must not force a suffix.
   *
   * @param excludeId optional ID of the element currently being renamed (does NOT count its own
   *        current name as a collision — otherwise every rename would add a suffix).
   */
  uniqueLabel(base: string, excludeId?: string): string {
    return nextFreeLabel(
      base,
      this.takenLinkableLabels(excludeId, this.pairableTypeFor(excludeId)),
    );
  }

  /**
   * Batch variant for pasted copies: linkable labels unique against the map AND each other;
   * everything else keeps its text.
   */
  uniqueLabels(entries: ReadonlyArray<{ type: unknown; label: string }>): string[] {
    const taken = this.takenLinkableLabels();
    return entries.map(({ type, label }) => {
      if (!isLinkableType(type)) return label;
      const unique = nextFreeLabel(label, taken);
      taken.add(unique);
      return unique;
    });
  }

  /** Whether elements of `type` are referenced by name (and so need a unique label). */
  isLinkable(type: unknown): boolean {
    return isLinkableType(type);
  }

  /**
   * @param pairableType elements of this type that still lack their OWM partner do not block a
   *        name: a standalone component may take the name of a pipeline without an anchor (and so
   *        anchor it), and such a pipeline may take the name of a free standalone component.
   */
  private takenLinkableLabels(excludeId?: string, pairableType?: 'component' | 'pipeline') {
    const taken = new Set<string>();
    for (const el of this.elementRegistry.getAll()) {
      if (excludeId && el.id === excludeId) continue;
      const { wardleyType, wardleyLabel } = el as { wardleyType?: unknown; wardleyLabel?: unknown };
      if (!isLinkableType(wardleyType) || typeof wardleyLabel !== 'string') continue;
      if (wardleyType === pairableType && this.isUnpaired(el as WardleyShape)) continue;
      taken.add(wardleyLabel);
    }
    return taken;
  }

  /** Which partner type the element being renamed may share its new name with. */
  private pairableTypeFor(excludeId?: string): 'component' | 'pipeline' | undefined {
    const renamed = excludeId
      ? (this.elementRegistry.getAll().find((el) => el.id === excludeId) as
          WardleyShape | undefined)
      : undefined;
    if (!renamed || !this.isUnpaired(renamed)) return undefined;
    if (renamed.wardleyType === 'component') return 'pipeline';
    if (renamed.wardleyType === 'pipeline') return 'component';
    return undefined;
  }

  /**
   * A pipeline without an anchor component, or a standalone (non-member) component that anchors
   * no pipeline. Members never pair: they belong to their own pipeline.
   */
  private isUnpaired(shape: WardleyShape): boolean {
    const shapes = this.elementRegistry.getAll() as WardleyShape[];
    if (shape.wardleyType === 'pipeline') {
      return !shapes.some(
        (other) =>
          other.wardleyType === 'component' &&
          other.wardleyLabel === shape.wardleyLabel &&
          other.pipelineId !== shape.id,
      );
    }
    if (shape.wardleyType !== 'component' || shape.pipelineId) return false;
    return !shapes.some(
      (other) => other.wardleyType === 'pipeline' && other.wardleyLabel === shape.wardleyLabel,
    );
  }

  /** Next free annotation number (max + 1) — palette annotations therefore never collide. */
  private nextAnnotationNumber(): number {
    let max = 0;
    for (const el of this.elementRegistry.getAll()) {
      const n = (el as { annotationNumber?: unknown }).annotationNumber;
      if (typeof n === 'number' && n > max) max = n;
    }
    return max + 1;
  }

  createComponent(el: ComponentElement): WardleyShape {
    const shape = this.node(
      'component',
      el.id,
      el.label,
      el.position.visibility,
      el.position.evolution,
      el,
      {
        ...(el.decorators ? { decorators: el.decorators } : {}),
        ...(el.movement ? { movement: el.movement } : {}),
        ...(el.labelOffset ? { labelOffset: el.labelOffset } : {}),
        ...(el.pipelineId ? { pipelineId: el.pipelineId } : {}),
      },
    );
    // Pipeline children sit INSIDE the box (whose top edge is the anchor line) — shift their
    // pixel position to the box center; visibility (model truth) stays the pipeline's.
    if (el.pipelineId) shape.y += PIPELINE_HEIGHT / 2;
    return shape;
  }

  createAnchor(el: AnchorElement): WardleyShape {
    return this.node('anchor', el.id, el.label, el.position.visibility, el.position.evolution, el, {
      ...(el.labelOffset ? { labelOffset: el.labelOffset } : {}),
    });
  }

  createNote(el: NoteElement): WardleyShape {
    // Note box grows with the (possibly multiline) text -> move/click hitbox covers the text.
    // Centered on the position (consistent with the center back-calculation on move).
    const { width, height } = noteMetrics(el.label);
    const center = this.grid.toCanvas(el.position);
    const shape = this.elementFactory.createShape({
      id: el.id,
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      wardleyType: 'note',
      wardleyLabel: el.label,
      evolution: el.position.evolution,
      visibility: el.position.visibility,
      businessObject: el,
      ...(el.color ? { color: el.color } : {}),
    });
    return shape as unknown as WardleyShape;
  }

  createPipeline(el: PipelineElement): WardleyShape {
    const start = this.grid.toCanvas({
      visibility: el.position.visibility,
      evolution: el.evolutionStart,
    });
    const end = this.grid.toCanvas({
      visibility: el.position.visibility,
      evolution: el.evolutionEnd,
    });
    const width = Math.max(end.x - start.x, 2);
    const shape = this.elementFactory.createShape({
      id: el.id,
      x: start.x,
      // The box's TOP EDGE is the anchor line — the ■ square straddles it (drawn by the renderer).
      y: start.y,
      width,
      height: PIPELINE_HEIGHT,
      wardleyType: 'pipeline',
      wardleyLabel: el.label,
      evolution: el.position.evolution,
      visibility: el.position.visibility,
      evolutionStart: el.evolutionStart,
      evolutionEnd: el.evolutionEnd,
      // Frame: only the border is clickable -> inner clicks reach the nodes (diagram-js isFrame).
      isFrame: true,
      businessObject: el,
      ...(el.color ? { color: el.color } : {}),
    });
    return shape as unknown as WardleyShape;
  }

  createAnnotation(el: AnnotationElement): WardleyShape {
    const pos = el.positions[0] ?? el.position;
    return this.node('annotation', el.id, el.text, pos.visibility, pos.evolution, el, {
      annotationNumber: el.number,
    });
  }

  createAccelerator(el: AcceleratorElement): WardleyShape {
    return this.node(
      'accelerator',
      el.id,
      el.label,
      el.position.visibility,
      el.position.evolution,
      el,
      {
        acceleratorDirection: el.direction,
      },
    );
  }

  createAttitude(el: AttitudeElement): WardleyShape {
    // OWM canon: position = top-left corner, corner2 = bottom-right corner (both normalized).
    const a = this.grid.toCanvas(el.position);
    const b = this.grid.toCanvas(el.corner2);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const shape = this.elementFactory.createShape({
      id: el.id,
      x,
      y,
      width: Math.max(Math.abs(b.x - a.x), 4),
      height: Math.max(Math.abs(b.y - a.y), 4),
      wardleyType: 'attitude',
      wardleyLabel: el.label || el.kind,
      attitudeKind: el.kind,
      evolution: el.position.evolution,
      visibility: el.position.visibility,
      corner2: el.corner2,
      isFrame: true,
      businessObject: el,
      ...(el.color ? { color: el.color } : {}),
    });
    return shape as unknown as WardleyShape;
  }

  createSubmap(el: SubmapElement): WardleyShape {
    return this.node('submap', el.id, el.label, el.position.visibility, el.position.evolution, el);
  }

  createDrawing(el: DrawingElement): WardleyShape {
    const canvasPoints = el.points.map((p) => this.grid.toCanvas(p));
    return this.drawingFromCanvasPoints(canvasPoints, {
      id: el.id,
      ...(el.closed ? { closed: true } : {}),
      ...(el.strokeStyle ? { strokeStyle: el.strokeStyle } : {}),
      ...(el.color ? { color: el.color } : {}),
      businessObject: el,
    });
  }

  /**
   * The shape for any model element, projected with the current grid. Shared by the importer and
   * the in-place map resize, so both place every element type identically.
   */
  createFromModel(el: MapElement): WardleyShape | undefined {
    switch (el.elementType) {
      case 'component':
        return this.createComponent(el);
      case 'anchor':
        return this.createAnchor(el);
      case 'note':
        return this.createNote(el);
      case 'pipeline':
        return this.createPipeline(el);
      case 'annotation':
        return this.createAnnotation(el);
      case 'attitude':
        return this.createAttitude(el);
      case 'accelerator':
        return this.createAccelerator(el);
      case 'submap':
        return this.createSubmap(el);
      case 'drawing':
        return this.createDrawing(el);
      default: {
        const exhaustive: never = el;
        void exhaustive;
        return undefined;
      }
    }
  }

  /** Builds a drawing shape from ABSOLUTE canvas points (bbox shape + relative points). */
  drawingFromCanvasPoints(
    canvasPoints: ReadonlyArray<{ x: number; y: number }>,
    extra: {
      id?: string;
      closed?: boolean;
      strokeStyle?: DrawingElement['strokeStyle'];
      color?: string;
      businessObject?: DrawingElement;
    } = {},
  ): WardleyShape {
    const xs = canvasPoints.map((p) => p.x);
    const ys = canvasPoints.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(Math.max(...xs) - x, 4);
    const height = Math.max(Math.max(...ys) - y, 4);
    const first = canvasPoints[0]!;
    const firstNorm = this.grid.fromCanvas(first);
    const shape = this.elementFactory.createShape({
      ...(extra.id ? { id: extra.id } : {}),
      x,
      y,
      width,
      height,
      wardleyType: 'drawing',
      wardleyLabel: '',
      evolution: firstNorm.evolution,
      visibility: firstNorm.visibility,
      drawingPoints: canvasPoints.map((p) => ({ x: p.x - x, y: p.y - y })),
      ...(extra.closed ? { closed: true } : {}),
      ...(extra.strokeStyle ? { strokeStyle: extra.strokeStyle } : {}),
      ...(extra.color ? { color: extra.color } : {}),
      ...(extra.businessObject ? { businessObject: extra.businessObject } : {}),
    });
    return shape as unknown as WardleyShape;
  }

  createNew(
    type: WardleyShape['wardleyType'],
    rawLabel: string,
    extra: CreateNewExtra = {},
  ): WardleyShape {
    // Enforce a unique label -> lossless DSL round-trip (see uniqueLabel). Attitude regions are
    // unlabelled like in OWM: their title is the canonical kind name.
    const label =
      type === 'attitude'
        ? (extra.attitudeKind ?? 'pioneers')
        : isLinkableType(type)
          ? this.uniqueLabel(rawLabel)
          : rawLabel;
    if (type === 'pipeline') {
      const shape = this.elementFactory.createShape({
        width: 200,
        height: PIPELINE_HEIGHT,
        wardleyType: 'pipeline',
        wardleyLabel: label,
        evolution: 0.5,
        visibility: 0.5,
        evolutionStart: 0.4,
        evolutionEnd: 0.6,
        isFrame: true,
      });
      return shape as unknown as WardleyShape;
    }
    if (type === 'attitude') {
      const shape = this.elementFactory.createShape({
        width: 180,
        height: 48,
        wardleyType: 'attitude',
        wardleyLabel: label,
        attitudeKind: extra.attitudeKind ?? 'pioneers',
        evolution: 0.5,
        visibility: 0.5,
        isFrame: true,
      });
      return shape as unknown as WardleyShape;
    }
    if (type === 'note') {
      const { width, height } = noteMetrics(label);
      const shape = this.elementFactory.createShape({
        width,
        height,
        wardleyType: 'note',
        wardleyLabel: label,
        evolution: 0.5,
        visibility: 0.5,
      });
      return shape as unknown as WardleyShape;
    }
    const decorators = extra.market
      ? { market: true }
      : extra.ecosystem
        ? { ecosystem: true }
        : undefined;
    // Annotations automatically get the next free number (instead of a fixed "1").
    const annotationNumber =
      type === 'annotation' ? (extra.annotationNumber ?? this.nextAnnotationNumber()) : undefined;
    const shape = this.elementFactory.createShape({
      width: NODE_SIZE,
      height: NODE_SIZE,
      wardleyType: type,
      wardleyLabel: label,
      evolution: 0.5,
      visibility: 0.5,
      ...(extra.acceleratorDirection ? { acceleratorDirection: extra.acceleratorDirection } : {}),
      ...(annotationNumber !== undefined ? { annotationNumber } : {}),
      ...(decorators ? { decorators } : {}),
    });
    return shape as unknown as WardleyShape;
  }

  createDependency(edge: MapEdge, source: WardleyShape, target: WardleyShape): WardleyConnection {
    return this.connection('dependency', edge, source, target);
  }

  createFlow(edge: MapEdge, source: WardleyShape, target: WardleyShape): WardleyConnection {
    const bidirectional = edge.edgeType === 'flow' && edge.bidirectional === true;
    return this.connection('flow', edge, source, target, bidirectional);
  }

  private node(
    type: WardleyShape['wardleyType'],
    id: string,
    label: string,
    visibility: number,
    evolution: number,
    businessObject: WardleyShape['businessObject'],
    extra: Partial<WardleyShape> = {},
  ): WardleyShape {
    const center = this.grid.toCanvas({ visibility, evolution });
    const color = (businessObject as { color?: string } | undefined)?.color;
    const shape = this.elementFactory.createShape({
      id,
      x: center.x - NODE_SIZE / 2,
      y: center.y - NODE_SIZE / 2,
      width: NODE_SIZE,
      height: NODE_SIZE,
      wardleyType: type,
      wardleyLabel: label,
      evolution,
      visibility,
      businessObject,
      ...(color ? { color } : {}),
      ...extra,
    });
    return shape as unknown as WardleyShape;
  }

  private connection(
    type: WardleyConnection['wardleyType'],
    edge: MapEdge,
    source: WardleyShape,
    target: WardleyShape,
    bidirectional = false,
  ): WardleyConnection {
    const flowValue = edge.edgeType === 'flow' ? edge.flowValue : undefined;
    const conn = this.elementFactory.createConnection({
      id: edge.id,
      source,
      target,
      waypoints: [connectionAnchorOf(source), connectionAnchorOf(target)],
      wardleyType: type,
      bidirectional,
      ...(flowValue ? { flowValue } : {}),
      ...(edge.label ? { linkLabel: edge.label } : {}),
      businessObject: edge,
    });
    return conn as unknown as WardleyConnection;
  }
}
