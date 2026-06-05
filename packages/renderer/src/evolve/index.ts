import type { ModuleDeclaration } from 'didi';
import WardleyEvolveDragging from './WardleyEvolveDragging.js';

/** Evolve-Ziel per Drag setzen. */
export const wardleyEvolveModule: ModuleDeclaration = {
  __init__: ['wardleyEvolveDragging'],
  wardleyEvolveDragging: ['type', WardleyEvolveDragging],
};

export { default as WardleyEvolveDragging } from './WardleyEvolveDragging.js';
