import type EventBus from 'diagram-js/lib/core/EventBus';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import type { Movement } from '@wardley/schema-model';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import type { WardleyShape } from '../model/di-types.js';

const PREFIX = 'wardley.evolve';
const MIN_DELTA = 0.005;

interface EvolveContext {
  shape: WardleyShape;
  originalMovement?: Movement;
  target?: number;
  committed?: boolean;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Setzt das Evolve-Ziel einer Komponente per Drag entlang der Evolution-Achse (statt Textfeld).
 * Waehrend des Ziehens Live-Vorschau (direkte Mutation + Re-Render); beim Loslassen genau EIN
 * undo-barer Commit ueber den commandStack (P4). ESC bricht ab und stellt den Originalzustand her.
 */
export default class WardleyEvolveDragging {
  static $inject = ['eventBus', 'dragging', 'evolutionGrid', 'wardleyModeling'];

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
    grid: EvolutionGrid,
    modeling: WardleyModeling,
  ) {
    const preview = (shape: WardleyShape, movement: Movement | undefined) => {
      if (movement === undefined) delete shape.movement;
      else shape.movement = movement;
      eventBus.fire('element.changed', { element: shape });
    };

    eventBus.on(`${PREFIX}.move`, (event: { context: EvolveContext; x: number }) => {
      const { shape } = event.context;
      const cy = shape.y + shape.height / 2;
      const target = clamp01(grid.fromCanvas({ x: event.x, y: cy }).evolution);
      event.context.target = target;
      preview(shape, { targetEvolution: target });
    });

    eventBus.on(`${PREFIX}.end`, (event: { context: EvolveContext }) => {
      const ctx = event.context;
      const { shape, target } = ctx;
      // Vorschau zuruecksetzen, dann als EINEN Command ausfuehren (sauberes Undo).
      preview(shape, ctx.originalMovement);
      if (target !== undefined && Math.abs(target - shape.evolution) > MIN_DELTA) {
        modeling.evolveComponent(shape, target);
      }
      ctx.committed = true;
    });

    eventBus.on(`${PREFIX}.cleanup`, (event: { context?: EvolveContext }) => {
      const ctx = event.context;
      if (ctx && !ctx.committed) preview(ctx.shape, ctx.originalMovement);
    });
  }

  /** Startet den Evolve-Drag fuer `shape` (typischerweise aus dem ContextPad). */
  start(event: Event, shape: WardleyShape): void {
    const context: EvolveContext = {
      shape,
      ...(shape.movement ? { originalMovement: shape.movement } : {}),
    };
    this.dragging.init(event as MouseEvent, PREFIX, { cursor: 'ew-resize', data: { context } });
  }
}
