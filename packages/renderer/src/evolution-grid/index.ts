import type { ModuleDeclaration } from 'didi';
import EvolutionGrid from './EvolutionGrid.js';
import EvolutionConstraintBehavior from './EvolutionConstraintBehavior.js';

/** Axis background + single pixel<->normalized math (P7). */
export const evolutionGridModule: ModuleDeclaration = {
  evolutionGrid: ['type', EvolutionGrid],
};

/** Keeps normalized coordinates in sync with the geometry (editor-only). */
export const evolutionConstraintModule: ModuleDeclaration = {
  __init__: ['evolutionConstraintBehavior'],
  __depends__: [evolutionGridModule],
  evolutionConstraintBehavior: ['type', EvolutionConstraintBehavior],
};

export { default as EvolutionGrid } from './EvolutionGrid.js';
export { default as EvolutionConstraintBehavior } from './EvolutionConstraintBehavior.js';
