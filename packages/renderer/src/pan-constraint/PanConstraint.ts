import type EventBus from 'diagram-js/lib/core/EventBus';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type { Injector } from 'didi';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type { FreeRect, FreeRectInsets } from '../free-rect/index.js';
import { exportBounds } from '../io/index.js';

/** Margins in diagram px, for hosts that report no chrome insets. */
const PAD_TOP = 180;
const PAD_BOTTOM = 80;
const PAD_SIDE = 120;
/**
 * Screen px of empty space the view may show beyond the content inside the host's free rectangle.
 * Room on both sides of an axis, so a view the host fitted into its free rectangle (guide §5.9)
 * is never pulled away: the host would take the pull for a user move and stop keeping the view
 * fitted.
 */
const INSET_SLACK = 96;
const EPSILON = 0.5;

interface Pads {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The free rectangle along one axis, in diagram px at the view's scale. */
interface FreeAxis {
  /** Covered by the host's chrome before and after the free part. */
  before: number;
  after: number;
  slack: number;
}

type ViewBox = { x: number; y: number; width: number; height: number; scale?: number };
type Bounds = { x: number; y: number; width: number; height: number };

const clamp = (value: number, lo: number, hi: number): number =>
  value < lo ? lo : value > hi ? hi : value;

/**
 * Clamps one axis of the view into `[min, max]` widened by the padding on both sides.
 *
 * @param recentre a view larger than the padded bounds is centred on them; without it the view
 *        only moves as far as needed to keep `[min, max]` fully visible (after a resize the plot
 *        must not jump away from the corner the user just dragged).
 */
function constrainAxis(
  position: number,
  viewSize: number,
  bounds: { min: number; max: number; padBefore: number; padAfter: number },
  recentre: boolean,
): number {
  const lowest = bounds.min - bounds.padBefore;
  const highest = bounds.max + bounds.padAfter;
  if (!recentre && viewSize >= bounds.max - bounds.min) {
    // Either stay within the padded bounds, or show the whole content: whichever moves less.
    return clamp(
      position,
      Math.min(bounds.max - viewSize, lowest),
      Math.max(bounds.min, highest - viewSize),
    );
  }
  if (viewSize <= highest - lowest) return clamp(position, lowest, highest - viewSize);
  return (lowest + highest) / 2 - viewSize / 2;
}

/**
 * The view positions along one axis that keep `bounds` in the host's free rectangle: bounds
 * smaller than the free part may sit anywhere inside it, larger ones may be panned along it, each
 * up to `slack` beyond.
 */
function freeAreaRange(
  viewSize: number,
  bounds: { min: number; max: number },
  free: FreeAxis,
): { lowest: number; highest: number } {
  const freeEnd = viewSize - free.after;
  return {
    lowest: Math.min(bounds.min - free.before - free.slack, bounds.max - freeEnd - free.slack),
    highest: Math.max(bounds.max - freeEnd + free.slack, bounds.min - free.before + free.slack),
  };
}

/**
 * Clamps one axis of the view so the content stays in the host's free rectangle. Never centres,
 * so a view the host placed in its free rectangle stays put. A view that keeps the plot there is
 * accepted as well: the import and hosts fit the plot, and a long label beyond it that makes the
 * content wider than the free part must not pull that fit sideways. The plot lies inside the
 * content, so the two ranges overlap and their hull is one range.
 */
function constrainAxisToFreeArea(
  position: number,
  viewSize: number,
  content: { min: number; max: number },
  plot: { min: number; max: number },
  free: FreeAxis,
): number {
  const byContent = freeAreaRange(viewSize, content, free);
  const byPlot = freeAreaRange(viewSize, plot, free);
  return clamp(
    position,
    Math.min(byContent.lowest, byPlot.lowest),
    Math.max(byContent.highest, byPlot.highest),
  );
}

/**
 * Keeps the map in view while scrolling and zooming.
 * Without this the user could scroll the map completely off-screen into empty space.
 * After every move we pull the visible area back so it stays close to the map,
 * leaving only a small margin of empty space around it. "The map" is the plot plus any content
 * reaching beyond it (long labels at the commodity edge, notes in the margin): `contentBounds()`,
 * which hosts also fit the view to. With the insets of a host's chrome (`freeArea: { insets }`)
 * the margin is measured inside the free rectangle, so the map never slips under the chrome, and a
 * view the host or the import fitted there, to the content or to the plot, is left alone.
 */
export default class PanConstraint {
  static $inject = ['eventBus', 'canvas', 'evolutionGrid', 'injector'];

