import { expect, type Page } from '@playwright/test';
import type { LabelEditorHooks } from '@miragon/modeler-shell/testing';

/** Kettle's own hit area in the Tea Shop example both hosts open; its label is a name. */
const KETTLE = '.cd-shell-canvas .djs-shape[data-element-id="cmp_kettle"] > .djs-hit';
const LABEL_FIELD = 'input.wardley-label-input';

/**
 * The shell kit's label editor on the Tea Shop example: a double-click on Kettle opens its name,
 * and the typed name is one the map does not hold yet. `documentState` reads what the host would
 * save or send, so a commit shows as a change of it.
 */
export function kettleLabelEditor(
  documentState: (page: Page) => Promise<string>,
): LabelEditorHooks<Page> {
  let drafts = 0;
  let stateAtOpen: string | undefined;
  return {
    async open(page) {
      // A step that committed the previous draft left it on the map: the next one differs.
      drafts += 1;
      const typed = `Kettle draft ${drafts}`;
      await page.locator(KETTLE).dblclick();
      const field = page.locator(LABEL_FIELD);
      await expect(field).toBeFocused();
      await field.fill(typed);
      await expect(field).toHaveValue(typed);
      stateAtOpen = await documentState(page);
      return typed;
    },
    async documentChanged(page) {
      return (await documentState(page)) !== stateAtOpen;
    },
  };
}
