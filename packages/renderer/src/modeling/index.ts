import type { ModuleDeclaration } from 'didi';
import WardleyModeling from './WardleyModeling.js';

/** High-Level-Wardley-Mutationen + Registrierung der eigenen CommandHandler. */
export const wardleyModelingModule: ModuleDeclaration = {
  __init__: ['wardleyModeling'],
  wardleyModeling: ['type', WardleyModeling],
};

export { default as WardleyModeling } from './WardleyModeling.js';
export type { EvolveOptions } from './WardleyModeling.js';
