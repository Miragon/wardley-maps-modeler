import type { ModuleDeclaration } from 'didi';
import StageSnapping from './StageSnapping.js';

/** Snapping an die Evolution-Stage-Grenzen (Editor-only). */
export const stageSnappingModule: ModuleDeclaration = {
  __init__: ['stageSnapping'],
  stageSnapping: ['type', StageSnapping],
};

export { default as StageSnapping } from './StageSnapping.js';
