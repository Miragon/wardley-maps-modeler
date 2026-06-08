import type { ModuleDeclaration } from 'didi';
import WardleyElementFactory from './WardleyElementFactory.js';

/** Custom ElementFactory with Wardley defaults and pixel projection. */
export const wardleyModelModule: ModuleDeclaration = {
  wardleyElementFactory: ['type', WardleyElementFactory],
};

export { default as WardleyElementFactory } from './WardleyElementFactory.js';
export * from './di-types.js';
