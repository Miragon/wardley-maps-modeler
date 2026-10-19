import type Canvas from 'diagram-js/lib/core/Canvas';

/** What a host's chrome covers along the container's edges, in px (Miragon guide §5.9). */
export interface FreeRectInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Diagram config `wardleyFreeRect` (viewer option `freeRectInsets`). */
export interface FreeRectConfig {
  insets?: () => FreeRectInsets;
}

/**
 * The part of the canvas no host chrome covers. Keyboard creation places new elements in its
 * centre (guide §5.5) and the pan constraint keeps the map reachable around it, so both agree with
 * a host that fits the map into the same rectangle.
 */
export default class FreeRect {
  static $inject = ['canvas', 'config.wardleyFreeRect'];

  constructor(
    private readonly canvas: Canvas,
    private readonly config: FreeRectConfig | undefined,
  ) {}

  /** The host's insets, or `undefined` when it reports none. */
  insets(): FreeRectInsets | undefined {
    const insets = this.config?.insets?.();
    if (!insets) return undefined;
    const sides = [insets.top, insets.right, insets.bottom, insets.left];
    return sides.every((side) => Number.isFinite(side) && side >= 0) ? insets : undefined;
  }

  /**
   * The centre of the free rectangle in diagram coordinates (the whole visible area without
   * insets). An axis whose insets leave no room centres in the whole container, as fitting does.
   */
  center(): { x: number; y: number } {
    const viewbox = this.canvas.viewbox();
    const insets = this.insets() ?? { top: 0, right: 0, bottom: 0, left: 0 };
    // The viewbox caches the container size until its next change; the canvas measures afresh.
    const { width, height } = this.canvas.getSize();
    const centerOf = (size: number, before: number, after: number) =>
      size - before - after > 0 ? before + (size - before - after) / 2 : size / 2;
    return {
      x: viewbox.x + centerOf(width, insets.left, insets.right) / viewbox.scale,
      y: viewbox.y + centerOf(height, insets.top, insets.bottom) / viewbox.scale,
    };
  }
}
