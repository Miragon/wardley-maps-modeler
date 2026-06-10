import { append as svgAppend, attr as svgAttr, create as svgCreate } from 'tiny-svg';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type InteractionEvents from 'diagram-js/lib/features/interaction-events/InteractionEvents';
import { isWardleyShape, type WardleyShape } from '../model/di-types.js';

function isDrawing(el: unknown): el is WardleyShape {
  return isWardleyShape(el) && el.wardleyType === 'drawing';
}

/**
 * Drawings get a hit zone along their STROKE only (generous 15px band, like the default
 * stroke hit) instead of the default full-bbox hit — a shape drawn AROUND elements must not
 * swallow the clicks for everything inside it. The interior stays click-through; the drawing
 * itself is selected/moved by grabbing its line.
 */
export default class WardleyDrawingHitProvider {
  static $inject = ['eventBus', 'interactionEvents'];

  constructor(eventBus: EventBus, interactionEvents: InteractionEvents) {
    // The diagram-js default (box hit) listens on LOW_PRIORITY — returning false here
    // suppresses it (same pattern bpmn-js uses for its custom hits).
    eventBus.on('interactionEvents.createHit', (event: { element?: unknown; gfx?: SVGElement }) => {
      if (!isDrawing(event.element) || !event.gfx) return;
      createStrokeHit(event.element, event.gfx);
      return false;
    });
    eventBus.on('interactionEvents.updateHit', (event: { element?: unknown; gfx?: SVGElement }) => {
      if (!isDrawing(event.element) || !event.gfx) return;
      interactionEvents.removeHits(event.gfx);
      createStrokeHit(event.element, event.gfx);
      return false;
    });
  }
}

function createStrokeHit(shape: WardleyShape, gfx: SVGElement): void {
  const points = shape.drawingPoints ?? [];
  const hit = svgCreate(shape.closed ? 'polygon' : 'polyline');
  svgAttr(hit, {
    points: points.map((p) => `${p.x},${p.y}`).join(' '),
    class: 'djs-hit djs-hit-stroke',
    fill: 'none',
    stroke: 'white',
    'stroke-width': 15,
    // diagram-js makes hits invisible via this INLINE attribute (its "no-border" trait),
    // not via CSS — without it the 15px white band is visible.
    'stroke-opacity': 0,
  });
  svgAppend(gfx, hit);
}
