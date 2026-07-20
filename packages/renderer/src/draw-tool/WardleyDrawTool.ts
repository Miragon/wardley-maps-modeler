import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  remove as svgRemove,
} from 'tiny-svg';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Element, Shape } from 'diagram-js/lib/model/Types';
import { COLORS } from '../draw/styles.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';

interface Point {
  x: number;
  y: number;
}

/** Clicking this close (px, canvas coords) to the FIRST/LAST point finishes/closes. */
const CLOSE_RADIUS = 12;

/**
 * Excalidraw-style polyline tool: activate, click point by point (rubber-band preview).
 * Finishing (like Excalidraw): click the LAST point again, double-click, Enter or Escape
 * commits the open line; clicking the FIRST point closes the shape. Escape with fewer than
 * two points cancels. The result is ONE undoable `drawing` shape that moves as a whole.
 */
export default class WardleyDrawTool {
  static $inject = ['canvas', 'eventBus', 'modeling', 'selection', 'wardleyElementFactory'];

  private active = false;
  private points: Point[] = [];
  private cursor: Point | null = null;
  private layer: SVGElement | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly eventBus: EventBus,
    private readonly modeling: Modeling,
    private readonly selection: Selection,
    private readonly factory: WardleyElementFactory,
  ) {
    eventBus.on('diagram.destroy', () => this.cancel());
  }

  isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) this.cancel();
    else this.activate();
  }

  /**
   * The OUTER viewer container — getContainer() returns the inner .djs-container, but the
   *  mode class must sit on .wardley-container for the crosshair/empty-state CSS to match.
   */
  private outerContainer(): HTMLElement {
    const container = this.canvas.getContainer();
    return (container.closest('.wardley-container') as HTMLElement | null) ?? container;
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.points = [];
    this.cursor = null;
    const container = this.canvas.getContainer();
    this.outerContainer().classList.add('wardley-draw-mode');
    // Capture phase: while drawing, clicks must NOT select/move elements underneath.
    container.addEventListener('mousedown', this.onMouseDown, true);
    container.addEventListener('dblclick', this.onDblClick, true);
    container.addEventListener('mousemove', this.onMouseMove, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    // Light up the palette entry (same channel the tool manager uses).
    this.eventBus.fire('tool-manager.update', { tool: 'draw' });
  }

  /** Finishes the current polyline (>= 2 points) and deactivates the tool. */
  finish(): void {
    const pts = [...this.points];
    this.deactivate();
    if (pts.length < 2) return;
    const shape = this.factory.drawingFromCanvasPoints(pts);
    const created = this.modeling.createShape(
      shape as unknown as Shape,
      { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 },
      this.canvas.getRootElement() as Shape,
    );
    this.selection.select(created as unknown as Element);
  }

  /** Closes the shape (polygon) using the collected points. */
  private finishClosed(): void {
    const pts = [...this.points];
    this.deactivate();
    if (pts.length < 3) return;
    const shape = this.factory.drawingFromCanvasPoints(pts, { closed: true });
    const created = this.modeling.createShape(
      shape as unknown as Shape,
      { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 },
      this.canvas.getRootElement() as Shape,
    );
    this.selection.select(created as unknown as Element);
  }

  cancel(): void {
    this.deactivate();
  }

  private deactivate(): void {
    if (!this.active) return;
    this.active = false;
    const container = this.canvas.getContainer();
    this.outerContainer().classList.remove('wardley-draw-mode');
    container.removeEventListener('mousedown', this.onMouseDown, true);
    container.removeEventListener('dblclick', this.onDblClick, true);
    container.removeEventListener('mousemove', this.onMouseMove, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.points = [];
    this.cursor = null;
    this.clearPreview();
    this.eventBus.fire('tool-manager.update', { tool: null });
  }

  private toCanvasPoint(e: MouseEvent): Point {
    const rect = this.canvas.getContainer().getBoundingClientRect();
    const vb = this.canvas.viewbox();
    const scale = this.canvas.zoom();
    return {
      x: (e.clientX - rect.left) / scale + vb.x,
      y: (e.clientY - rect.top) / scale + vb.y,
    };
  }

  /** Palette/context-pad/menus live INSIDE the container — let their clicks through. */
  private isChromeTarget(e: MouseEvent): boolean {
    const target = e.target as HTMLElement | null;
    return !!target?.closest('.djs-palette, .djs-context-pad, .wardley-color-picker');
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0 || this.isChromeTarget(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const p = this.toCanvasPoint(e);
    const first = this.points[0];
    if (first && this.points.length >= 3 && distance(p, first) <= CLOSE_RADIUS) {
      this.finishClosed();
      return;
    }
    // Clicking the LAST point again finishes the open line (Excalidraw behavior) — this is
    // the discoverable way out; double-click/Enter/Escape work as well.
    const last = this.points[this.points.length - 1];
    if (last && distance(p, last) <= CLOSE_RADIUS) {
      if (this.points.length >= 2) this.finish();
      return;
    }
    this.points.push(p);
    this.renderPreview();
  };

  private readonly onDblClick = (e: MouseEvent): void => {
    if (this.isChromeTarget(e)) return;
    e.preventDefault();
    e.stopPropagation();
    this.finish();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.points.length) return;
    this.cursor = this.toCanvasPoint(e);
    this.renderPreview();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // Excalidraw semantics: Escape COMMITS what is there (undo removes it); it only
      // cancels while no line exists yet.
      if (this.points.length >= 2) this.finish();
      else this.cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this.finish();
    }
  };

  private renderPreview(): void {
    this.clearPreview();
    if (!this.points.length) return;
    const layer = this.canvas.getLayer('wardley-draw-preview', 1000);
    const group = svgCreate('g');
    const pts = this.cursor ? [...this.points, this.cursor] : this.points;
    svgAppend(
      group,
      svgAttr(svgCreate('polyline'), {
        points: pts.map((p) => `${p.x},${p.y}`).join(' '),
        fill: 'none',
        stroke: COLORS.ink,
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': '5 4',
      }),
    );
    // First point = "close the shape here", last point = "finish the line here".
    const first = this.points[0]!;
    svgAppend(
      group,
      svgAttr(svgCreate('circle'), {
        cx: first.x,
        cy: first.y,
        r: this.points.length >= 3 ? 5 : 3,
        fill: COLORS.paper,
        stroke: COLORS.ink,
        'stroke-width': 1.5,
      }),
    );
    if (this.points.length >= 2) {
      const last = this.points[this.points.length - 1]!;
      svgAppend(
        group,
        svgAttr(svgCreate('circle'), {
          cx: last.x,
          cy: last.y,
          r: 5,
          fill: COLORS.paper,
          stroke: COLORS.ink,
          'stroke-width': 1.5,
        }),
      );
    }
    svgAppend(layer, group);
    this.layer = group;
  }

  private clearPreview(): void {
    if (this.layer) {
      svgRemove(this.layer);
      this.layer = null;
    }
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
