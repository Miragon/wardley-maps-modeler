import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import type EventBus from 'diagram-js/lib/core/EventBus';
import { isWardleyShape, type WardleyShape } from '../model/di-types.js';
import type EvolutionGrid from './EvolutionGrid.js';

const MOVE_COMMANDS = [
  'shape.move',
  'shape.create',
  'shape.resize',
  'elements.move',
  'elements.create',
];

interface CommandContextLike {
  shape?: unknown;
  shapes?: unknown[];
  elements?: unknown[];
}

/**
 * Haelt nach jeder Geometrie-Aenderung (Move/Create/Resize) die normierten Wardley-Koordinaten
 * synchron zur Pixel-Geometrie — in BEIDEN Richtungen (postExecuted UND reverted), damit Undo/Redo
 * konsistent bleibt (Konzept §5.3). `EvolutionGrid` ist die einzige Mathematik-Quelle (P7).
 */
export default class EvolutionConstraintBehavior extends CommandInterceptor {
  static override $inject = ['eventBus', 'evolutionGrid'];

  constructor(
    eventBus: EventBus,
    private readonly grid: EvolutionGrid,
  ) {
    super(eventBus);
    const sync = (event: { context?: CommandContextLike }) => this.syncAll(event.context);
    this.postExecuted(MOVE_COMMANDS, sync);
    this.reverted(MOVE_COMMANDS, sync);
  }

  private syncAll(context: CommandContextLike | undefined): void {
    if (!context) return;
    const candidates: unknown[] = [
      ...(context.shape ? [context.shape] : []),
      ...(context.shapes ?? []),
      ...(context.elements ?? []),
    ];
    for (const c of candidates) {
      if (isWardleyShape(c)) this.syncFromGeometry(c);
    }
  }

  /** Projiziert die aktuelle Pixel-Geometrie zurueck auf normierte Achsenwerte. */
  private syncFromGeometry(shape: WardleyShape): void {
    const cy = shape.y + shape.height / 2;
    if (shape.wardleyType === 'pipeline') {
      const start = this.grid.fromCanvas({ x: shape.x, y: cy });
      const end = this.grid.fromCanvas({ x: shape.x + shape.width, y: cy });
      shape.evolutionStart = start.evolution;
      shape.evolutionEnd = Math.max(end.evolution, start.evolution + 0.001);
      shape.evolution = (shape.evolutionStart + shape.evolutionEnd) / 2;
      shape.visibility = start.visibility;
      return;
    }
    if (shape.wardleyType === 'attitude') {
      // Attitude-Position = Ankerpunkt (oben links), passend zur OWM-Semantik.
      const tl = this.grid.fromCanvas({ x: shape.x, y: shape.y });
      shape.evolution = tl.evolution;
      shape.visibility = tl.visibility;
      return;
    }
    const coord = this.grid.fromCanvas({ x: shape.x + shape.width / 2, y: cy });
    shape.evolution = coord.evolution;
    shape.visibility = coord.visibility;
  }
}
