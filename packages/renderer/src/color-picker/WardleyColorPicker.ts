import type Canvas from 'diagram-js/lib/core/Canvas';
import type { Injector } from 'didi';
import { isReadOnly } from '../read-only/index.js';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import type { WardleyShape } from '../model/di-types.js';
import { NOTE_COLORS } from '../draw/styles.js';

/** Must match `grid-template-columns` of `.wardley-color-picker` (arrow-key navigation). */
const GRID_COLUMNS = 3;

const GRID_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -GRID_COLUMNS,
  ArrowDown: GRID_COLUMNS,
};

/**
 * Compact color picker (bpmn.io-style): a 3x3 grid of small color squares (no text), opened from a
 * note's context pad. Uses its own popover (instead of diagram-js PopupMenu) so the swatch grid can
 * be rendered exactly and without text. Sets the color via `wardleyModeling` (undo/redo). First
 * cell = "no color". Keyboard: focus starts on the active swatch, arrow keys move through the grid,
 * Enter/Space picks, Escape closes; focus then returns to the canvas.
 */
export default class WardleyColorPicker {
  static $inject = ['canvas', 'eventBus', 'wardleyModeling', 'injector'];

  private popover: HTMLElement | undefined;

  private readonly onDocPointer = (e: MouseEvent): void => {
    if (this.popover && !this.popover.contains(e.target as Node)) this.close();
  };
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close({ restoreFocus: true });
    }
  };

  constructor(
    private readonly canvas: Canvas,
    eventBus: EventBus,
    private readonly modeling: WardleyModeling,
    private readonly injector: Injector,
  ) {
    // Close on pan/zoom, drag or re-import (otherwise the popover ends up misplaced).
    eventBus.on(['canvas.viewbox.changing', 'drag.init', 'diagram.clear'], () => this.close());
  }

  /** Opens the swatch grid for `shape` at the click position (viewport coordinates). */
  open(shape: WardleyShape, clientX: number, clientY: number): void {
    this.close();
    if (isReadOnly(this.injector)) return;
    const container = this.canvas.getContainer();
    const rect = container.getBoundingClientRect();

    const pop = document.createElement('div');
    pop.className = 'wardley-color-picker';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Color');

    const swatches: ReadonlyArray<{ value: string | undefined; title: string; cls: string }> = [
      { value: undefined, title: 'No color', cls: 'wardley-cp-none' },
      ...NOTE_COLORS.map((c) => ({ value: c.value as string, title: c.name, cls: '' })),
    ];
    const buttons: HTMLButtonElement[] = [];
    let activeButton: HTMLButtonElement | undefined;
    for (const s of swatches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `wardley-cp-swatch ${s.cls}`.trim();
      btn.title = s.title;
      btn.setAttribute('aria-label', s.title);
      if (s.value) btn.style.background = s.value;
      const isActive = (shape.color ?? undefined) === s.value;
      btn.setAttribute('aria-pressed', String(isActive));
      if (isActive) {
        btn.classList.add('wardley-cp-active');
        activeButton = btn;
      }
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.modeling.setColor(shape, s.value);
        this.close({ restoreFocus: true });
      });
      buttons.push(btn);
      pop.append(btn);
    }
    pop.addEventListener('keydown', (event) => this.onGridKeydown(event, buttons));

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
    (activeButton ?? buttons[0])?.focus({ preventScroll: true });
    // Attach listeners with a delay so the opening click does not immediately close the popover.
    setTimeout(() => {
      document.addEventListener('click', this.onDocPointer, true);
      document.addEventListener('keydown', this.onKey, true);
    }, 0);
  }

  isOpen(): boolean {
    return !!this.popover;
  }

  close(options: { restoreFocus?: boolean } = {}): void {
    if (!this.popover) return;
    const hadFocus = this.popover.contains(document.activeElement);
    this.popover.remove();
    this.popover = undefined;
    document.removeEventListener('click', this.onDocPointer, true);
    document.removeEventListener('keydown', this.onKey, true);
    if (options.restoreFocus || hadFocus) this.canvas.focus();
  }

  private onGridKeydown(event: KeyboardEvent, buttons: HTMLButtonElement[]): void {
    const step = GRID_STEPS[event.key];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (step !== undefined) next = index < 0 ? 0 : index + step;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key === 'Tab') {
      // Keep focus inside the dialog while it is open.
      next = index + (event.shiftKey ? -1 : 1);
      next = (next + buttons.length) % buttons.length;
    }
    if (next === undefined) return;
    // Arrow keys must not also nudge the selected element (document-level shortcut).
    event.preventDefault();
    event.stopPropagation();
    buttons[Math.min(buttons.length - 1, Math.max(0, next))]?.focus();
  }
}
