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
 * Screen px a host's chrome insets are widened by. The same on both sides of an axis, so a view
 * the host fitted into its free rectangle (centred, guide §5.9) is never pulled away: the host
 * would take the pull for a user move and stop keeping the view fitted.
 */
const INSET_SLACK = 96;
const EPSILON = 0.5;

interface Pads {
  top: number;
  right: number;
  bottom: number;
  left: number;
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
 * Keeps the map in view while scrolling and zooming.
 * Without this the user could scroll the map completely off-screen into empty space.
 * After every move we pull the visible area back so it stays close to the map,
 * leaving only a small margin of empty space around it. "The map" is the plot plus any content
 * reaching beyond it (long labels at the commodity edge, notes in the margin): `contentBounds()`,
 * which hosts also fit the view to.
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

  /** The margins around the content the view may show, in diagram px at the view's scale. */
  private pads(view: ViewBox): Pads {
    const insets: FreeRectInsets | undefined = this.freeRect?.insets();
    const scale = insets ? (view.scale ?? this.canvas.zoom()) : 0;
    if (!insets || !(scale > 0)) {
      return { top: PAD_TOP, right: PAD_SIDE, bottom: PAD_BOTTOM, left: PAD_SIDE };
    }
    return {
      top: (insets.top + INSET_SLACK) / scale,
      right: (insets.right + INSET_SLACK) / scale,
      bottom: (insets.bottom + INSET_SLACK) / scale,
      left: (insets.left + INSET_SLACK) / scale,
    };
  }

  private constrain(viewbox?: ViewBox, { recentre = true }: { recentre?: boolean } = {}): void {
    this.constrainAfterCommand = false;
    const current = viewbox ?? (this.canvas.viewbox() as unknown as ViewBox);
    const bounds = this.contentBounds();
    const pads = this.pads(current);
    if (
      !(bounds.width > 0) ||
      !(bounds.height > 0) ||
      !(current.width > 0) ||
      !(current.height > 0)
    )
      return;

    const clampedX = constrainAxis(
      current.x,
      current.width,
      { min: bounds.x, max: bounds.x + bounds.width, padBefore: pads.left, padAfter: pads.right },
      recentre,
    );
    const clampedY = constrainAxis(
      current.y,
      current.height,
      { min: bounds.y, max: bounds.y + bounds.height, padBefore: pads.top, padAfter: pads.bottom },
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
