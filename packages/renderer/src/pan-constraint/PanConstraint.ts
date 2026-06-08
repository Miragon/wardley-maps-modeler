import type EventBus from 'diagram-js/lib/core/EventBus';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';

const PAD_TOP = 180;
const PAD_BOTTOM = 80;
const PAD_SIDE = 120;
const EPSILON = 0.5;

type ViewBox = { x: number; y: number; width: number; height: number };

const clamp = (value: number, lo: number, hi: number): number =>
  value < lo ? lo : value > hi ? hi : value;

function constrainAxis(
  position: number,
  viewSize: number,
  boundMin: number,
  boundSize: number,
): number {
  if (viewSize <= boundSize) return clamp(position, boundMin, boundMin + boundSize - viewSize);
  return boundMin + boundSize / 2 - viewSize / 2;
}

/**
 * Keeps the map in view while scrolling and zooming.
 * Without this the user could scroll the map completely off-screen into empty space.
 * After every move we pull the visible area back so it stays close to the map,
 * leaving only a small margin of empty space around it.
 */
export default class PanConstraint {
  static $inject = ['eventBus', 'canvas', 'evolutionGrid'];

  private applying = false;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly grid: EvolutionGrid,
  ) {
    eventBus.on('canvas.viewbox.changed', (event: { viewbox?: ViewBox }) => {
      if (this.applying) return;
      this.constrain(event?.viewbox);
    });
  }

  private constrain(viewbox?: ViewBox): void {
    const current = viewbox ?? (this.canvas.viewbox() as unknown as ViewBox);
    const bounds = this.grid.outerBounds();
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
      bounds.x - PAD_SIDE,
      bounds.width + 2 * PAD_SIDE,
    );
    const clampedY = constrainAxis(
      current.y,
      current.height,
      bounds.y - PAD_TOP,
      bounds.height + PAD_TOP + PAD_BOTTOM,
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
