import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';

/** Snap distance in SCREEN px, so the pull feels the same at every zoom level. */
export const SNAP_TOLERANCE_SCREEN_PX = 8;

interface DragMoveEvent {
  x?: number;
  /** Delta since drag start — diagram-js move/resize works ONLY with dx/dy, never with x. */
  dx?: number;
  originalEvent?: { shiftKey?: boolean };
  context?: { shape?: { x: number; width: number } };
}

/**
 * Snaps the X position (evolution) during move/create/resize to the stage boundaries, within
 * `SNAP_TOLERANCE_SCREEN_PX` on screen (converted to diagram units with the current zoom).
 * Disabled while the Shift key is held. Important: `x` and `dx` must be adjusted TOGETHER
 * (like diagram-js' `setSnapped`) — move takes the final position from `dx`, so a mutated
 * `x` alone would have no effect.
 */
export default class StageSnapping {
  static $inject = ['eventBus', 'evolutionGrid', 'canvas'];

  constructor(eventBus: EventBus, grid: EvolutionGrid, canvas: Canvas) {
    const tolerance = () => SNAP_TOLERANCE_SCREEN_PX / (canvas.zoom() || 1);
    const boundaryXs = () =>
      grid.getBoundaries().map((b) => grid.toCanvas({ visibility: 0.5, evolution: b }).x);

    const setSnappedX = (event: DragMoveEvent, sx: number) => {
      if (typeof event.dx === 'number' && typeof event.x === 'number') {
        event.dx += sx - event.x;
      }
      event.x = sx;
    };

    // Move: snap the SHAPE MIDPOINT (not the cursor) — the user rarely grabs the shape exactly at its centre.
    eventBus.on(['shape.move.move', 'shape.move.end'], 1500, (event: DragMoveEvent) => {
      if (event.originalEvent?.shiftKey) return;
      if (typeof event.x !== 'number' || typeof event.dx !== 'number') return;
      const shape = event.context?.shape;
      if (!shape) return;
      const mid = shape.x + shape.width / 2 + event.dx;
      const maxDistance = tolerance();
      for (const sx of boundaryXs()) {
        if (Math.abs(mid - sx) <= maxDistance) {
          const d = sx - mid;
          event.dx += d;
          event.x += d;
          break;
        }
      }
    });

    // Create (cursor = shape midpoint) and resize (cursor = dragged edge): snap the cursor.
    eventBus.on(
      ['create.move', 'create.end', 'resize.move', 'resize.end'],
      1500,
      (event: DragMoveEvent) => {
        if (event.originalEvent?.shiftKey) return;
        if (typeof event.x !== 'number') return;
        const maxDistance = tolerance();
        for (const sx of boundaryXs()) {
          if (Math.abs(event.x - sx) <= maxDistance) {
            setSnappedX(event, sx);
            break;
          }
        }
      },
    );
  }
}
