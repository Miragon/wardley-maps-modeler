import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import type { WardleyShape } from '../model/di-types.js';
import { NOTE_COLORS } from '../draw/styles.js';

/**
 * Kompakter Farb-Picker (bpmn.io-artig): ein 3x3-Raster kleiner Farb-Quadrate (kein Text),
 * angeklickt am ContextPad einer Notiz. Eigener Popover (statt diagram-js PopupMenu), damit das
 * Swatch-Grid exakt und ohne Text dargestellt werden kann. Setzt die Farbe via `wardleyModeling`
 * (Undo/Redo). Erste Zelle = „keine Farbe".
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
    // Bei Pan/Zoom, Drag oder Re-Import schließen (sonst steht der Popover falsch).
    eventBus.on(['canvas.viewbox.changing', 'drag.init', 'diagram.clear'], () => this.close());
  }

  /** Öffnet das Swatch-Raster für `shape` an der Klickposition (Viewport-Koordinaten). */
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

    // Innerhalb des (overflow:hidden) Containers halten.
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const left = Math.max(4, Math.min(clientX - rect.left, cw - pw - 4));
    const top = Math.max(4, Math.min(clientY - rect.top, ch - ph - 4));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    this.popover = pop;
    // Listener verzögert anhängen, damit der öffnende Klick den Popover nicht sofort schließt.
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
