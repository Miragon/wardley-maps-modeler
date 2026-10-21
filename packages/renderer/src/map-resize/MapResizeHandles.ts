import { append as svgAppend, attr as svgAttr, create as svgCreate } from 'tiny-svg';
import type { Injector } from 'didi';
import { isReadOnly } from '../read-only/index.js';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import {
  MAP_SIZE_PRESETS,
  PLOT_MAX,
  PLOT_MIN,
  normalizeMapSize,
  type MapSize,
  type WardleyMap,
} from '@miragon/wardley-schema-model';
import { PLOT } from '../draw/styles.js';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type MapProjection from './MapProjection.js';
import type { ProjectionSnapshot } from './MapProjection.js';
import { COMMAND_START_EVENTS, PUT_BACK_PRIORITY } from '../live-preview/index.js';

export const MAP_RESIZE_PREFIX = 'wardley.mapResize';

/** Above the axes (-1), below the element planes (0): elements at the plot edge win hit tests. */
const LAYER_NAME = 'wardley-map-resize';
const LAYER_INDEX = -0.5;

const SNAP_STEP = 10;
const PRESET_SNAP_DISTANCE = 12;
/** Handle sizes in screen px: they keep a grabbable size at every zoom level. */
const EDGE_HIT_WIDTH = 8;
const CORNER_HIT_SIZE = 16;
const CORNER_VISUAL_SIZE = 10;
const BADGE_OFFSET = 16;

export type ResizeAxis = 'x' | 'y' | 'xy';

const CURSORS: Record<ResizeAxis, string> = {
  x: 'ew-resize',
  y: 'ns-resize',
  xy: 'nwse-resize',
};

interface MapResizeContext {
  axis: ResizeAxis;
  startSize: MapSize;
  snapshot?: ProjectionSnapshot;
  model?: WardleyMap;
  size?: MapSize;
  committed?: boolean;
}

interface MapResizeEvent {
  context: MapResizeContext;
  dx: number;
  dy: number;
  originalEvent?: MouseEvent;
}

interface ModifierKeys {
  /** Keep the start aspect ratio. */
  keepAspectRatio: boolean;
  /** Free size: no 10px steps, no preset magnet. */
  disableSnapping: boolean;
}

/** The part of `wardleyModeling` the handles use (by DI name, to keep the features decoupled). */
interface MapResizeModeling {
  resizeMap(size: MapSize | undefined): void;
}

interface Handle {
  readonly group: SVGGElement;
  readonly hit: SVGRectElement;
  readonly visual: SVGElement;
}

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Paint-free presentation attributes: the SVG export clones this layer without the stylesheet,
 * where a bare rect would fill black. Set as attributes (tiny-svg would inline them as style),
 * so the stylesheet still wins and shows the handles on hover.
 */
function withoutPaint<T extends SVGElement>(element: T): T {
  element.setAttribute('fill', 'none');
  element.setAttribute('stroke', 'none');
  element.setAttribute('opacity', '0');
  return element;
}

/**
 * The size a drag from `start` by (dx, dy) on `axis` asks for: 10px steps with a magnetic pull
 * towards the presets, Shift keeps the start aspect ratio, always whole pixels within the limits.
 */
export function sizeForDrag(
  start: MapSize,
  axis: ResizeAxis,
  dx: number,
  dy: number,
  keys: ModifierKeys = { keepAspectRatio: false, disableSnapping: false },
): MapSize {
  let width = axis === 'y' ? start.width : start.width + dx;
  let height = axis === 'x' ? start.height : start.height + dy;
  const step = keys.disableSnapping ? 1 : SNAP_STEP;

  if (keys.keepAspectRatio) {
    const ratio = start.width / start.height;
    const widthDrives =
      axis === 'x' ||
      (axis === 'xy' &&
        Math.abs(width - start.width) / start.width >=
          Math.abs(height - start.height) / start.height);
    if (widthDrives) {
      width = clamp(round(width, step), PLOT_MIN.width, PLOT_MAX.width);
      height = width / ratio;
    } else {
      height = clamp(round(height, step), PLOT_MIN.height, PLOT_MAX.height);
      width = height * ratio;
    }
    return normalizeMapSize(width, height);
  }

  if (!keys.disableSnapping) {
    const preset = MAP_SIZE_PRESETS.find(
      (candidate) =>
        Math.abs(width - candidate.width) <= PRESET_SNAP_DISTANCE &&
        Math.abs(height - candidate.height) <= PRESET_SNAP_DISTANCE,
    );
    if (preset) return { width: preset.width, height: preset.height };
  }
  return normalizeMapSize(
    axis === 'y' ? width : round(width, step),
    axis === 'x' ? height : round(height, step),
  );
}

