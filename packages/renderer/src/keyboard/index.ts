import type { ModuleDeclaration } from 'didi';
import WardleyKeyboard from './WardleyKeyboard.js';

/** Undo/Redo/Delete per Tastatur am Canvas-Container. */
export const wardleyKeyboardModule: ModuleDeclaration = {
  __init__: ['wardleyKeyboard'],
  wardleyKeyboard: ['type', WardleyKeyboard],
};

export { default as WardleyKeyboard } from './WardleyKeyboard.js';
