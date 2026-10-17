import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Shape } from 'diagram-js/lib/model/Types';
import { isComponent, isPipeline, isWardleyShape, type WardleyShape } from '../model/di-types.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import { MIN_EVOLVE_DELTA } from '../evolve/index.js';
import {
  centerOf,
  membersOf,
  pipelineAnchoredBy,
  pipelineAt,
  pipelineFollowers,
} from '../pipeline/index.js';
import type EvolutionGrid from './EvolutionGrid.js';

/** Commands whose handler changes the geometry of exactly one shape (`context.shape`). */
const SHAPE_GEOMETRY_COMMANDS = ['shape.move', 'shape.create', 'shape.resize'];
const GEOMETRY_COMMANDS = [...SHAPE_GEOMETRY_COMMANDS, 'elements.move', 'elements.create'];
const COMPONENT_LABEL_COMMANDS = ['shape.create', 'shape.delete', 'element.updateProperties'];

/** Runs before every other pre-execute listener, so nesting is known before anyone acts on it. */
const TOP_LEVEL_PRIORITY = 2000;
/** Below the pipeline group behavior (1500), which first extends the move closure by the members. */
const DELTA_CLAMP_PRIORITY = 1000;
/** diagram-js ResizeShapeHandler rejects anything smaller. */
const MIN_RESIZE_EXTENT = 10;
const EPSILON = 1e-6;

interface Point {
  x: number;
  y: number;
}

interface Bounds extends Point {
  width: number;
  height: number;
}

interface Range {
  min: number;
  max: number;
}

interface GeometryContext {
  shape?: unknown;
  shapes?: unknown[];
  elements?: unknown[];
  closure?: { allShapes: Record<string, unknown> };
  delta?: Point;
  newBounds?: Bounds;
  parent?: object & { parent?: unknown };
}

interface CommandEvent {
  command: string;
  context: GeometryContext;
}

/**
 * Keeps the normalized Wardley coordinates and the pixel geometry consistent across execute, undo
 * AND redo (concept doc §5.3). `EvolutionGrid` is the single source of math (P7).
 *
 * Two strictly separated parts, because diagram-js replays only `execute`/`revert` on redo and
 * skips every pre/post hook:
 *
 * 1. Derivation (`executed` + `reverted`): evolution, visibility, the pipeline range and the
 *    attitude corner are pure functions of the current geometry and membership. It never writes
 *    geometry, so replaying it on redo or undo always lands on the same model.
 * 2. Corrections (pre/post hooks of the outermost geometry command only): moves are clamped by
 *    replacing the command's delta before it runs, resizes by replacing its bounds; pipeline glue,
 *    membership changes and shifted evolve targets are nested commands. All of them join the same
 *    undo step and are replayed exactly on redo.
 *
 * Pipelines behave like groups: moving the box carries its members and its anchor component (the
 * pipeline group behavior adds them to the move), and moving the anchor component vertically
 * carries the box. A component dropped into a box joins it and is glued onto its row; dragging it
 * out ends the membership.
 */
export default class EvolutionConstraintBehavior extends CommandInterceptor {
  static override $inject = [
    'eventBus',
    'evolutionGrid',
    'elementRegistry',
    'canvas',
    'modeling',
    'wardleyModeling',
  ];

