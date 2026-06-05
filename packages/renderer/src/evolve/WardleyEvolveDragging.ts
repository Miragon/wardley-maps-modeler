import type EventBus from 'diagram-js/lib/core/EventBus';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { Movement } from '@wardley/schema-model';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import type { WardleyShape } from '../model/di-types.js';

const PREFIX = 'wardley.evolve';
const MIN_DELTA = 0.005;
/** CSS-Klasse des roten Ziel-Kreises (vom Renderer gesetzt) — direkter Drag-Griff. */
const HANDLE_CLASS = 'wardley-evolve-handle';

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
  static $inject = [
    'eventBus',
    'dragging',
    'evolutionGrid',
    'wardleyModeling',
    'canvas',
    'elementRegistry',
  ];

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
    grid: EvolutionGrid,
    modeling: WardleyModeling,
    canvas: Canvas,
    elementRegistry: ElementRegistry,
  ) {
    const preview = (shape: WardleyShape, movement: Movement | undefined) => {
      if (movement === undefined) delete shape.movement;
      else shape.movement = movement;
      eventBus.fire('element.changed', { element: shape });
    };

    // Screen-Pixel -> normierte Evolution (über die einzige Mathematik-Quelle, P7).
    const evolutionAtClientX = (clientX: number, cy: number): number => {
      const rect = canvas.getContainer().getBoundingClientRect();
      const vb = canvas.viewbox();
      const canvasX = vb.x + (clientX - rect.left) * (vb.width / rect.width);
      return clamp01(grid.fromCanvas({ x: canvasX, y: cy }).evolution);
    };

    // Direkter Griff: mousedown auf dem roten Ziel-Kreis verschiebt das Evolve-Ziel per Drag.
    // Capture-Phase + stopPropagation, damit diagram-js NICHT stattdessen den Knoten verschiebt.
    // Eigene Dokument-Listener (statt dragging.init) — verlässliches, testbares mousedown-Dragging.
    // Delegiert am Container -> überlebt das Re-Rendern des Kreises während der Vorschau.
    canvas.getContainer().addEventListener(
      'mousedown',
      (event: MouseEvent) => {
        const dom = event.target as Element | null;
        if (!dom?.closest(`.${HANDLE_CLASS}`)) return;
        const id = dom.closest('[data-element-id]')?.getAttribute('data-element-id');
        const shape = id ? (elementRegistry.get(id) as WardleyShape | undefined) : undefined;
        if (!shape || shape.wardleyType !== 'component') return;
        event.stopPropagation();
        event.preventDefault();

        const original = shape.movement;
        const cy = shape.y + shape.height / 2;
        let target: number | undefined;
        const onMove = (e: MouseEvent) => {
          target = evolutionAtClientX(e.clientX, cy);
          preview(shape, { targetEvolution: target });
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          preview(shape, original); // Vorschau zurück, dann EIN undo-barer Commit (P4)
          if (target !== undefined && Math.abs(target - shape.evolution) > MIN_DELTA) {
            modeling.evolveComponent(shape, target);
          }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      },
      true,
    );

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

  /** Startet den Evolve-Drag fuer `shape` (aus dem ContextPad): Ziel per Ziehen entlang der Achse
   *  setzen bzw. nachträglich verschieben, mit Live-Vorschau; Commit beim Loslassen. */
  start(event: Event, shape: WardleyShape): void {
    const context: EvolveContext = {
      shape,
      ...(shape.movement ? { originalMovement: shape.movement } : {}),
    };
    this.dragging.init(event as MouseEvent, PREFIX, { cursor: 'ew-resize', data: { context } });
  }
}
