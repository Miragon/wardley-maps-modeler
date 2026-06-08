import type { ModuleDeclaration } from 'didi';
import WardleyKeyboard from './WardleyKeyboard.js';

/** Undo/redo/delete via keyboard on the canvas container. */
export const wardleyKeyboardModule: ModuleDeclaration = {
  __init__: ['wardleyKeyboard'],
  wardleyKeyboard: ['type', WardleyKeyboard],
};

export { default as WardleyKeyboard } from './WardleyKeyboard.js';
