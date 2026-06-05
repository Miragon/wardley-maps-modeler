import type { ModuleDeclaration } from 'didi';
import WardleyContextPadProvider from './WardleyContextPadProvider.js';

/** Kontext-Aktionen je Element. */
export const wardleyContextPadModule: ModuleDeclaration = {
  __init__: ['wardleyContextPadProvider'],
  wardleyContextPadProvider: ['type', WardleyContextPadProvider],
};

export { default as WardleyContextPadProvider } from './WardleyContextPadProvider.js';
