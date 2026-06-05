import type { ModuleDeclaration } from 'didi';
import WardleyPaletteProvider from './WardleyPaletteProvider.js';

/** Werkzeug-Palette (Drag-to-create). */
export const wardleyPaletteModule: ModuleDeclaration = {
  __init__: ['wardleyPaletteProvider'],
  wardleyPaletteProvider: ['type', WardleyPaletteProvider],
};

export { default as WardleyPaletteProvider } from './WardleyPaletteProvider.js';
