import type EventBus from 'diagram-js/lib/core/EventBus';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';

const SNAP_TOLERANCE = 8;

interface DragMoveEvent {
  x?: number;
  /** Delta since drag start — diagram-js move/resize works ONLY with dx/dy, never with x. */
  dx?: number;
  originalEvent?: { shiftKey?: boolean };
  context?: { shape?: { x: number; width: number } };
}

/**
 * Snaps the X position (evolution) during move/create/resize to the stage boundaries.
 * Disabled while the Shift key is held. Important: `x` and `dx` must be adjusted TOGETHER
 * (like diagram-js' `setSnapped`) — move takes the final position from `dx`, so a mutated
 * `x` alone would have no effect.
 */
export default class StageSnapping {
  static $inject = ['eventBus', 'evolutionGrid'];

  constructor(eventBus: EventBus, grid: EvolutionGrid) {
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
      for (const sx of boundaryXs()) {
        if (Math.abs(mid - sx) <= SNAP_TOLERANCE) {
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
        for (const sx of boundaryXs()) {
          if (Math.abs(event.x - sx) <= SNAP_TOLERANCE) {
            setSnappedX(event, sx);
            break;
          }
        }
      },
    );
  }
}
