import type { ModuleDeclaration } from 'didi';
import WardleyImporter from './WardleyImporter.js';
import WardleyExporter from './WardleyExporter.js';
import WardleySourceOrder from './WardleySourceOrder.js';

export const ioModule: ModuleDeclaration = {
  // Instantiated eagerly: it must observe the first import, long before anything exports.
  __init__: ['wardleySourceOrder'],
  wardleySourceOrder: ['type', WardleySourceOrder],
  wardleyImporter: ['type', WardleyImporter],
  wardleyExporter: ['type', WardleyExporter],
};

export { default as WardleyImporter } from './WardleyImporter.js';
export { default as WardleyExporter } from './WardleyExporter.js';
export { default as WardleySourceOrder } from './WardleySourceOrder.js';
export { saveSVG } from './saveSvg.js';
export type { SvgBounds } from './saveSvg.js';
export { exportBounds, EXPORT_CONTENT_PADDING } from './exportBounds.js';
export { svgToPng, blobToBase64 } from './rasterize.js';
export type { SvgToPngOptions } from './rasterize.js';
export { ROOT_ID } from './types.js';
export type { ImportWarning, RootBusinessObject } from './types.js';
