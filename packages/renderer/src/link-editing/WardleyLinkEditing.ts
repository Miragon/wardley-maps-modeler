import type Canvas from 'diagram-js/lib/core/Canvas';
import type { Injector } from 'didi';
import { isReadOnly } from '../read-only/index.js';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ComponentElement, MapElement, SubmapElement } from '@miragon/wardley-schema-model';
import type { WardleyShape } from '../model/di-types.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import { createFieldError } from '../label-editing/index.js';
import { isAllowedLinkUrl, sanitizeLinkUrl } from './link-url.js';

interface ActiveLinkEdit {
  elementId: string;
  field: HTMLInputElement;
  commit: () => void;
  cleanup: () => void;
  /** Places the field below its element again after the view changed. */
  relayout: () => void;
}

/** Screen px from the element's top edge: two 28px pad rows plus their gap and a margin. */
const CONTEXT_PAD_CLEARANCE = 72;

/** Below diagram-js's own `shape.changed` listener, which redraws the element. */
const AFTER_REDRAW_PRIORITY = 500;

/** Screen px between the field and its error caption. */
const CAPTION_GAP = 4;

const INVALID_HINT = 'Use an http(s) or mailto address, or a relative path such as ./other.wmap';

/** Element types that carry an OWM `url(...)` reference. */
export function canHaveLink(shape: WardleyShape): boolean {
  return shape.wardleyType === 'component' || shape.wardleyType === 'submap';
}

/** The stored address: `url` on components, `urlRef` on submaps (both live on the businessObject). */
export function linkOf(shape: WardleyShape): string | undefined {
  const businessObject = shape.businessObject;
  if (shape.wardleyType === 'submap') return (businessObject as SubmapElement | undefined)?.urlRef;
  if (shape.wardleyType === 'component')
    return (businessObject as ComponentElement | undefined)?.url;
  return undefined;
}

/**
 * Inline editor for the link of a component or submap (OWM `url Name [address]` + `url(Name)`).
 * Commits exactly one undoable `updateProperties`; addresses outside the allowlist (http, https,
 * mailto, relative) are rejected and the field stays open marked invalid.
 */
export default class WardleyLinkEditing {
  static $inject = ['eventBus', 'canvas', 'wardleyModeling', 'injector'];

