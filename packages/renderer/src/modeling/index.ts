import type { ModuleDeclaration } from 'didi';
import MouseModule from 'diagram-js/lib/features/mouse';
import CreateModule from 'diagram-js/lib/features/create';
import WardleyModeling from './WardleyModeling.js';
import WardleyCopyPaste from './WardleyCopyPaste.js';

/** High-level Wardley mutations + registration of the custom command handlers. */
export const wardleyModelingModule: ModuleDeclaration = {
  // Mouse/Create are needed by the paste preview (clones attach to the cursor).
  __depends__: [MouseModule, CreateModule],
  __init__: ['wardleyModeling'],
  wardleyModeling: ['type', WardleyModeling],
  wardleyCopyPaste: ['type', WardleyCopyPaste],
};

export { default as WardleyModeling } from './WardleyModeling.js';
export { default as WardleyCopyPaste } from './WardleyCopyPaste.js';
export type { EvolveOptions } from './WardleyModeling.js';
