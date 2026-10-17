import AutoScroll from 'diagram-js/lib/features/auto-scroll/AutoScroll';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Dragging from 'diagram-js/lib/features/dragging/Dragging';
import type { Injector } from 'didi';
import { MAP_RESIZE_PREFIX } from './MapResizeHandles.js';

/**
 * diagram-js AutoScroll, except while the map is being resized: scrolling under a dragged plot
 * corner detaches it from the pointer, and the size jumps on the next move.
 */
export default class ResizeAwareAutoScroll extends AutoScroll {
  static override $inject = ['config.autoScroll', 'eventBus', 'canvas', 'injector'];

  constructor(
    config: unknown,
    eventBus: EventBus,
    canvas: Canvas,
    private readonly injector: Injector,
  ) {
    super(config, eventBus, canvas);
  }

  override startScroll(point: Parameters<AutoScroll['startScroll']>[0]): void {
    const dragging = this.injector.get<Dragging | null>('dragging', false);
    if (dragging?.context()?.prefix === MAP_RESIZE_PREFIX) {
      this.stopScroll();
      return;
    }
    super.startScroll(point);
  }
}
