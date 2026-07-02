import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from '../model/di-types.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';

interface ActiveEdit {
  field: HTMLInputElement | HTMLTextAreaElement;
  /** Saves the current value and closes (for Enter, blur, click outside). */
  commit: () => void;
  /** Discards and closes (only for Escape). */
  cleanup: () => void;
}

/**
 * Defuses DSL metacharacters in labels: in the OWM DSL, names double as references —
 * `->`, `;` and square brackets would corrupt edge/coordinate lines on re-import.
 */
function sanitizeLabel(raw: string): string {
  return raw
    .replace(/->/g, '→') // -> would be the edge operator
    .replace(/;/g, ',') // ; separates link annotations
    .replace(/\[/g, '(') // [..] would be a coordinate tuple
    .replace(/\]/g, ')')
    .trim();
}

/**
 * Custom inline label editing as an HTML overlay (deliberately not diagram-js direct-editing, §8.5).
 * Commit goes through `wardleyModeling.updateLabel` -> commandStack (undo, P4).
 * Notes are edited in a `<textarea>` (multiline: Enter = line break, Cmd/Ctrl+Enter or click outside
 * = save); everything else in an `<input>` (Enter = save).
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
      else if (isWardleyConnection(event.element)) this.activateConnection(event.element);
    });
    // Click/drag/pan outside the field = SAVE (not discard). Only Escape discards.
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
      HTMLInputElement | HTMLTextAreaElement;
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
      // Enforce metacharacter protection also on RENAME — the DSL references elements by their
      // name; unescaped `->`, `;` or brackets would corrupt edge/coordinate lines on re-import.
      const value = sanitizeLabel(field.value);
      const changed = value && value !== element.wardleyLabel;
      cleanup();
      if (!changed) return;
      // Enforce uniqueness only for linkable nodes (duplicate names would collapse nodes on the
      // DSL round-trip -> arrows disappear). Notes are never edge endpoints and may therefore
      // repeat (e.g. several "Risk" hints).
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
        // Note: save only with Cmd/Ctrl -> otherwise line break. Others: Enter saves.
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

  /**
   * Inline editing for connections: a flow edits its value (`+'value'>`), a dependency its
   * `; annotation` text. An empty input clears the field. Undo-safe via updateProperties.
   */
  activateConnection(conn: WardleyConnection): void {
    this.active?.commit();

    const container = this.canvas.getContainer();
    const scale = this.canvas.zoom();
    const vb = this.canvas.viewbox();
    const first = conn.waypoints[0];
    const last = conn.waypoints[conn.waypoints.length - 1];
    if (!first || !last) return;
    const isFlow = conn.wardleyType === 'flow';

    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'wardley-label-input';
    field.placeholder = isFlow ? 'flow value (e.g. $0.10)' : 'link annotation';
    field.value = (isFlow ? conn.flowValue : conn.linkLabel) ?? '';
    field.style.position = 'absolute';
    field.style.left = `${((first.x + last.x) / 2 - 60 - vb.x) * scale}px`;
    field.style.top = `${((first.y + last.y) / 2 - 26 - vb.y) * scale}px`;
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
      // Defuse DSL metacharacters: `'` delimits the flow value, `;` starts the annotation.
      const value = field.value.replace(/'/g, '’').replace(/;/g, ',').trim();
      const current = (isFlow ? conn.flowValue : conn.linkLabel) ?? '';
      cleanup();
      if (value === current) return;
      // Keep the businessObject in sync — the exporter prefers it for imported edges.
      const bo = conn.businessObject;
      const nextBo = bo
        ? isFlow
          ? { ...bo, ...(value ? { flowValue: value } : {}) }
          : { ...bo, ...(value ? { label: value } : {}) }
        : undefined;
      if (nextBo && !value) {
        if (isFlow) delete (nextBo as { flowValue?: string }).flowValue;
        else delete (nextBo as { label?: string }).label;
      }
      this.modeling.updateProperties(conn, {
        [isFlow ? 'flowValue' : 'linkLabel']: value || undefined,
        ...(nextBo ? { businessObject: nextBo } : {}),
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      } else if (e.key === 'Enter') {
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
