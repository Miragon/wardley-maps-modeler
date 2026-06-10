import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import { isWardleyShape, isPipeline, type WardleyShape } from '../model/di-types.js';
import type EvolutionGrid from './EvolutionGrid.js';

const MOVE_COMMANDS = [
  'shape.move',
  'shape.create',
  'shape.resize',
  'elements.move',
  'elements.create',
];

interface CommandContextLike {
  shape?: unknown;
  shapes?: unknown[];
  elements?: unknown[];
}

/**
 * After every geometry change (move/create/resize), keeps the normalized Wardley coordinates
 * in sync with the pixel geometry — in BOTH directions (postExecuted AND reverted), so that undo/redo
 * stays consistent (concept doc §5.3). `EvolutionGrid` is the single source of math (P7).
 *
 * It also manages pipeline membership: a component whose midpoint lands inside a pipeline box
 * becomes a child (pipelineId) and is glued vertically onto the pipeline; dragging it out ends
 * the membership. When the pipeline moves, its children follow vertically.
 */
export default class EvolutionConstraintBehavior extends CommandInterceptor {
  static override $inject = ['eventBus', 'evolutionGrid', 'elementRegistry'];

  constructor(
    private readonly eventBus: EventBus,
    private readonly grid: EvolutionGrid,
    private readonly elementRegistry: ElementRegistry,
  ) {
    super(eventBus);
    const sync = (event: { context?: CommandContextLike }) => this.syncAll(event.context);
    this.postExecuted(MOVE_COMMANDS, sync);
    this.reverted(MOVE_COMMANDS, sync);

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
      const touchesComponent = candidates.some(
        (el) => isWardleyShape(el) && (el as WardleyShape).wardleyType === 'component',
      );
      if (!touchesComponent) return;
      for (const p of this.elementRegistry.filter((el) => isPipeline(el))) {
        this.eventBus.fire('element.changed', { element: p });
      }
    };
    this.postExecuted(
      ['shape.create', 'shape.delete', 'element.updateProperties'],
      refreshPipelineLabels,
    );
    this.reverted(
      ['shape.create', 'shape.delete', 'element.updateProperties'],
      refreshPipelineLabels,
    );
  }

  private syncAll(context: CommandContextLike | undefined): void {
    if (!context) return;
    const candidates: unknown[] = [
      ...(context.shape ? [context.shape] : []),
      ...(context.shapes ?? []),
      ...(context.elements ?? []),
    ];
    for (const c of candidates) {
      if (isWardleyShape(c)) this.syncFromGeometry(c);
    }
  }

  private syncFromGeometry(shape: WardleyShape): void {
    const cy = shape.y + shape.height / 2;
    if (shape.wardleyType === 'pipeline') {
      // The anchor line (■ on the box) is the box's TOP EDGE.
      const anchorY = shape.y;
      const start = this.grid.fromCanvas({ x: shape.x, y: anchorY });
      const end = this.grid.fromCanvas({ x: shape.x + shape.width, y: anchorY });
      // Keep the schema invariants even outside the plot area (0 <= start < end <= 1) —
      // otherwise every export/share crashes once the pipeline has been dragged past the plot edge.
      const [s, e] = clampRange(start.evolution, end.evolution);
      shape.evolutionStart = s;
      shape.evolutionEnd = e;
      shape.evolution = clamp01((s + e) / 2);
      shape.visibility = start.visibility;
      // Re-project the clamped truth back onto the canvas (no model/pixel divergence).
      const p1 = this.grid.toCanvas({ visibility: shape.visibility, evolution: s });
      const p2 = this.grid.toCanvas({ visibility: shape.visibility, evolution: e });
      this.applyGeometry(shape, p1.x, p1.y, Math.max(p2.x - p1.x, 2));
      this.reconcileMembership(shape);
      return;
    }
    if (shape.wardleyType === 'attitude') {
      // Attitude position = anchor point (top left), corner2 = bottom-right corner (OWM semantics).
      const tl = this.grid.fromCanvas({ x: shape.x, y: shape.y });
      const br = this.grid.fromCanvas({ x: shape.x + shape.width, y: shape.y + shape.height });
      shape.evolution = tl.evolution;
      shape.visibility = tl.visibility;
      shape.corner2 = br;
      const a = this.grid.toCanvas(tl);
      const b = this.grid.toCanvas(br);
      this.applyGeometry(shape, a.x, a.y, Math.max(b.x - a.x, 4), Math.max(b.y - a.y, 4));
      return;
    }
    const coord = this.grid.fromCanvas({ x: shape.x + shape.width / 2, y: cy });
    shape.evolution = coord.evolution;
    shape.visibility = coord.visibility;
    // Re-project: when clamping changed the normalized value (node dropped outside the plot),
    // pull the pixel geometry back into the plot so model and canvas never diverge.
    const center = this.grid.toCanvas(coord);
    this.applyGeometry(shape, center.x - shape.width / 2, center.y - shape.height / 2);
    if (shape.wardleyType === 'component') this.updateMembership(shape);
  }

  /** Applies pixel geometry only when it actually drifted (and re-renders then). */
  private applyGeometry(
    shape: WardleyShape,
    x: number,
    y: number,
    width?: number,
    height?: number,
  ): void {
    const drift =
      Math.abs(x - shape.x) > 0.5 ||
      Math.abs(y - shape.y) > 0.5 ||
      (width !== undefined && Math.abs(width - shape.width) > 0.5) ||
      (height !== undefined && Math.abs(height - shape.height) > 0.5);
    if (!drift) return;
    shape.x = x;
    shape.y = y;
    if (width !== undefined) shape.width = width;
    if (height !== undefined) shape.height = height;
    this.fireChanged(shape);
  }

  /** Derives pipeline membership from the geometry: midpoint inside the box = child. */
  private updateMembership(shape: WardleyShape): void {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    const host = (this.elementRegistry.filter((el) => isPipeline(el)) as WardleyShape[]).find(
      (p) =>
        // The eponymous component stays independent (it anchors the pipeline visibility).
        p.wardleyLabel !== shape.wardleyLabel &&
        cx >= p.x &&
        cx <= p.x + p.width &&
        cy >= p.y &&
        cy <= p.y + p.height,
    );
    if (host) {
      shape.pipelineId = host.id;
      this.glueToPipeline(shape, host);
    } else if (shape.pipelineId) {
      delete shape.pipelineId;
    }
  }

  /** Glues a child vertically onto its pipeline (children share its visibility). */
  private glueToPipeline(child: WardleyShape, pipeline: WardleyShape): void {
    child.y = pipeline.y + pipeline.height / 2 - child.height / 2;
    child.visibility = pipeline.visibility;
    this.fireChanged(child);
  }

  /**
   * After a pipeline move/resize: children STAY where they are (move them together via lasso) —
   * membership is purely geometry-derived in both directions: components no longer inside the
   * box are released, components now inside are (re-)adopted. No vertical snapping here, so
   * nothing jumps; this also makes undo of a pipeline move restore memberships.
   */
  private reconcileMembership(pipeline: WardleyShape): void {
    const components = this.elementRegistry.filter(
      (el) => isWardleyShape(el) && (el as WardleyShape).wardleyType === 'component',
    ) as WardleyShape[];
    for (const comp of components) {
      // The eponymous component stays independent (it anchors the pipeline in OWM maps).
      if (comp.wardleyLabel === pipeline.wardleyLabel) continue;
      const cx = comp.x + comp.width / 2;
      const cy = comp.y + comp.height / 2;
      const inside =
        cx >= pipeline.x &&
        cx <= pipeline.x + pipeline.width &&
        cy >= pipeline.y &&
        cy <= pipeline.y + pipeline.height;
      if (inside && comp.pipelineId !== pipeline.id) {
        comp.pipelineId = pipeline.id;
        comp.visibility = pipeline.visibility;
        this.fireChanged(comp);
      } else if (!inside && comp.pipelineId === pipeline.id) {
        delete comp.pipelineId;
        // Position stays untouched — only re-derive the component's visibility from geometry.
        const coord = this.grid.fromCanvas({ x: cx, y: cy });
        comp.evolution = coord.evolution;
        comp.visibility = coord.visibility;
        this.fireChanged(comp);
      }
    }
  }

  /** Triggers a re-render for programmatically moved shapes plus their connections. */
  private fireChanged(shape: WardleyShape): void {
    this.eventBus.fire('element.changed', { element: shape });
    for (const conn of [...(shape.incoming ?? []), ...(shape.outgoing ?? [])]) {
      this.eventBus.fire('element.changed', { element: conn });
    }
  }
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
