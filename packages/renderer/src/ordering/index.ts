import type { ModuleDeclaration } from 'didi';
import WardleyOrderingProvider from './WardleyOrderingProvider.js';

/** Z-order for interactive edits: frames -> connections -> nodes (like the import). */
export const wardleyOrderingModule: ModuleDeclaration = {
  __init__: ['wardleyOrderingProvider'],
  wardleyOrderingProvider: ['type', WardleyOrderingProvider],
};

export { default as WardleyOrderingProvider } from './WardleyOrderingProvider.js';
