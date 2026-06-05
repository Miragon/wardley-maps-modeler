import type { ModuleDeclaration } from 'didi';
import EvolutionGrid from './EvolutionGrid.js';
import EvolutionConstraintBehavior from './EvolutionConstraintBehavior.js';

/** Achsen-Hintergrund + einzige Pixel<->normiert-Mathematik (P7). */
export const evolutionGridModule: ModuleDeclaration = {
  evolutionGrid: ['type', EvolutionGrid],
};

/** Haelt normierte Koordinaten synchron zur Geometrie (Editor-only). */
export const evolutionConstraintModule: ModuleDeclaration = {
  __init__: ['evolutionConstraintBehavior'],
  __depends__: [evolutionGridModule],
  evolutionConstraintBehavior: ['type', EvolutionConstraintBehavior],
};

export { default as EvolutionGrid } from './EvolutionGrid.js';
export { default as EvolutionConstraintBehavior } from './EvolutionConstraintBehavior.js';
