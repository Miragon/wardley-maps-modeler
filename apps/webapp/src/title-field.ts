/**
 * Quiet inline map title next to the menu (Excalidraw's file-name pattern): looks like text,
 * edits like a field. Enter or leaving the field commits through the modeler's undoable setTitle,
 * Escape reverts. The browser tab and download names follow the title.
 */
import type { Modeler } from '@miragon/wardley-renderer';
import { isDefaultTitle } from './map-file.js';

const APP_NAME = 'Wardley Mapping';

export interface TitleField {
  /** Re-reads the title from the map (after imports, undo/redo, config changes). */
  sync(): void;
}

export function currentTitle(viewer: Modeler): string {
  return viewer.exportMap().config.title ?? '';
}

export function setupTitleField(
  input: HTMLInputElement,
  viewer: Modeler,
  isLanding: () => boolean,
): TitleField {
  let reverting = false;

  const fitWidth = (): void => {
    // `size` approximates the text width so the field hugs its content (no field-sizing in all
    // browsers yet); CSS caps it so it never runs into the palette.
    input.size = Math.max(input.value.length || input.placeholder.length, 4) + 1;
  };

  const sync = (): void => {
    const title = currentTitle(viewer);
    if (document.activeElement !== input) {
      input.value = isDefaultTitle(title) ? '' : title;
      fitWidth();
    }
    document.title = isLanding() || isDefaultTitle(title) ? APP_NAME : `${title} · ${APP_NAME}`;
  };

  const commit = (): void => {
    const requested = input.value.replace(/\s+/g, ' ').trim();
    const title = currentTitle(viewer);
    const unchanged = requested === title || (!requested && isDefaultTitle(title));
    if (!unchanged) viewer.setTitle(requested);
    sync();
  };

  input.addEventListener('input', fitWidth);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      reverting = true;
      input.blur();
    }
  });
  input.addEventListener('blur', () => {
    if (reverting) {
      reverting = false;
      sync();
      return;
    }
    commit();
  });

  return { sync };
}