  private applying = false;
  /** Content bounds are measured lazily (getBBox), at most once per change of the map. */
  private measured: Bounds | undefined;
  /** A config change (resize) happened; re-check once its elements are redrawn. */
  private constrainAfterCommand = false;
  private readonly freeRect: FreeRect | null;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly grid: EvolutionGrid,
    injector: Injector,
  ) {
    this.freeRect = injector.get<FreeRect | null>('wardleyFreeRect', false) ?? null;
    eventBus.on('canvas.viewbox.changed', (event: { viewbox?: ViewBox }) => {
      if (this.applying) return;
      this.constrain(event?.viewbox);
    });
    const invalidate = () => {
      this.measured = undefined;
    };
    eventBus.on(['element.changed', 'import.done'], invalidate);
    // Shrinking the plot while scrolled into its far corner must never leave a blank viewport.
    // A transient change (live resize preview) is skipped: moving the viewport under a dragged
    // plot corner would feed back into the drag.
    eventBus.on('wardley.config.changed', (event?: { transient?: boolean }) => {
      invalidate();
      if (event?.transient) return;
      this.constrain(undefined, { recentre: false });
      // The command's elements are redrawn only after this event — measure again once they are.
      this.constrainAfterCommand = true;
    });
    eventBus.on('commandStack.changed', () => {
      if (!this.constrainAfterCommand) return;
      invalidate();
      this.constrain(undefined, { recentre: false });
    });
  }

  /**
   * The plot (with its axis margins) united with everything drawn on it or beyond it, tight (no
   * padding): what a host fits the view to.
   */
  contentBounds(): Bounds {
    this.measured ??= exportBounds(this.canvas, this.grid, 0);
    return this.measured;
  }

  /** The host's free rectangle along both axes at the view's scale, if the host reports one. */
  private freeArea(view: ViewBox): { x: FreeAxis; y: FreeAxis } | undefined {
    const insets: FreeRectInsets | undefined = this.freeRect?.insets();
    const scale = insets ? (view.scale ?? this.canvas.zoom()) : 0;
    if (!insets || !(scale > 0)) return undefined;
    const slack = INSET_SLACK / scale;
    // An axis the chrome leaves no room on counts as free across the whole container, as the
    // host's fit and keyboard creation treat it.
    const axis = (size: number, before: number, after: number): FreeAxis =>
      size * scale - before - after > 0
        ? { before: before / scale, after: after / scale, slack }
        : { before: 0, after: 0, slack };
    return {
      x: axis(view.width, insets.left, insets.right),
      y: axis(view.height, insets.top, insets.bottom),
    };
  }

  private constrain(viewbox?: ViewBox, { recentre = true }: { recentre?: boolean } = {}): void {
    this.constrainAfterCommand = false;
    const current = viewbox ?? (this.canvas.viewbox() as unknown as ViewBox);
    const bounds = this.contentBounds();
    if (
      !(bounds.width > 0) ||
      !(bounds.height > 0) ||
      !(current.width > 0) ||
      !(current.height > 0)
    )
      return;

    const horizontal = { min: bounds.x, max: bounds.x + bounds.width };
    const vertical = { min: bounds.y, max: bounds.y + bounds.height };
    const free = this.freeArea(current);
    const plot = this.grid.outerBounds();
    const pads: Pads = { top: PAD_TOP, right: PAD_SIDE, bottom: PAD_BOTTOM, left: PAD_SIDE };
    const clampedX = free
      ? constrainAxisToFreeArea(
          current.x,
          current.width,
          horizontal,
          { min: plot.x, max: plot.x + plot.width },
          free.x,
        )
      : constrainAxis(
          current.x,
          current.width,
          { ...horizontal, padBefore: pads.left, padAfter: pads.right },
          recentre,
        );
    const clampedY = free
      ? constrainAxisToFreeArea(
          current.y,
          current.height,
          vertical,
          { min: plot.y, max: plot.y + plot.height },
          free.y,
        )
      : constrainAxis(
          current.y,
          current.height,
          { ...vertical, padBefore: pads.top, padAfter: pads.bottom },
          recentre,
        );

    if (Math.abs(clampedX - current.x) < EPSILON && Math.abs(clampedY - current.y) < EPSILON)
      return;

    this.applying = true;
    try {
      this.canvas.viewbox({
        x: clampedX,
        y: clampedY,
        width: current.width,
        height: current.height,
      });
    } finally {
      this.applying = false;
    }
  }
}
