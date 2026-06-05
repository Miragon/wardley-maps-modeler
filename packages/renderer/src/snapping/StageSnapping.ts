import type EventBus from 'diagram-js/lib/core/EventBus';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';

const SNAP_TOLERANCE = 8;

interface DragMoveEvent {
  x?: number;
  y?: number;
  originalEvent?: { shiftKey?: boolean };
}

/**
 * Rastet die X-Position (Evolution) waehrend Move/Create/Resize an die Stage-Grenzen ein.
 * Mit gedrueckter Shift-Taste deaktiviert. Bewusst leichtgewichtig (kein Ersatz fuer das volle
 * diagram-js Snapping); ergaenzt das Snapping um die Wardley-spezifischen Bandgrenzen.
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
