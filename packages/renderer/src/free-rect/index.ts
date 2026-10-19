import type { ModuleDeclaration } from 'didi';
import FreeRect from './FreeRect.js';

/** The canvas area a host's chrome leaves free (keyboard creation, pan constraint). */
export const freeRectModule: ModuleDeclaration = {
  wardleyFreeRect: ['type', FreeRect],
};

export { default as FreeRect } from './FreeRect.js';
export type { FreeRectConfig, FreeRectInsets } from './FreeRect.js';
