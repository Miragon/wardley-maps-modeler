import type { ModuleDeclaration } from 'didi';
import LassoToolModule from 'diagram-js/lib/features/lasso-tool';
import WardleyLassoBehavior from './WardleyLassoBehavior.js';

/** Lasso multi-select: diagram-js lasso-tool plus Shift+drag activation on an empty canvas. */
export const wardleyLassoModule: ModuleDeclaration = {
  __depends__: [LassoToolModule],
  __init__: ['wardleyLassoBehavior'],
  wardleyLassoBehavior: ['type', WardleyLassoBehavior],
};

export { default as WardleyLassoBehavior } from './WardleyLassoBehavior.js';
