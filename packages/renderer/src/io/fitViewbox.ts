import type { FreeRectInsets } from '../free-rect/index.js';

/** An import never opens the map above 100 %, like the shell's fit and the other renderers. */
export const MAX_IMPORT_ZOOM = 1;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NO_INSETS: FreeRectInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The viewbox that shows `bounds` centred in the free rectangle (`container` minus `insets`) at the
 * largest scale that fits, never above `MAX_IMPORT_ZOOM`. The box has the container's aspect
 * ratio, so `canvas.viewbox(box)` sets exactly this view. An axis the insets leave no room on
 * centres in the whole container. `undefined` for a 0 × 0 container or empty bounds.
 */
export function fitViewbox(
  bounds: Box,
  container: { width: number; height: number },
  insets: FreeRectInsets = NO_INSETS,
): Box | undefined {
  if (!(container.width > 0 && container.height > 0)) return undefined;
  if (!(bounds.width > 0 && bounds.height > 0)) return undefined;
  const horizontal = freeExtent(container.width, insets.left, insets.right);
  const vertical = freeExtent(container.height, insets.top, insets.bottom);
  const scale = Math.min(
    MAX_IMPORT_ZOOM,
    horizontal.extent / bounds.width,
    vertical.extent / bounds.height,
  );
  const box = {
    x: bounds.x + bounds.width / 2 - (horizontal.start + horizontal.extent / 2) / scale,
    y: bounds.y + bounds.height / 2 - (vertical.start + vertical.extent / 2) / scale,
    width: container.width / scale,
    height: container.height / scale,
  };
  return Object.values(box).every(Number.isFinite) ? box : undefined;
}

function freeExtent(
  total: number,
  before: number,
  after: number,
): { start: number; extent: number } {
  const extent = total - before - after;
  return extent > 0 ? { start: before, extent } : { start: 0, extent: total };
}
