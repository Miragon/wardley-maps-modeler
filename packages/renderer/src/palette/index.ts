import type { ModuleDeclaration } from 'didi';
import WardleyPaletteProvider from './WardleyPaletteProvider.js';

/** Tool palette (drag-to-create). */
export const wardleyPaletteModule: ModuleDeclaration = {
  __init__: ['wardleyPaletteProvider'],
  wardleyPaletteProvider: ['type', WardleyPaletteProvider],
};

export { default as WardleyPaletteProvider } from './WardleyPaletteProvider.js';
