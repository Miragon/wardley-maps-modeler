import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Element } from 'diagram-js/lib/model/Types';

/**
 * Minimale Tastatur-Anbindung am Canvas-Container: Undo/Redo und Löschen der Auswahl.
 * Bewusst als DOM-Listener (kein diagram-js Keyboard-Service-Binding noetig).
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
