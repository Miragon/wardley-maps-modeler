/**
 * Read-only dialogs: the import issues list behind "Show details" and the keyboard shortcuts
 * overview (generated from the shortcut list).
 */
import type { AppDialog } from './dialog.js';
import { describeWarning, type WarningLike, type WarningRow } from './map-file.js';
import { SHORTCUT_GROUPS, SHORTCUTS, formatKeys } from './shortcuts.js';

export function setupIssuesDialog(
  dialog: AppDialog,
  list: HTMLOListElement,
  closeButton: HTMLButtonElement,
  fixButton: HTMLButtonElement,
  onFix: (firstIssue: WarningRow | undefined) => void,
): { open(warnings: readonly WarningLike[]): void } {
  let firstIssue: WarningRow | undefined;
  closeButton.addEventListener('click', () => dialog.close());
  fixButton.addEventListener('click', () => {
    dialog.close();
    onFix(firstIssue);
  });

  return {
    open(warnings) {
      const rows = warnings.map(describeWarning);
      firstIssue = rows.find((row) => row.line !== undefined);
      list.replaceChildren(
        ...rows.map((row) => {
          const item = document.createElement('li');
          const head = document.createElement('span');
          head.className = 'issue-message';
          head.textContent =
            row.line !== undefined ? `Line ${row.line}: ${row.message}` : row.message;
          item.append(head);
          if (row.source) {
            const source = document.createElement('code');
            source.className = 'issue-source';
            source.textContent = row.source;
            item.append(source);
          }
          return item;
        }),
      );
      fixButton.hidden = firstIssue === undefined;
      dialog.open({ focus: closeButton });
    },
  };
}

function keyCaps(combo: string, apple: boolean): HTMLElement {
  const kbd = document.createElement('kbd');
  kbd.textContent = formatKeys(combo, apple);
  return kbd;
}

export function renderShortcuts(container: HTMLElement, apple: boolean): void {
  container.replaceChildren(
    ...SHORTCUT_GROUPS.map((group) => {
      const entries = SHORTCUTS.filter((entry) => entry.group === group);
      const section = document.createElement('section');
      section.className = 'shortcut-group';
      section.classList.toggle(
        'shortcut-group--wide',
        entries.every((entry) => !entry.keys.length),
      );
      const heading = document.createElement('h3');
      heading.textContent = group;
      const list = document.createElement('dl');
      for (const shortcut of entries) {
        const action = document.createElement('dt');
        action.textContent = shortcut.action;
        const how = document.createElement('dd');
        shortcut.keys.forEach((combo, index) => {
          if (index > 0) how.append(' or ');
          how.append(keyCaps(combo, apple));
        });
        if (shortcut.gesture) {
          if (shortcut.keys.length) how.append(' · ');
          const gesture = document.createElement('span');
          gesture.className = 'shortcut-gesture';
          gesture.textContent = shortcut.gesture;
          how.append(gesture);
        }
        list.append(action, how);
      }
      section.append(heading, list);
      return section;
    }),
  );
}
