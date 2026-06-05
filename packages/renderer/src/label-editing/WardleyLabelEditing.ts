import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import { isWardleyShape, type WardleyShape } from '../model/di-types.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';

interface ActiveEdit {
  input: HTMLInputElement;
  cleanup: () => void;
}

/**
 * Eigenes Inline-Label-Editing als HTML-Overlay (bewusst nicht diagram-js-direct-editing, §8.5).
 * Commit laeuft ueber `wardleyModeling.updateLabel` -> commandStack (Undo, P4).
 */
export default class WardleyLabelEditing {
  static $inject = ['eventBus', 'canvas', 'wardleyModeling'];

  private active: ActiveEdit | null = null;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly modeling: WardleyModeling,
  ) {
    eventBus.on('element.dblclick', (event: { element?: unknown }) => {
      if (isWardleyShape(event.element)) this.activate(event.element);
    });
    eventBus.on(['element.mousedown', 'drag.init', 'canvas.viewbox.changing'], () => this.cancel());
  }

  activate(element: WardleyShape): void {
    this.cancel();

    const container = this.canvas.getContainer();
    const scale = this.canvas.zoom();
    const vb = this.canvas.viewbox();
    const left = (element.x + element.width + 6 - vb.x) * scale;
    const top = (element.y + element.height / 2 - 11 - vb.y) * scale;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'wardley-label-input';
    input.value = element.wardleyLabel ?? '';
    input.style.position = 'absolute';
    input.style.left = `${left}px`;
    input.style.top = `${top}px`;
    container.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur', onBlur);
      input.remove();
      this.active = null;
    };
    const commit = () => {
      const value = input.value.trim();
      const changed = value && value !== element.wardleyLabel;
      cleanup();
      if (changed) this.modeling.updateLabel(element, value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    };
    const onBlur = () => commit();
    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);

    this.active = { input, cleanup };
  }

  cancel(): void {
    this.active?.cleanup();
  }
}
