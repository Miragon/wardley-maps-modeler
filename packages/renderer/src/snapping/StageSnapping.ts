import type EventBus from 'diagram-js/lib/core/EventBus';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';

const SNAP_TOLERANCE = 8;

interface DragMoveEvent {
  x?: number;
  y?: number;
  originalEvent?: { shiftKey?: boolean };
}

/**
 * Snaps the X position (evolution) during move/create/resize to the stage boundaries.
 * Disabled while the Shift key is held. Deliberately lightweight (no replacement for the full
 * diagram-js snapping); it adds the Wardley-specific band boundaries to the snapping.
 */
export default class StageSnapping {
  static $inject = ['eventBus', 'evolutionGrid'];

  constructor(eventBus: EventBus, grid: EvolutionGrid) {
    const events = [
      'shape.move.move',
      'shape.move.end',
      'create.move',
      'create.end',
      'shape.resize.move',
      'shape.resize.end',
    ];

    eventBus.on(events, 1500, (event: DragMoveEvent) => {
      if (event.originalEvent?.shiftKey) return;
      if (typeof event.x !== 'number') return;
      const xs = grid
        .getBoundaries()
        .map((b) => grid.toCanvas({ visibility: 0.5, evolution: b }).x);
      for (const sx of xs) {
        if (Math.abs(event.x - sx) <= SNAP_TOLERANCE) {
          event.x = sx;
          break;
        }
      }
    });
  }
}
