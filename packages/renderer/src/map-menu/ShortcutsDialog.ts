import { CLOSE_ICON, element, uniqueId } from './dom.js';
import { mapShortcuts, type ShortcutGroup, type ShortcutsChrome } from './shortcuts.js';

const DIALOG_CLASS = 'wardley-shortcuts';

/** What the dialog needs of the chrome around the map; a `@miragon/modeler-shell` handle fits. */
export interface ShortcutsDialogChrome extends ShortcutsChrome {
  /** Where the dialog lives (the shell root), so it shares the chrome's mode and fonts. */
  readonly root: HTMLElement;
  readonly messages: ShortcutsChrome['messages'] & { readonly close: string };
  /** The control the focus returns to once the dialog closes. */
  readonly menu: { readonly trigger: HTMLElement };
}

export interface ShortcutsDialog {
  open(): void;
  isOpen(): boolean;
  close(): void;
  destroy(): void;
}

function shortcutTable(group: ShortcutGroup, titleId: string): HTMLElement {
  const section = element('section', `${DIALOG_CLASS}-group`);
  const heading = element('h4', `${DIALOG_CLASS}-group-title`, group.title);
  heading.id = titleId;
  const table = element('table', `${DIALOG_CLASS}-table`);
  table.setAttribute('aria-labelledby', titleId);
  const body = table.createTBody();
  for (const row of group.rows) {
    const line = body.insertRow();
    const action = element('th', `${DIALOG_CLASS}-action`, row.action);
    action.scope = 'row';
    const keys = element('td', `${DIALOG_CLASS}-keys`);
    for (const key of row.keys) keys.append(element('kbd', `${DIALOG_CLASS}-key`, key));
    line.append(action, keys);
  }
  section.append(heading, table);
  return section;
}

function dialogContent(
  chrome: ShortcutsDialogChrome,
  titleId: string,
  onClose: () => void,
): HTMLElement {
  const panel = element('div', `${DIALOG_CLASS}-panel`);
  const header = element('header', `${DIALOG_CLASS}-header`);
  const title = element('h3', `${DIALOG_CLASS}-title`, 'Keyboard shortcuts');
  title.id = titleId;
  const close = element('button', `${DIALOG_CLASS}-close`);
  close.type = 'button';
  close.setAttribute('aria-label', chrome.messages.close);
  close.innerHTML = CLOSE_ICON;
  close.addEventListener('click', onClose);
  header.append(title, close);

  const body = element('div', `${DIALOG_CLASS}-body`);
  body.append(
    ...mapShortcuts(chrome).map((group, index) => shortcutTable(group, `${titleId}-${index}`)),
  );
  panel.append(header, body);
  return panel;
}

/**
 * The "Keyboard shortcuts…" dialog of the Help group (guide §5.4, §8), a native modal <dialog>
 * inside the chrome's root: the browser keeps the focus inside it and closes it on Escape. Built on
 * the first open and kept (closed) afterwards; `destroy()` removes it, the host calls it with the
 * diagram's teardown, since the chrome removes only what it added itself.
 */
export function createShortcutsDialog(chrome: ShortcutsDialogChrome): ShortcutsDialog {
  let dialog: HTMLDialogElement | undefined;

  function build(): HTMLDialogElement {
    const titleId = uniqueId(`${DIALOG_CLASS}-title`);
    const created = element('dialog', DIALOG_CLASS);
    created.setAttribute('aria-labelledby', titleId);
    created.append(dialogContent(chrome, titleId, () => created.close()));
    // A click on the backdrop targets the <dialog> itself; the panel covers all of its own box.
    created.addEventListener('click', (event) => {
      if (event.target === created) created.close();
    });
    created.addEventListener('close', () => {
      if (!chrome.menu.trigger.hidden) chrome.menu.trigger.focus({ preventScroll: true });
    });
    chrome.root.append(created);
    return created;
  }

  return {
    open() {
      dialog ??= build();
      if (!dialog.open) dialog.showModal();
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
