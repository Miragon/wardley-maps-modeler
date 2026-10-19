import type { Injector } from 'didi';
import type { ModuleDeclaration } from 'didi';
import WardleyReadOnly from './WardleyReadOnly.js';

/** The edit lock of a canvas that shows a map the host cannot save (guide §13.5). */
export const readOnlyModule: ModuleDeclaration = {
  __init__: ['wardleyReadOnly'],
  wardleyReadOnly: ['type', WardleyReadOnly],
};

/** Whether the canvas is locked; false where the editor has no lock. */
export function isReadOnly(injector: Injector): boolean {
  return injector.get<WardleyReadOnly | null>('wardleyReadOnly', false)?.isReadOnly() === true;
}

export { default as WardleyReadOnly, READ_ONLY_CHANGED } from './WardleyReadOnly.js';