  private active: ActiveLinkEdit | null = null;
  private relayoutPending = false;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly modeling: WardleyModeling,
    private readonly injector: Injector,
  ) {
    eventBus.on(['element.mousedown', 'drag.init'], () => this.active?.commit());
    // A host's view change (restoring the view after a peer's re-import, a refit) must not commit
    // the half-typed address into the shared document (modeler-api L5): the field follows instead.
    eventBus.on('canvas.viewbox.changing', () => this.relayoutAfterViewChange());
    eventBus.on('canvas.viewbox.changed', () => this.active?.relayout());
    // A redraw of the edited element (a host resizing the map while the field is open) moves it
    // without a view change; the priority waits for the redraw.
    eventBus.on('shape.changed', AFTER_REDRAW_PRIORITY, (event: { element?: { id?: string } }) => {
      if (this.active && event.element?.id === this.active.elementId) this.active.relayout();
    });
    eventBus.on(['diagram.clear', 'diagram.destroy'], () => this.cancel());
  }

  /**
   * Sets (or with an empty value removes) the link. Returns false when the address is not allowed.
   * The exporter reads the link from the businessObject, which palette-created shapes do not have
   * yet — so a minimal one is built from the shape.
   */
  setLink(shape: WardleyShape, rawUrl: string | undefined): boolean {
    if (!canHaveLink(shape)) return false;
    const url = sanitizeLinkUrl(rawUrl ?? '');
    if (url && !isAllowedLinkUrl(url)) return false;
    if ((linkOf(shape) ?? '') === url) return true;

    const key = shape.wardleyType === 'submap' ? 'urlRef' : 'url';
    if (!shape.businessObject) {
      // diagram-js defines `businessObject` as non-deletable, so undo could not restore "absent".
      // A link-less base carries nothing the exporter reads, so attaching it outside the command
      // stack changes no output and lets undo fall back to it instead.
      shape.businessObject = {
        id: shape.id,
        elementType: shape.wardleyType,
        label: shape.wardleyLabel,
        position: { visibility: shape.visibility, evolution: shape.evolution },
      } as MapElement;
    }
    const base = shape.businessObject;
    const next: Record<string, unknown> = { ...base };
    if (url) next[key] = url;
    else delete next[key];
    this.modeling.updateProperties(shape, { businessObject: next });
    return true;
  }

  /** @param options.value field content to restore instead of the current link (re-import). */
  activate(shape: WardleyShape, options: { value?: string } = {}): void {
    if (!canHaveLink(shape) || isReadOnly(this.injector)) return;
    this.active?.commit();

    const container = this.canvas.getContainer();
    const field = document.createElement('input');
    // type="url" would flag relative paths such as ./other.wmap as :invalid.
    field.type = 'text';
    field.inputMode = 'url';
    field.spellcheck = false;
    field.autocomplete = 'off';
    field.className = 'wardley-label-input wardley-link-input';
    field.placeholder = 'https://… or ./other.wmap';
    field.setAttribute('aria-label', `Link of ${shape.wardleyLabel || shape.wardleyType}`);
    field.value = options.value ?? linkOf(shape) ?? '';
    field.style.position = 'absolute';
    const placeField = () => {
      const scale = this.canvas.zoom();
      const viewbox = this.canvas.viewbox();
      // Below the element and its two-row context pad, which sit to the right of the element's top.
      field.style.left = `${(shape.x - viewbox.x) * scale}px`;
      field.style.top = `${(shape.y - viewbox.y) * scale + CONTEXT_PAD_CLEARANCE}px`;
    };
    placeField();
    container.appendChild(field);
    field.focus();
    field.select();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      field.removeEventListener('keydown', onKey);
      field.removeEventListener('blur', onBlur);
      field.removeEventListener('input', clearInvalid);
      error.clear();
      field.remove();
      this.active = null;
    };
    const placeCaption = (caption: HTMLElement) => {
      caption.style.left = field.style.left;
      caption.style.top = `${field.offsetTop + field.offsetHeight + CAPTION_GAP}px`;
    };
    const error = createFieldError(
      container,
      field,
      `wardley-link-error-${shape.id}`,
      placeCaption,
    );
    const markInvalid = () => error.show(INVALID_HINT);
    const clearInvalid = () => error.clear();
    const tryCommit = (): boolean => {
      if (done) return true;
      const url = sanitizeLinkUrl(field.value);
      if (url && !isAllowedLinkUrl(url)) {
        markInvalid();
        return false;
      }
      cleanup();
      this.setLink(shape, url);
      return true;
    };
    // Leaving the field with a rejected address discards it rather than trapping the user.
    const commit = () => {
      if (!tryCommit()) cleanup();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup();
        this.canvas.focus();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (tryCommit()) this.canvas.focus();
      }
    };
    const onBlur = () => commit();
    field.addEventListener('keydown', onKey);
    field.addEventListener('blur', onBlur);
    field.addEventListener('input', clearInvalid);

    const relayout = () => {
      if (done) return;
      placeField();
      if (error.caption) placeCaption(error.caption);
    };
    this.active = { elementId: shape.id, field, commit, cleanup, relayout };
  }

  cancel(): void {
    this.active?.cleanup();
  }

  /** `canvas.viewbox.changing` fires before the change, and `changed` waits 300ms under `deferUpdate`. */
  private relayoutAfterViewChange(): void {
    if (!this.active || this.relayoutPending) return;
    this.relayoutPending = true;
    queueMicrotask(() => {
      this.relayoutPending = false;
      this.active?.relayout();
    });
  }

  /** Saves the open link edit (if any) as if focus had left the field; a rejected address is dropped. */
  commitActiveEdit(): void {
    this.active?.commit();
  }

  getActiveEdit(): { elementId: string; value: string } | null {
    return this.active
      ? { elementId: this.active.elementId, value: this.active.field.value }
      : null;
  }
}
