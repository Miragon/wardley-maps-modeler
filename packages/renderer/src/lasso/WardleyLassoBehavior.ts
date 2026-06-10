import type EventBus from 'diagram-js/lib/core/EventBus';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type LassoTool from 'diagram-js/lib/features/lasso-tool/LassoTool';

interface ElementMouseEvent {
  element?: unknown;
  originalEvent?: MouseEvent;
}

/**
 * Activates the diagram-js lasso via Shift+drag on the empty canvas.
 * Plain drag stays canvas pan (MoveCanvas); Shift+click on elements stays multi-select.
 */
export default class WardleyLassoBehavior {
  static $inject = ['eventBus', 'canvas', 'lassoTool'];

  constructor(eventBus: EventBus, canvas: Canvas, lassoTool: LassoTool) {
    eventBus.on('element.mousedown', 1500, (event: ElementMouseEvent) => {
      const original = event.originalEvent;
      if (!original?.shiftKey) return undefined;
      let root: unknown;
      try {
        root = canvas.getRootElement();
      } catch {
        return undefined;
      }
      if (event.element !== root) return undefined;
      lassoTool.activateLasso(original);
      // Returning false stops lower-priority listeners (canvas pan).
      return false;
    });
  }
}
