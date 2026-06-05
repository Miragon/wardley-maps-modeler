import type { ModuleDeclaration } from 'didi';
import WardleyRenderer from './WardleyRenderer.js';

/** SVG-Rendering aller Wardley-Typen (BaseRenderer-Subklasse, Prioritaet 1500). */
export const wardleyDrawModule: ModuleDeclaration = {
  __init__: ['wardleyRenderer'],
  wardleyRenderer: ['type', WardleyRenderer],
};

export { default as WardleyRenderer } from './WardleyRenderer.js';
