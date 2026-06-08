import type { ModuleDeclaration } from 'didi';
import StageSnapping from './StageSnapping.js';

/** Snapping to the evolution stage boundaries (editor-only). */
export const stageSnappingModule: ModuleDeclaration = {
  __init__: ['stageSnapping'],
  stageSnapping: ['type', StageSnapping],
};

export { default as StageSnapping } from './StageSnapping.js';
