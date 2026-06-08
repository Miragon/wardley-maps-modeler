import type { ModuleDeclaration } from 'didi';
import WardleyContextPadProvider from './WardleyContextPadProvider.js';

/** Context actions per element. */
export const wardleyContextPadModule: ModuleDeclaration = {
  __init__: ['wardleyContextPadProvider'],
  wardleyContextPadProvider: ['type', WardleyContextPadProvider],
};

export { default as WardleyContextPadProvider } from './WardleyContextPadProvider.js';
