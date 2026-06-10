import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Create from 'diagram-js/lib/features/create/Create';
import type LassoTool from 'diagram-js/lib/features/lasso-tool/LassoTool';
import type Mouse from 'diagram-js/lib/features/mouse/Mouse';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Element } from 'diagram-js/lib/model/Types';
import type WardleyCopyPaste from '../modeling/WardleyCopyPaste.js';
import type WardleyElementFactory from '../model/WardleyElementFactory.js';

/** Arrow-key nudge in diagram px (Shift = coarse). */
const NUDGE_STEP = 2;
const NUDGE_STEP_COARSE = 10;

const ARROW_DELTAS: Record<string, { x: number; y: number }> = {
  arrowleft: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
};

/**
 * Minimal keyboard binding on the canvas container: undo/redo, delete, copy/paste/duplicate,
 * arrow-key nudge of the selection, plus the single-key tools C (component), U (user) and
 * L (lasso). Deliberately a DOM listener (no diagram-js keyboard-service binding needed).
 */
export default class WardleyKeyboard {
  static $inject = [
    'canvas',
    'commandStack',
    'selection',
    'modeling',
    'wardleyCopyPaste',
    'wardleyElementFactory',
    'create',
    'mouse',
    'lassoTool',
    'eventBus',
  ];

  constructor(
    canvas: Canvas,
    commandStack: CommandStack,
    selection: Selection,
    modeling: Modeling,
    copyPaste: WardleyCopyPaste,
    factory: WardleyElementFactory,
    create: Create,
    mouse: Mouse,
    lassoTool: LassoTool,
    eventBus: EventBus,
  ) {
    const container = canvas.getContainer();
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '0');

    // Bind on the DOCUMENT (not the canvas container): single-key tools (C/U/L) must work
    // without the canvas having focus first — same trade-off bpmn-js makes for its keyboard.
    const onKeydown = (e: KeyboardEvent) => {
      // If the user is currently typing in an input field, do NOT intercept: inline label editing
      // (WardleyLabelEditing) attaches its <input>/<textarea> to the canvas container, and the
      // web-app chrome has its own fields. Without the guard, Backspace/Delete would delete the
      // selected element (instead of a character) and Cmd+Z would reset the diagram.
      if (isEditableTarget(e.target)) return;

      const cmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (cmd && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        commandStack.undo();
      } else if ((cmd && key === 'z' && e.shiftKey) || (cmd && key === 'y')) {
        e.preventDefault();
        commandStack.redo();
      } else if (cmd && key === 'c') {
        if (copyPaste.copy()) e.preventDefault();
      } else if (cmd && key === 'v') {
        if (copyPaste.paste()) e.preventDefault();
      } else if (cmd && key === 'd') {
        e.preventDefault();
        copyPaste.duplicate();
      } else if (key === 'delete' || key === 'backspace') {
        const sel = selection.get() as Element[];
        if (sel.length) {
          e.preventDefault();
          modeling.removeElements(sel);
        }
      } else if (!cmd && !e.altKey && (key === 'c' || key === 'u')) {
        // Quick create: the new node attaches to the cursor (like palette create).
        const lastMove = mouse.getLastMoveEvent();
        if (lastMove) {
          e.preventDefault();
          const shape =
            key === 'c'
              ? factory.createNew('component', 'Component')
              : factory.createNew('anchor', 'User');
          create.start(lastMove, shape as unknown as Element);
        }
      } else if (!cmd && !e.altKey && key === 'l') {
        e.preventDefault();
        const lastMove = mouse.getLastMoveEvent();
        lassoTool.activateSelection((lastMove ?? e) as MouseEvent, !!lastMove);
      } else if (key in ARROW_DELTAS && !cmd) {
        const sel = selection.get() as Element[];
        if (sel.length) {
          e.preventDefault();
          const step = e.shiftKey ? NUDGE_STEP_COARSE : NUDGE_STEP;
          const d = ARROW_DELTAS[key]!;
          modeling.moveElements(sel, { x: d.x * step, y: d.y * step });
        }
      }
    };

    document.addEventListener('keydown', onKeydown);
    eventBus.on('diagram.destroy', () => document.removeEventListener('keydown', onKeydown));
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
