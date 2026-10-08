import type { ModuleDeclaration } from 'didi';
import WardleyLayouter from './WardleyLayouter.js';

/** Replaces diagram-js's mid-to-mid `layouter` — load after the diagram-js ModelingModule. */
export const wardleyLayoutModule: ModuleDeclaration = {
  layouter: ['type', WardleyLayouter],
};

export { default as WardleyLayouter, connectionAnchorOf } from './WardleyLayouter.js';
