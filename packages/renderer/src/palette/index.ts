import type { ModuleDeclaration } from 'didi';
import WardleyPaletteProvider from './WardleyPaletteProvider.js';
import WardleyPaletteKeyboard from './WardleyPaletteKeyboard.js';

/** Tool palette (drag-to-create, keyboard-operable toolbar). */
export const wardleyPaletteModule: ModuleDeclaration = {
  __init__: ['wardleyPaletteProvider', 'wardleyPaletteKeyboard'],
  wardleyPaletteProvider: ['type', WardleyPaletteProvider],
  wardleyPaletteKeyboard: ['type', WardleyPaletteKeyboard],
};

export { default as WardleyPaletteProvider } from './WardleyPaletteProvider.js';
export { default as WardleyPaletteKeyboard } from './WardleyPaletteKeyboard.js';