  private topLevelContext: GeometryContext | null = null;
  private readonly evolutionsBefore = new WeakMap<GeometryContext, Map<WardleyShape, number>>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly grid: EvolutionGrid,
    private readonly elementRegistry: ElementRegistry,
    private readonly canvas: Canvas,
    private readonly modeling: Modeling,
    private readonly wardleyModeling: WardleyModeling,
  ) {
    super(eventBus);

    const derive = (event: CommandEvent) => {
      for (const shape of directShapes(event.context)) this.deriveFromGeometry(shape);
    };
    this.executed(SHAPE_GEOMETRY_COMMANDS, derive);
    this.reverted(SHAPE_GEOMETRY_COMMANDS, derive);

    // Corrections issue nested geometry commands themselves; only the outermost one is corrected,
    // which also stops the recursion.
    this.preExecute(GEOMETRY_COMMANDS, TOP_LEVEL_PRIORITY, (event: CommandEvent) => {
      if (!this.topLevelContext) this.topLevelContext = event.context;
    });
    eventBus.on('commandStack.changed', () => {
      this.topLevelContext = null;
    });

    this.preExecute('shape.move', (event: CommandEvent) => {
      const { context } = event;
      if (!this.isTopLevel(context) || !isWardleyShape(context.shape) || !context.delta) return;
      const moved = [context.shape, ...this.followersOf(context.shape)];
      this.rememberEvolutions(context, moved);
      context.delta = this.clampDelta(context.delta, moved);
    });
    this.preExecuted('elements.move', DELTA_CLAMP_PRIORITY, (event: CommandEvent) => {
      const { context } = event;
      if (!this.isTopLevel(context) || !context.delta) return;
      const moved = closureShapes(context);
      this.rememberEvolutions(context, moved);
      // A fresh object: the same delta is later handed to every nested shape.move of the closure.
      context.delta = this.clampDelta(context.delta, moved);
    });
    this.preExecute(['shape.create', 'elements.create'], (event: CommandEvent) => {
      const { context } = event;
      // Wardley shapes never nest: a drop onto another element must not make it the parent.
      if (context.parent?.parent) context.parent = this.canvas.getRootElement();
      if (this.isTopLevel(context)) this.rememberEvolutions(context, directShapes(context));
    });
    this.preExecute('shape.resize', (event: CommandEvent) => {
      const { context } = event;
      const shape = context.shape;
      if (!isWardleyShape(shape) || !context.newBounds) return;
      if (shape.wardleyType === 'pipeline') {
        context.newBounds = this.horizontalPipelineBounds(shape, context.newBounds);
      } else if (shape.wardleyType === 'attitude') {
        context.newBounds = this.boundsInsidePlot(context.newBounds);
      }
    });

    this.postExecuted(GEOMETRY_COMMANDS, (event: CommandEvent) => {
      if (event.context !== this.topLevelContext) return;
      try {
        this.applyCorrections(event.command, event.context);
      } finally {
        this.evolutionsBefore.delete(event.context);
        this.topLevelContext = null;
      }
    });

    // The pipeline label is suppressed when a same-named component exists — whenever a
    // component is created/deleted/renamed, re-render the pipelines so labels toggle.
    const refreshPipelineLabels = (event: {
      context?: { shape?: unknown; element?: unknown; elements?: unknown[] };
    }) => {
      const candidates = [
        event.context?.shape,
        event.context?.element,
        ...(event.context?.elements ?? []),
      ];
      if (!candidates.some((element) => isComponent(element))) return;
      for (const pipeline of this.elementRegistry.filter((element) => isPipeline(element))) {
        this.eventBus.fire('element.changed', { element: pipeline });
      }
    };
    this.executed(COMPONENT_LABEL_COMMANDS, refreshPipelineLabels);
    this.reverted(COMPONENT_LABEL_COMMANDS, refreshPipelineLabels);
  }

  private isTopLevel(context: GeometryContext): boolean {
    return context === this.topLevelContext;
  }

  private followersOf(shape: WardleyShape): WardleyShape[] {
    return isPipeline(shape) ? pipelineFollowers(this.elementRegistry, shape) : [];
  }

  private rememberEvolutions(context: GeometryContext, shapes: WardleyShape[]): void {
    this.evolutionsBefore.set(context, new Map(shapes.map((shape) => [shape, shape.evolution])));
  }

  // --- derivation (pure: geometry + membership -> normalized model) ----------------------------

  private deriveFromGeometry(shape: WardleyShape): void {
    switch (shape.wardleyType) {
      case 'pipeline':
        this.derivePipeline(shape);
        return;
      case 'attitude': {
        // Attitude position = anchor point (top left), corner2 = bottom-right corner (OWM semantics).
        const topLeft = this.grid.fromCanvas({ x: shape.x, y: shape.y });
        shape.evolution = topLeft.evolution;
        shape.visibility = topLeft.visibility;
        shape.corner2 = this.grid.fromCanvas({
          x: shape.x + shape.width,
          y: shape.y + shape.height,
        });
        return;
      }
      case 'drawing': {
        const first = shape.drawingPoints?.[0] ?? { x: 0, y: 0 };
        const coordinate = this.grid.fromCanvas({ x: shape.x + first.x, y: shape.y + first.y });
        shape.evolution = coordinate.evolution;
        shape.visibility = coordinate.visibility;
        return;
      }
      default: {
        const coordinate = this.grid.fromCanvas(centerOf(shape));
        shape.evolution = coordinate.evolution;
        // Members share their pipeline's visibility; they are drawn centred in the box below it.
        const pipeline = this.pipelineOfMember(shape);
        shape.visibility = pipeline ? this.pipelineVisibility(pipeline) : coordinate.visibility;
      }
    }
  }

  private derivePipeline(pipeline: WardleyShape): void {
    // The anchor line (■ on the box) is the box's TOP EDGE.
    const start = this.grid.fromCanvas({ x: pipeline.x, y: pipeline.y });
    const end = this.grid.fromCanvas({ x: pipeline.x + pipeline.width, y: pipeline.y });
    const [evolutionStart, evolutionEnd] = clampRange(start.evolution, end.evolution);
    pipeline.evolutionStart = evolutionStart;
    pipeline.evolutionEnd = evolutionEnd;
    pipeline.evolution = clamp01((evolutionStart + evolutionEnd) / 2);
    pipeline.visibility = start.visibility;
    for (const member of membersOf(this.elementRegistry, pipeline)) {
      member.visibility = pipeline.visibility;
    }
  }

  private pipelineOfMember(shape: WardleyShape): WardleyShape | undefined {
    if (!isComponent(shape) || !shape.pipelineId) return undefined;
    const pipeline = this.elementRegistry.get(shape.pipelineId);
    return isPipeline(pipeline) ? pipeline : undefined;
  }

  private pipelineVisibility(pipeline: WardleyShape): number {
    return this.grid.fromCanvas({ x: pipeline.x, y: pipeline.y }).visibility;
  }

  // --- corrections (outermost command only, recorded as nested commands) -----------------------

  private applyCorrections(command: string, context: GeometryContext): void {
    switch (command) {
      case 'shape.move': {
        const shape = context.shape;
        if (!isWardleyShape(shape)) return;
        const delta = context.delta ?? { x: 0, y: 0 };
        const followers = this.followersOf(shape);
        for (const follower of followers) this.moveBy(follower, delta);
        this.completeMove([shape, ...followers], delta, context);
        return;
      }
      case 'elements.move':
        this.completeMove(closureShapes(context), context.delta ?? { x: 0, y: 0 }, context);
        return;
      case 'shape.create':
      case 'elements.create': {
        const created = directShapes(context);
        const correction = this.clampDelta({ x: 0, y: 0 }, created);
        for (const shape of created) this.moveBy(shape, correction);
        this.reconcileMembership(created);
        this.shiftPassedEvolveTargets(context);
        return;
      }
      case 'shape.resize':
        if (isPipeline(context.shape)) this.releaseMembersOutside(context.shape);
        return;
    }
  }

  private completeMove(moved: WardleyShape[], delta: Point, context: GeometryContext): void {
    this.carryPipelinesOfMovedAnchors(moved, delta);
    this.reconcileMembership(moved);
    this.shiftPassedEvolveTargets(context);
  }

  /** Moving an anchor component up or down takes its pipeline box and the members along. */
  private carryPipelinesOfMovedAnchors(moved: WardleyShape[], delta: Point): void {
    if (Math.abs(delta.y) < EPSILON) return;
    const movedShapes = new Set<WardleyShape>(moved);
    for (const shape of moved) {
      const pipeline = pipelineAnchoredBy(this.elementRegistry, shape);
      if (!pipeline || movedShapes.has(pipeline)) continue;
      const group = [
        pipeline,
        ...membersOf(this.elementRegistry, pipeline).filter((member) => !movedShapes.has(member)),
      ];
      const verticalDelta = this.clampDelta({ x: 0, y: delta.y }, group);
      for (const groupShape of group) {
        this.moveBy(groupShape, verticalDelta);
        movedShapes.add(groupShape);
      }
    }
  }

  /**
   * A moved component whose centre lands in a pipeline box joins it and is glued onto its row; one
   * that leaves its box is released. Anchor components never join (they anchor the box itself).
   */
  private reconcileMembership(moved: WardleyShape[]): void {
    for (const component of moved) {
      if (!isComponent(component) || pipelineAnchoredBy(this.elementRegistry, component)) continue;
      const center = centerOf(component);
      const host = pipelineAt(this.elementRegistry, component, center);
      if (host) {
        this.moveBy(component, { x: 0, y: host.y + host.height / 2 - center.y });
        if (component.pipelineId !== host.id) {
          this.wardleyModeling.updateProperties(component, {
            pipelineId: host.id,
            visibility: this.pipelineVisibility(host),
          });
        }
      } else if (component.pipelineId) {
        this.release(component);
      }
    }
  }

  /** A narrowed pipeline lets go of the members whose centre is no longer inside the box. */
  private releaseMembersOutside(pipeline: WardleyShape): void {
    for (const member of membersOf(this.elementRegistry, pipeline)) {
      const center = centerOf(member);
      if (center.x < pipeline.x || center.x > pipeline.x + pipeline.width) this.release(member);
    }
  }

  private release(component: WardleyShape): void {
    this.wardleyModeling.updateProperties(component, {
      pipelineId: undefined,
      visibility: this.grid.fromCanvas(centerOf(component)).visibility,
    });
  }

  /**
   * A component moved onto or past its evolve target keeps the planned distance instead of
   * pointing backwards; at the right edge, where no forward target is left, the movement goes.
   */
  private shiftPassedEvolveTargets(context: GeometryContext): void {
    const evolutionsBefore = this.evolutionsBefore.get(context);
    if (!evolutionsBefore) return;
    for (const [shape, evolutionBefore] of evolutionsBefore) {
      const movement = shape.movement;
      if (!isComponent(shape) || !movement) continue;
      const evolution = shape.evolution;
      if (movement.targetEvolution - evolution > MIN_EVOLVE_DELTA) continue;
      const shiftedTarget = Math.min(1, evolution + (movement.targetEvolution - evolutionBefore));
      this.wardleyModeling.updateProperties(shape, {
        movement:
          shiftedTarget - evolution > MIN_EVOLVE_DELTA
            ? { ...movement, targetEvolution: shiftedTarget }
            : undefined,
      });
    }
  }

  private moveBy(shape: WardleyShape, delta: Point): void {
    if (Math.abs(delta.x) < EPSILON && Math.abs(delta.y) < EPSILON) return;
    this.modeling.moveShape(shape as unknown as Shape, { x: delta.x, y: delta.y });
  }

  // --- plot clamping ---------------------------------------------------------------------------

  private plotBounds(): Bounds {
    const topLeft = this.grid.toCanvas({ evolution: 0, visibility: 1 });
    const bottomRight = this.grid.toCanvas({ evolution: 1, visibility: 0 });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  /**
   * The part of a shape that has to stay inside the plot: the centre of a node, the anchor line of
   * a pipeline, the whole rectangle of an attitude and every point of a drawing.
   */
  private extentInsidePlot(shape: WardleyShape): Bounds {
    switch (shape.wardleyType) {
      case 'pipeline':
        return { x: shape.x, y: shape.y, width: shape.width, height: 0 };
      case 'attitude':
        return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
      case 'drawing': {
        const points = shape.drawingPoints ?? [];
        if (!points.length) return { ...centerOf(shape), width: 0, height: 0 };
        const xs = points.map((point) => shape.x + point.x);
        const ys = points.map((point) => shape.y + point.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
      }
      default:
        return { ...centerOf(shape), width: 0, height: 0 };
    }
  }

  /** The largest part of `delta` that keeps every shape's extent inside the plot. */
  private clampDelta(delta: Point, shapes: WardleyShape[]): Point {
    const plot = this.plotBounds();
    const horizontal: Range = { min: -Infinity, max: Infinity };
    const vertical: Range = { min: -Infinity, max: Infinity };
    for (const shape of shapes) {
      const extent = this.extentInsidePlot(shape);
      horizontal.min = Math.max(horizontal.min, plot.x - extent.x);
      horizontal.max = Math.min(horizontal.max, plot.x + plot.width - (extent.x + extent.width));
      vertical.min = Math.max(vertical.min, plot.y - extent.y);
      vertical.max = Math.min(vertical.max, plot.y + plot.height - (extent.y + extent.height));
    }
    return { x: clampToRange(delta.x, horizontal), y: clampToRange(delta.y, vertical) };
  }

  /** Pipelines only stretch along the evolution axis, and only within the plot. */
  private horizontalPipelineBounds(pipeline: WardleyShape, bounds: Bounds): Bounds {
    const [x, width] = this.spanInside(bounds.x, bounds.width, 'x');
    return { x, y: pipeline.y, width, height: pipeline.height };
  }

  private boundsInsidePlot(bounds: Bounds): Bounds {
    const [x, width] = this.spanInside(bounds.x, bounds.width, 'x');
    const [y, height] = this.spanInside(bounds.y, bounds.height, 'y');
    return { x, y, width, height };
  }

  private spanInside(start: number, length: number, axis: 'x' | 'y'): [number, number] {
    const plot = this.plotBounds();
    const plotStart = axis === 'x' ? plot.x : plot.y;
    const plotEnd = plotStart + (axis === 'x' ? plot.width : plot.height);
    const clampedStart = Math.max(start, plotStart);
    const clampedLength = Math.max(
      Math.min(start + length, plotEnd) - clampedStart,
      MIN_RESIZE_EXTENT,
    );
    return [Math.min(clampedStart, plotEnd - clampedLength), clampedLength];
  }
}

function directShapes(context: GeometryContext): WardleyShape[] {
  const candidates = [
    ...(context.shape ? [context.shape] : []),
    ...(context.shapes ?? []),
    ...(context.elements ?? []),
  ];
  return [...new Set(candidates)].filter(isWardleyShape);
}

function closureShapes(context: GeometryContext): WardleyShape[] {
  if (!context.closure) return directShapes(context);
  return Object.values(context.closure.allShapes).filter(isWardleyShape);
}

function clampToRange(value: number, range: Range): number {
  // An empty range means a shape already sits outside the plot — leave such moves alone.
  if (range.min > range.max) return value;
  return Math.min(Math.max(value, range.min), range.max);
}

const RANGE_EPS = 0.001;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Clamps an evolution range to [0,1] while guaranteeing `start < end` (schema invariant). */
export function clampRange(start: number, end: number): [number, number] {
  const e = clamp01(Math.max(end, start + RANGE_EPS));
  const s = Math.max(0, Math.min(start, e - RANGE_EPS));
  return [s, e];
}
