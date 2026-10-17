import type { ModuleDeclaration } from 'didi';
import ContextPadModule from 'diagram-js/lib/features/context-pad';
import WardleyContextPad from './WardleyContextPad.js';
import WardleyContextPadProvider from './WardleyContextPadProvider.js';

/** Context actions per element. */
export const wardleyContextPadModule: ModuleDeclaration = {
  // Depending on the diagram-js module guarantees our 'contextPad' registration overrides its own.
  __depends__: [ContextPadModule],
  __init__: ['wardleyContextPadProvider'],
  contextPad: ['type', WardleyContextPad],
  wardleyContextPadProvider: ['type', WardleyContextPadProvider],
};

export { default as WardleyContextPadProvider } from './WardleyContextPadProvider.js';
export { default as WardleyContextPad } from './WardleyContextPad.js';
