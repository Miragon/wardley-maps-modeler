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
  NoteElement,
  PipelineElement,
  SubmapElement,
} from '@miragon/wardley-schema-model';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import { NODE_SIZE, PIPELINE_HEIGHT, noteMetrics } from '../draw/styles.js';
import type { WardleyConnection, WardleyShape } from './di-types.js';

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
   * collisions on serialize/re-import and lose edges (lines).
   *
   * @param excludeId optional ID of the element currently being renamed (does NOT count its own
   *        current name as a collision — otherwise every rename would add a suffix).
   */
  uniqueLabel(base: string, excludeId?: string): string {
    const taken = new Set<string>();
    for (const el of this.elementRegistry.getAll()) {
      if (excludeId && el.id === excludeId) continue;
      const lbl = (el as { wardleyLabel?: unknown }).wardleyLabel;
      if (typeof lbl === 'string') taken.add(lbl);
    }
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
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
    // Enforce a unique label -> lossless DSL round-trip (see uniqueLabel).
    const label = this.uniqueLabel(rawLabel);
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
      waypoints: [centerOf(source), centerOf(target)],
      wardleyType: type,
      bidirectional,
      ...(flowValue ? { flowValue } : {}),
      ...(edge.label ? { linkLabel: edge.label } : {}),
      businessObject: edge,
    });
    return conn as unknown as WardleyConnection;
  }
}

function centerOf(shape: WardleyShape): { x: number; y: number } {
  // Pipelines dock at their ■ anchor (top-edge center), not at the box center.
  if (shape.wardleyType === 'pipeline') return { x: shape.x + shape.width / 2, y: shape.y };
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}
