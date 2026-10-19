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
}

/** Screen px from the element's top edge: two 28px pad rows plus their gap and a margin. */
const CONTEXT_PAD_CLEARANCE = 72;

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

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly modeling: WardleyModeling,
    private readonly injector: Injector,
  ) {
    eventBus.on(['element.mousedown', 'drag.init', 'canvas.viewbox.changing'], () =>
      this.active?.commit(),
    );
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
    const scale = this.canvas.zoom();
    const viewbox = this.canvas.viewbox();
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
    // Below the element and its two-row context pad, which sit to the right of the element's top.
    field.style.left = `${(shape.x - viewbox.x) * scale}px`;
    field.style.top = `${(shape.y - viewbox.y) * scale + CONTEXT_PAD_CLEARANCE}px`;
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
    const error = createFieldError(
      container,
      field,
      `wardley-link-error-${shape.id}`,
      (caption) => {
        caption.style.left = field.style.left;
        caption.style.top = `${field.offsetTop + field.offsetHeight + CAPTION_GAP}px`;
      },
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

    this.active = { elementId: shape.id, field, commit, cleanup };
  }

  cancel(): void {
    this.active?.cleanup();
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