/** "1440 × 900 · Large" — the preset name only when the size matches one exactly. */
export function sizeLabel(size: MapSize): string {
  const preset = MAP_SIZE_PRESETS.find(
    (candidate) => candidate.width === size.width && candidate.height === size.height,
  );
  return `${size.width} × ${size.height}${preset ? ` · ${preset.name}` : ''}`;
}

/**
 * Direct manipulation of the map size: handles on the plot's right edge, bottom edge and
 * bottom-right corner. The drag previews live (grid and shapes re-projected, no command stack);
 * on release the preview is undone and exactly ONE `wardley.map.resize` runs, so a drag is one
 * undo step. Esc cancels; a double-click on the corner resets to the default size.
 */
export default class MapResizeHandles {
  static $inject = [
    'eventBus',
    'canvas',
    'evolutionGrid',
    'dragging',
    'wardleyMapProjection',
    'wardleyModeling',
    'injector',
  ];

  private readonly layer: SVGGElement;
  private readonly handles: Record<ResizeAxis, Handle>;
  private badge: HTMLElement | undefined;
  private scale: number | undefined;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly grid: EvolutionGrid,
    private readonly dragging: Dragging,
    private readonly projection: MapProjection,
    private readonly modeling: MapResizeModeling,
    private readonly injector: Injector,
  ) {
    this.layer = svgCreate('g', { class: 'wardley-map-resize' }) as SVGGElement;
    svgAppend(canvas.getLayer(LAYER_NAME, LAYER_INDEX), this.layer);
    this.handles = {
      x: this.createHandle('x'),
      y: this.createHandle('y'),
      xy: this.createHandle('xy'),
    };
    this.handles.xy.group.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (isReadOnly(this.injector)) return;
      this.modeling.resizeMap(undefined);
    });

    eventBus.on(['import.done', 'wardley.config.changed'], () => this.render());
    eventBus.on('canvas.viewbox.changed', (event: { viewbox?: { scale?: number } }) => {
      const scale = event.viewbox?.scale;
      if (scale === this.scale) return;
      this.scale = scale;
      this.render();
    });
    eventBus.on(`${MAP_RESIZE_PREFIX}.start`, (event: MapResizeEvent) => this.onStart(event));
    eventBus.on(`${MAP_RESIZE_PREFIX}.move`, (event: MapResizeEvent) => this.onMove(event));
    eventBus.on(`${MAP_RESIZE_PREFIX}.end`, (event: MapResizeEvent) => this.onEnd(event));
    eventBus.on(`${MAP_RESIZE_PREFIX}.cleanup`, (event: MapResizeEvent) => this.onCleanup(event));
    // The preview re-projects the map the drag started with and puts it back on release, which
    // would overwrite a command in between (an undo or a delete pressed mid-drag) and leave the
    // history out of step with the document: the drag ends first, without resizing.
    eventBus.on(COMMAND_START_EVENTS, PUT_BACK_PRIORITY, () => this.cancelPreviewingDrag());
    this.render();
  }

  private cancelPreviewingDrag(): void {
    const drag = this.dragging.context() as {
      prefix?: string;
      data?: { context?: MapResizeContext };
    } | null;
    if (drag?.prefix !== MAP_RESIZE_PREFIX) return;
    const context = drag.data?.context;
    if (context?.snapshot && !context.committed) this.dragging.cancel(true);
  }

  /** Starts a resize drag on `axis` (also usable programmatically, e.g. from tests). */
  start(event: MouseEvent, axis: ResizeAxis): void {
    if (isReadOnly(this.injector)) return;
    const context: MapResizeContext = { axis, startSize: this.grid.getPlotSize() };
    this.dragging.init(event, MAP_RESIZE_PREFIX, {
      cursor: CURSORS[axis],
      keepSelection: true,
      data: { context },
    });
  }

  private createHandle(axis: ResizeAxis): Handle {
    const group = svgCreate('g', {
      class: `wardley-map-resize-handle wardley-map-resize-${axis}`,
      'data-axis': axis,
    }) as SVGGElement;
    const visual = withoutPaint(
      svgCreate(axis === 'xy' ? 'rect' : 'line', { class: 'wardley-map-resize-visual' }),
    );
    const hit = withoutPaint(
      svgCreate('rect', { class: 'wardley-map-resize-hit' }) as SVGRectElement,
    );
    svgAppend(group, visual);
    svgAppend(group, hit);
    svgAppend(this.layer, group);
    // Own listener on the handle: stopping here keeps the canvas (pan, lasso, deselect) from
    // also reacting to this mousedown.
    group.addEventListener('mousedown', (event: MouseEvent) => {
      if (event.button !== 0 || this.dragging.context()) return;
      event.stopPropagation();
      event.preventDefault();
      this.start(event, axis);
    });
    return { group, hit, visual };
  }

  private render(): void {
    const visible = this.projection.root() !== undefined;
    svgAttr(this.layer, { display: visible ? 'inline' : 'none' });
    if (!visible) return;

    const { width, height } = this.grid.getPlotSize();
    const left = PLOT.marginLeft;
    const top = PLOT.marginTop;
    const right = left + width;
    const bottom = top + height;
    const screenPixel = 1 / this.currentScale();
    const edgeHitWidth = EDGE_HIT_WIDTH * screenPixel;
    const half = edgeHitWidth / 2;
    const cornerHitSize = CORNER_HIT_SIZE * screenPixel;
    const cornerHalf = cornerHitSize / 2;
    const cornerVisualSize = CORNER_VISUAL_SIZE * screenPixel;

    // The edges stop short of the corner (its own handle) and of the axis arrowheads.
    svgAttr(this.handles.x.hit, {
      x: right - half,
      y: top,
      width: edgeHitWidth,
      height: Math.max(height - cornerHalf, 0),
    });
    svgAttr(this.handles.x.visual, { x1: right, y1: top, x2: right, y2: bottom });
    svgAttr(this.handles.y.hit, {
      x: left,
      y: bottom - half,
      width: Math.max(width - cornerHalf, 0),
      height: edgeHitWidth,
    });
    svgAttr(this.handles.y.visual, { x1: left, y1: bottom, x2: right, y2: bottom });
    svgAttr(this.handles.xy.hit, {
      x: right - cornerHalf,
      y: bottom - cornerHalf,
      width: cornerHitSize,
      height: cornerHitSize,
    });
    svgAttr(this.handles.xy.visual, {
      x: right - cornerVisualSize / 2,
      y: bottom - cornerVisualSize / 2,
      width: cornerVisualSize,
      height: cornerVisualSize,
    });
  }

  private currentScale(): number {
    if (this.scale === undefined) {
      try {
        this.scale = this.canvas.viewbox().scale;
      } catch {
        return 1; // detached container: nothing to measure yet
      }
    }
    return Number.isFinite(this.scale) && this.scale > 0 ? this.scale : 1;
  }

  private onStart(event: MapResizeEvent): void {
    const context = event.context;
    const snapshot = this.projection.snapshot();
    if (!snapshot) return;
    context.snapshot = snapshot;
    context.model = this.projection.captureModel();
    this.layer.classList.add('is-dragging');
  }

  private onMove(event: MapResizeEvent): void {
    const context = event.context;
    if (!context.snapshot || !context.model) return;
    const size = sizeForDrag(context.startSize, context.axis, event.dx, event.dy, {
      keepAspectRatio: event.originalEvent?.shiftKey === true,
      disableSnapping: event.originalEvent?.altKey === true,
    });
    this.showBadge(size, event.originalEvent);
    if (context.size?.width === size.width && context.size.height === size.height) return;
    context.size = size;
    const businessObject = this.projection.withSize(size);
    if (!businessObject) return;
    this.projection.redraw(
      this.projection.apply(businessObject, context.model, { transient: true }),
    );
  }

  private onEnd(event: MapResizeEvent): void {
    const context = event.context;
    if (!context.snapshot) return;
    // Undo the preview first: the command must capture the real start state as its old state.
    this.projection.redraw(this.projection.restore(context.snapshot, { transient: true }));
    context.committed = true;
    const { size, startSize } = context;
    if (size && (size.width !== startSize.width || size.height !== startSize.height)) {
      this.modeling.resizeMap(size);
    }
  }

  private onCleanup(event: MapResizeEvent): void {
    const context = event.context;
    // Transient like the preview it undoes: the document never changed, so the view stays put.
    if (context.snapshot && !context.committed) {
      this.projection.redraw(this.projection.restore(context.snapshot, { transient: true }));
    }
    this.layer.classList.remove('is-dragging');
    this.hideBadge();
  }

  private showBadge(size: MapSize, originalEvent: MouseEvent | undefined): void {
    const container = this.canvas.getContainer();
    if (!this.badge) {
      this.badge = document.createElement('div');
      this.badge.className = 'wardley-map-resize-badge';
      this.badge.setAttribute('role', 'status');
      container.appendChild(this.badge);
    }
    this.badge.textContent = sizeLabel(size);
    this.badge.hidden = false;
    if (originalEvent) {
      const bounds = container.getBoundingClientRect();
      this.badge.style.left = `${originalEvent.clientX - bounds.left + BADGE_OFFSET}px`;
      this.badge.style.top = `${originalEvent.clientY - bounds.top + BADGE_OFFSET}px`;
    }
  }

  private hideBadge(): void {
    if (this.badge) this.badge.hidden = true;
  }
}
