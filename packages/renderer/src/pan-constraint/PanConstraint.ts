import type EventBus from 'diagram-js/lib/core/EventBus';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';

const PAD_TOP = 180;
const PAD_BOTTOM = 80;
const PAD_SIDE = 120;
const EPSILON = 0.5;

type ViewBox = { x: number; y: number; width: number; height: number };
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

function union(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * Keeps the map in view while scrolling and zooming.
 * Without this the user could scroll the map completely off-screen into empty space.
 * After every move we pull the visible area back so it stays close to the map,
 * leaving only a small margin of empty space around it. "The map" is the plot plus any content
 * reaching beyond it (long labels at the commodity edge, notes in the margin).
 */
export default class PanConstraint {
  static $inject = ['eventBus', 'canvas', 'evolutionGrid'];

  private applying = false;
  /** Content bounds are measured lazily (getBBox), at most once per change of the map. */
  private contentBounds: Bounds | null | undefined;
  /** A config change (resize) happened; re-check once its elements are redrawn. */
  private constrainAfterCommand = false;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly grid: EvolutionGrid,
  ) {
    eventBus.on('canvas.viewbox.changed', (event: { viewbox?: ViewBox }) => {
      if (this.applying) return;
      this.constrain(event?.viewbox);
    });
    const invalidate = () => {
      this.contentBounds = undefined;
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

  /** Plot (with axis margins) united with everything drawn on the element layer. */
  private bounds(): Bounds {
    const plot = this.grid.outerBounds();
    if (this.contentBounds === undefined) this.contentBounds = this.measureContent();
    return this.contentBounds ? union(plot, this.contentBounds) : plot;
  }

  private measureContent(): Bounds | null {
    const layer = (
      this.canvas as Partial<Pick<Canvas, 'getActiveLayer'>>
    ).getActiveLayer?.() as unknown as SVGGraphicsElement | undefined;
    if (typeof layer?.getBBox !== 'function') return null;
    try {
      const box = layer.getBBox();
      return box.width > 0 && box.height > 0
        ? { x: box.x, y: box.y, width: box.width, height: box.height }
        : null;
    } catch {
      return null; // detached / not rendered
    }
  }

  private constrain(viewbox?: ViewBox, { recentre = true }: { recentre?: boolean } = {}): void {
    this.constrainAfterCommand = false;
    const current = viewbox ?? (this.canvas.viewbox() as unknown as ViewBox);
    const bounds = this.bounds();
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
      { min: bounds.x, max: bounds.x + bounds.width, padBefore: PAD_SIDE, padAfter: PAD_SIDE },
      recentre,
    );
    const clampedY = constrainAxis(
      current.y,
      current.height,
      { min: bounds.y, max: bounds.y + bounds.height, padBefore: PAD_TOP, padAfter: PAD_BOTTOM },
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
