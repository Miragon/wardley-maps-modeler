import type { ModuleDeclaration } from 'didi';
import PipelineGroupBehavior from './PipelineGroupBehavior.js';

/** Pipelines move as groups with their members and anchor component (editor-only). */
export const pipelineGroupModule: ModuleDeclaration = {
  __init__: ['pipelineGroupBehavior'],
  pipelineGroupBehavior: ['type', PipelineGroupBehavior],
};

export { default as PipelineGroupBehavior, DROP_TARGET_MARKER } from './PipelineGroupBehavior.js';
export {
  anchorComponentOf,
  centerOf,
  membersOf,
  pipelineAnchoredBy,
  pipelineAt,
  pipelineFollowers,
} from './pipelineMembership.js';
