import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import { isWardleyShape, type WardleyShape } from '../model/di-types.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';

interface ActiveEdit {
  field: HTMLInputElement | HTMLTextAreaElement;
  /** Speichert den aktuellen Wert und schliesst (für Enter, Blur, Klick nach außen). */
  commit: () => void;
  /** Verwirft und schliesst (nur für Escape). */
  cleanup: () => void;
}

/**
 * Eigenes Inline-Label-Editing als HTML-Overlay (bewusst nicht diagram-js-direct-editing, §8.5).
 * Commit laeuft ueber `wardleyModeling.updateLabel` -> commandStack (Undo, P4).
 * Notizen werden in einer `<textarea>` editiert (mehrzeilig: Enter = Zeilenumbruch,
 * Cmd/Ctrl+Enter oder Klick nach außen = speichern); alle anderen in einem `<input>` (Enter = speichern).
 */
export default class WardleyLabelEditing {
  static $inject = ['eventBus', 'canvas', 'wardleyModeling', 'wardleyElementFactory'];

  private active: ActiveEdit | null = null;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly modeling: WardleyModeling,
    private readonly factory: WardleyElementFactory,
  ) {
    eventBus.on('element.dblclick', (event: { element?: unknown }) => {
      if (isWardleyShape(event.element)) this.activate(event.element);
    });
    // Klick/Drag/Pan außerhalb des Feldes = SPEICHERN (nicht verwerfen). Nur Escape verwirft.
    eventBus.on(['element.mousedown', 'drag.init', 'canvas.viewbox.changing'], () =>
      this.active?.commit(),
    );
  }

  activate(element: WardleyShape): void {
    this.active?.commit();

    const container = this.canvas.getContainer();
    const scale = this.canvas.zoom();
    const vb = this.canvas.viewbox();
    const isNote = element.wardleyType === 'note';
    const left = (element.x + element.width + 6 - vb.x) * scale;
    const top = (element.y + element.height / 2 - 11 - vb.y) * scale;

    const field = document.createElement(isNote ? 'textarea' : 'input') as
      | HTMLInputElement
      | HTMLTextAreaElement;
    field.className = isNote ? 'wardley-label-input wardley-label-textarea' : 'wardley-label-input';
    field.value = element.wardleyLabel ?? '';
    if (isNote) {
      const ta = field as HTMLTextAreaElement;
      ta.rows = Math.max(2, field.value.split('\n').length);
      ta.wrap = 'off';
    } else {
      (field as HTMLInputElement).type = 'text';
    }
    field.style.position = 'absolute';
    field.style.left = `${left}px`;
    field.style.top = `${top}px`;
    container.appendChild(field);
    field.focus();
    field.select();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      field.removeEventListener('keydown', onKey as EventListener);
      field.removeEventListener('blur', onBlur);
      field.remove();
      this.active = null;
    };
    const commit = () => {
      if (done) return;
      const value = field.value.trim();
      const changed = value && value !== element.wardleyLabel;
      cleanup();
      if (!changed) return;
      // Eindeutigkeit nur fuer verlinkbare Knoten erzwingen (doppelte Namen wuerden beim DSL-
      // Round-Trip Knoten kollabieren lassen -> Pfeile verschwinden). Notizen sind nie Kanten-
      // Endpunkte und duerfen sich daher wiederholen (z.B. mehrere "Risiko"-Hinweise).
      const finalLabel = isNote ? value : this.factory.uniqueLabel(value, element.id);
      this.modeling.updateLabel(element, finalLabel);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        return;
      }
      if (e.key === 'Enter') {
        // Notiz: nur mit Cmd/Ctrl speichern -> sonst Zeilenumbruch. Andere: Enter speichert.
        if (isNote && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        commit();
      }
    };
    const onBlur = () => commit();
    field.addEventListener('keydown', onKey as EventListener);
    field.addEventListener('blur', onBlur);

    this.active = { field, commit, cleanup };
  }

  cancel(): void {
    this.active?.cleanup();
  }
}
