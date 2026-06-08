import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import type { WardleyShape } from '../model/di-types.js';
import { NOTE_COLORS } from '../draw/styles.js';

/**
 * Compact color picker (bpmn.io-style): a 3x3 grid of small color squares (no text), opened from a
 * note's context pad. Uses its own popover (instead of diagram-js PopupMenu) so the swatch grid can
 * be rendered exactly and without text. Sets the color via `wardleyModeling` (undo/redo). First
 * cell = "no color".
 */
export default class WardleyColorPicker {
  static $inject = ['canvas', 'eventBus', 'wardleyModeling'];

  private popover: HTMLElement | undefined;

  private readonly onDocPointer = (e: MouseEvent): void => {
    if (this.popover && !this.popover.contains(e.target as Node)) this.close();
  };
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };

  constructor(
    private readonly canvas: Canvas,
    eventBus: EventBus,
    private readonly modeling: WardleyModeling,
  ) {
    // Close on pan/zoom, drag or re-import (otherwise the popover ends up misplaced).
    eventBus.on(['canvas.viewbox.changing', 'drag.init', 'diagram.clear'], () => this.close());
  }

  /** Opens the swatch grid for `shape` at the click position (viewport coordinates). */
  open(shape: WardleyShape, clientX: number, clientY: number): void {
    this.close();
    const container = this.canvas.getContainer();
    const rect = container.getBoundingClientRect();

    const pop = document.createElement('div');
    pop.className = 'wardley-color-picker';

    const swatches: ReadonlyArray<{ value: string | undefined; title: string; cls: string }> = [
      { value: undefined, title: 'No color', cls: 'wardley-cp-none' },
      ...NOTE_COLORS.map((c) => ({ value: c.value as string, title: c.name, cls: '' })),
    ];
    for (const s of swatches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `wardley-cp-swatch ${s.cls}`.trim();
      btn.title = s.title;
      if (s.value) btn.style.background = s.value;
      if ((shape.color ?? undefined) === s.value) btn.classList.add('wardley-cp-active');
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.modeling.setColor(shape, s.value);
        this.close();
      });
      pop.append(btn);
    }

    container.appendChild(pop);

    // Keep it within the (overflow:hidden) container.
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const left = Math.max(4, Math.min(clientX - rect.left, cw - pw - 4));
    const top = Math.max(4, Math.min(clientY - rect.top, ch - ph - 4));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    this.popover = pop;
    // Attach listeners with a delay so the opening click does not immediately close the popover.
    setTimeout(() => {
      document.addEventListener('click', this.onDocPointer, true);
      document.addEventListener('keydown', this.onKey, true);
    }, 0);
  }

  close(): void {
    if (!this.popover) return;
    this.popover.remove();
    this.popover = undefined;
    document.removeEventListener('click', this.onDocPointer, true);
    document.removeEventListener('keydown', this.onKey, true);
  }
}
