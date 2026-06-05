import type { ModuleDeclaration } from 'didi';
import WardleyElementFactory from './WardleyElementFactory.js';

/** Eigene ElementFactory mit Wardley-Defaults & Pixel-Projektion. */
export const wardleyModelModule: ModuleDeclaration = {
  wardleyElementFactory: ['type', WardleyElementFactory],
};

export { default as WardleyElementFactory } from './WardleyElementFactory.js';
export * from './di-types.js';
