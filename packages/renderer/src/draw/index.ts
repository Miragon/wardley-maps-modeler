import type { ModuleDeclaration } from 'didi';
import WardleyRenderer from './WardleyRenderer.js';

/** SVG rendering of all Wardley types (BaseRenderer subclass, priority 1500). */
export const wardleyDrawModule: ModuleDeclaration = {
  __init__: ['wardleyRenderer'],
  wardleyRenderer: ['type', WardleyRenderer],
};

export { default as WardleyRenderer } from './WardleyRenderer.js';
