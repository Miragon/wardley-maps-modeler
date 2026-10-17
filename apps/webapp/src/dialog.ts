/**
 * Native modal dialogs (`<dialog>` + showModal): focus stays inside, Escape closes, the page
 * behind is inert. On top of that: close on a backdrop click and give focus back to a control
 * that still exists (menu items are hidden by the time a dialog closes).
 */

export interface AppDialog {
  readonly element: HTMLDialogElement;
  open(options?: {
    returnFocusTo?: HTMLElement | null | undefined;
    focus?: HTMLElement | null | undefined;
  }): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * How the user last interacted: a dialog closed with the pointer (close button, backdrop) leaves
 * focus on the page, where canvas shortcuts such as Delete keep working; one closed from the
 * keyboard (Escape, Enter) returns focus to the control it came from.
 */
let lastInteraction: 'pointer' | 'keyboard' = 'pointer';
document.addEventListener('pointerdown', () => (lastInteraction = 'pointer'), true);
document.addEventListener('keydown', () => (lastInteraction = 'keyboard'), true);

export function anyDialogOpen(): boolean {
  return !!document.querySelector('dialog[open]');
}

export function setupDialog(element: HTMLDialogElement): AppDialog {
  let returnFocusTo: HTMLElement | null = null;
  let pressStartedOnBackdrop = false;

  // A click whose press started inside the panel (e.g. selecting text, then releasing outside)
  // must not close the dialog; only a press and release on the backdrop does.
  element.addEventListener('pointerdown', (event) => {
    pressStartedOnBackdrop = event.target === element;
  });
  element.addEventListener('click', (event) => {
    if (event.target === element && pressStartedOnBackdrop) element.close();
    pressStartedOnBackdrop = false;
  });
  element.addEventListener('close', () => {
    const target = returnFocusTo;
    returnFocusTo = null;
    if (lastInteraction === 'pointer') {
      // The browser hands focus back to the opener itself; drop it to the page instead.
      // A dialog opened in its place (e.g. "Fix in OWM-DSL") keeps its focus.
      queueMicrotask(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && !focused.closest('dialog[open]')) focused.blur();
      });
      return;
    }
    if (target?.isConnected && target.offsetParent !== null) target.focus();
  });

  return {
    element,
    open(options = {}) {
      returnFocusTo =
        options.returnFocusTo ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      if (!element.open) element.showModal();
      options.focus?.focus();
    },
    close() {
      if (element.open) element.close();
    },
    isOpen() {
      return element.open;
    },
  };
}
