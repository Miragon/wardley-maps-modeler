import type { ModuleDeclaration } from 'didi';
import PanConstraint from './PanConstraint.js';

export const PanConstraintModule: ModuleDeclaration = {
  __init__: ['panConstraint'],
  panConstraint: ['type', PanConstraint],
};

export { default as PanConstraint } from './PanConstraint.js';
