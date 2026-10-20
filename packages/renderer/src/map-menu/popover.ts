import type { Modeler } from '../Modeler.js';
import { READ_ONLY_CHANGED } from '../read-only/index.js';
import { element, uniqueId } from './dom.js';

/** What a popover needs of the chrome around the map; a `@miragon/modeler-shell` handle fits. */
export interface PopoverChrome {
  /** Where the popover lives (the shell root): it anchors at the dropdown's place there. */
  readonly root: HTMLElement;
  /** The control the focus returns to after Escape or Done. */
  readonly menu: { readonly trigger: HTMLElement };
}

/** Why a popover closes: the user is done, an import replaced the map, or the canvas locked. */
export type PopoverEnd = 'done' | 'import' | 'cancel';

export interface PopoverHandle {
  open(): void;
  isOpen(): boolean;
  /** Closes as if the user were done: the previewed change becomes one edit. */
  close(): void;
  destroy(): void;
}

export interface PopoverParts {
  readonly className: string;
  readonly title: string;
  /** Fills the body (fields) and the footer (buttons) once; `done` closes like Done. */
  build(body: HTMLElement, footer: HTMLElement, done: () => void): void;
  /** Reads the map into the fields on every open; returns the field to focus. */
  opened(): HTMLElement | undefined;
  /** Commits the preview (`done`) or drops it (`import`: the map is gone, `cancel`: revert). */
  closed(end: PopoverEnd): void;
}

/**
 * A popover of guide §5.4: a menu entry that needs the canvas preview opens it at the dropdown's
 * place, without a backdrop, as a non-modal `role="dialog"` labelled by its title. Escape and a
 * click outside close it; the focus returns to the menu trigger after Escape and Done, while a
 * click outside leaves it on what was clicked.
 */
export function createPopover(
  chrome: PopoverChrome,
  parts: PopoverParts,
): PopoverHandle & { end(end: PopoverEnd): void } {
  let panel: HTMLElement | undefined;

  const onPointerDown = (event: PointerEvent) => {
    if (panel && !panel.contains(event.target as Node)) end('done');
  };
  // A click into the IDE's workbench or another frame takes the focus without a pointerdown here.
  const onWindowBlur = () => end('done');
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    end('done', { returnFocus: true });
  };

  function build(): HTMLElement {
    const titleId = uniqueId(`${parts.className}-title`);
    const created = element('div', `wardley-popover ${parts.className}`);
    created.setAttribute('role', 'dialog');
    created.setAttribute('aria-labelledby', titleId);
    created.hidden = true;
    const title = element('h2', 'wardley-popover-title', parts.title);
    title.id = titleId;
    const body = element('div', 'wardley-popover-body');
    const footer = element('div', 'wardley-popover-footer');
    parts.build(body, footer, () => end('done', { returnFocus: true }));
    created.append(title, body, footer);
    created.addEventListener('keydown', onKeyDown);
    chrome.root.append(created);
    return created;
  }

  function end(why: PopoverEnd, options: { returnFocus?: boolean } = {}): void {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('blur', onWindowBlur);
    parts.closed(why);
    if (options.returnFocus && !chrome.menu.trigger.hidden) {
      chrome.menu.trigger.focus({ preventScroll: true });
    }
  }

  return {
    open() {
      panel ??= build();
      if (!panel.hidden) return;
      panel.hidden = false;
      const field = parts.opened();
      document.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('blur', onWindowBlur);
      field?.focus();
      if (field instanceof HTMLInputElement) field.select();
    },
    isOpen: () => panel?.hidden === false,
    close: () => end('done'),
    end: (why) => end(why),
    destroy() {
      end('cancel');
      panel?.remove();
      panel = undefined;
    },
  };
}

/** A labelled field of guide §8: the label above, 4px apart, an error below it when refused. */
export function field(
  label: string,
  control: HTMLInputElement | HTMLSelectElement,
): { wrapper: HTMLElement; showError(message: string): void; clearError(): void } {
  const wrapper = element('div', 'wardley-field');
  const id = uniqueId('wardley-field');
  const caption = element('label', 'wardley-field-label', label);
  caption.htmlFor = id;
  control.id = id;
  control.classList.add('wardley-field-input');
  wrapper.append(caption, control);
  let error: HTMLElement | undefined;
  return {
    wrapper,
    showError(message) {
      if (!error) {
        error = element('p', 'wardley-field-error');
        error.id = `${id}-error`;
        error.setAttribute('role', 'alert');
        wrapper.append(error);
      }
      error.textContent = message;
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', error.id);
    },
    clearError() {
      error?.remove();
      error = undefined;
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-describedby');
    },
  };
}

/**
 * Closes `popover` without committing when the map is replaced (an import: the preview went with
 * the old map) or turns read-only (the preview is put back), and stops listening on destroy.
 */
export function withMapListeners(
  modeler: Modeler,
  popover: PopoverHandle & { end(end: PopoverEnd): void },
): PopoverHandle {
  const onImport = () => popover.end('import');
  const onReadOnly = (event: unknown) => {
    if ((event as { readOnly?: boolean }).readOnly) popover.end('cancel');
  };
  modeler.on('import.done', onImport);
  modeler.on(READ_ONLY_CHANGED, onReadOnly);
  return {
    open: () => popover.open(),
    isOpen: () => popover.isOpen(),
    close: () => popover.close(),
    destroy() {
      modeler.off('import.done', onImport);
      modeler.off(READ_ONLY_CHANGED, onReadOnly);
      popover.destroy();
    },
  };
}
