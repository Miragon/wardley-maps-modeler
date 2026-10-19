import { createMapDialog, type DialogChrome, type MapDialog } from './dialog.js';
import { element, uniqueId } from './dom.js';
import {
  mapShortcuts,
  type MapShortcutOptions,
  type ShortcutGroup,
  type ShortcutsChrome,
} from './shortcuts.js';

const DIALOG_CLASS = 'wardley-shortcuts';

/** What the dialog needs of the chrome around the map; a `@miragon/modeler-shell` handle fits. */
export interface ShortcutsDialogChrome extends ShortcutsChrome, DialogChrome {
  readonly messages: ShortcutsChrome['messages'] & DialogChrome['messages'];
}

export type ShortcutsDialog = MapDialog;

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

/**
 * The "Keyboard shortcuts…" dialog of the Help group (guide §5.4, §8): one table per group, the
 * keys as chips like the chrome tooltip's. A web app that binds keys of its own (Open…, the map
 * file's export, `?`) passes them in `options`, so the dialog lists them as well.
 */
export function createShortcutsDialog(
  chrome: ShortcutsDialogChrome,
  options: MapShortcutOptions = {},
): ShortcutsDialog {
  return createMapDialog(chrome, {
    className: DIALOG_CLASS,
    title: 'Keyboard shortcuts',
    content() {
      const body = element('div', `wardley-dialog-body ${DIALOG_CLASS}-body`);
      const prefix = uniqueId(`${DIALOG_CLASS}-group`);
      body.append(
        ...mapShortcuts(chrome, options).map((group, index) =>
          shortcutTable(group, `${prefix}-${index}`),
        ),
      );
      return [body];
    },
  });
}
