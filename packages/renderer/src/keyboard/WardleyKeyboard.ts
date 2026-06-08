import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Element } from 'diagram-js/lib/model/Types';

/**
 * Minimal keyboard binding on the canvas container: undo/redo and deleting the selection.
 * Deliberately a DOM listener (no diagram-js keyboard-service binding needed).
 */
export default class WardleyKeyboard {
  static $inject = ['canvas', 'commandStack', 'selection', 'modeling'];

  constructor(
    canvas: Canvas,
    commandStack: CommandStack,
    selection: Selection,
    modeling: Modeling,
  ) {
    const container = canvas.getContainer();
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '0');

    container.addEventListener('keydown', (e: KeyboardEvent) => {
      // If the user is currently typing in an input field, do NOT intercept: inline label editing
      // (WardleyLabelEditing) attaches its <input>/<textarea> to THIS container, so keydown bubbles
      // up to here. Without the guard, Backspace/Delete would delete the selected element (instead
      // of a character) and Cmd+Z would reset the diagram instead of the text.
      if (isEditableTarget(e.target)) return;

      const cmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (cmd && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        commandStack.undo();
      } else if ((cmd && key === 'z' && e.shiftKey) || (cmd && key === 'y')) {
        e.preventDefault();
        commandStack.redo();
      } else if (key === 'delete' || key === 'backspace') {
        const sel = selection.get() as Element[];
        if (sel.length) {
          e.preventDefault();
          modeling.removeElements(sel);
        }
      }
    });
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
