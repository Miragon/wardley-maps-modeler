import { CLOSE_ICON, element, uniqueId } from './dom.js';

/** What a dialog needs of the chrome around the map; a `@miragon/modeler-shell` handle fits. */
export interface DialogChrome {
  /** Where the dialog lives (the shell root), so it shares the chrome's mode and fonts. */
  readonly root: HTMLElement;
  readonly messages: { readonly close: string };
  /** The control the focus returns to once the dialog closes. */
  readonly menu: { readonly trigger: HTMLElement };
}

export interface MapDialog {
  open(): void;
  isOpen(): boolean;
  close(): void;
  destroy(): void;
}

export interface MapDialogParts {
  /** Class of the `<dialog>` next to `wardley-dialog`, for the dialog's own rules. */
  readonly className: string;
  readonly title: string;
  /** The parts below the header (body, footer), built once on the first open. */
  content(close: () => void): Node[];
  /** Runs before every open, while the dialog is still closed. */
  beforeOpen?(): void;
  /** Runs after every open, once the dialog shows and holds the focus. */
  afterOpen?(): void;
  /** Runs after every close, before the focus goes back. */
  afterClose?(): void;
}

/** A footer button of guide §8: primary (the confirming action), secondary or ghost. */
export function dialogButton(
  label: string,
  variant: 'primary' | 'secondary' | 'ghost',
): HTMLButtonElement {
  const created = element('button', 'wardley-button', label);
  created.type = 'button';
  created.dataset['variant'] = variant;
  return created;
}

function header(
  chrome: DialogChrome,
  title: string,
  titleId: string,
  onClose: () => void,
): HTMLElement {
  const head = element('header', 'wardley-dialog-header');
  const heading = element('h3', 'wardley-dialog-title', title);
  heading.id = titleId;
  const close = element('button', 'wardley-dialog-close');
  close.type = 'button';
  close.setAttribute('aria-label', chrome.messages.close);
  close.innerHTML = CLOSE_ICON;
  close.addEventListener('click', onClose);
  head.append(heading, close);
  return head;
}

/**
 * A dialog of the map's chrome (guide §8, "Modeler dialogs" of the shell's API): a native modal
 * <dialog> inside the chrome's root, so the browser keeps the focus inside it and closes it on
 * Escape. Built on the first open and kept (closed) afterwards; `destroy()` removes it. The host
 * calls it with the diagram's teardown, since the chrome removes only what it added itself.
 */
export function createMapDialog(chrome: DialogChrome, parts: MapDialogParts): MapDialog {
  let dialog: HTMLDialogElement | undefined;

  function build(): HTMLDialogElement {
    const titleId = uniqueId(`${parts.className}-title`);
    const created = element('dialog', `wardley-dialog ${parts.className}`);
    created.setAttribute('aria-labelledby', titleId);
    const close = () => created.close();
    const panel = element('div', 'wardley-dialog-panel');
    panel.append(header(chrome, parts.title, titleId, close), ...parts.content(close));
    created.append(panel);
    // A press that started on the panel (selecting text, then releasing outside) is no backdrop
    // click; the panel covers all of the dialog's own box, so the backdrop is the dialog itself.
    let pressedOnBackdrop = false;
    created.addEventListener('pointerdown', (event) => {
      pressedOnBackdrop = event.target === created;
    });
    created.addEventListener('click', (event) => {
      if (event.target === created && pressedOnBackdrop) created.close();
      pressedOnBackdrop = false;
    });
    created.addEventListener('close', () => {
      parts.afterClose?.();
      if (!chrome.menu.trigger.hidden) chrome.menu.trigger.focus({ preventScroll: true });
    });
    chrome.root.append(created);
    return created;
  }

  return {
    open() {
      dialog ??= build();
      if (dialog.open) return;
      parts.beforeOpen?.();
      dialog.showModal();
      parts.afterOpen?.();
    },
    close() {
      dialog?.close();
    },
    isOpen: () => dialog?.open === true,
    destroy() {
      dialog?.remove();
      dialog = undefined;
    },
  };
}
