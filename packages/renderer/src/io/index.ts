import type { ModuleDeclaration } from 'didi';
import WardleyImporter from './WardleyImporter.js';
import WardleyExporter from './WardleyExporter.js';

export const ioModule: ModuleDeclaration = {
  wardleyImporter: ['type', WardleyImporter],
  wardleyExporter: ['type', WardleyExporter],
};

export { default as WardleyImporter } from './WardleyImporter.js';
export { default as WardleyExporter } from './WardleyExporter.js';
export { saveSVG } from './saveSvg.js';
export { ROOT_ID } from './types.js';
export type { ImportWarning, RootBusinessObject } from './types.js';
