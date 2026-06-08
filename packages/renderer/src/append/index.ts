import type { ModuleDeclaration } from 'didi';
import ConnectionPreviewModule from 'diagram-js/lib/features/connection-preview';
import WardleyAppendBehavior from './WardleyAppendBehavior.js';

/**
 * "Append component": pulls in the `connectionPreview` service (thereby also enabling the connect
 * tool's arrow preview) and registers the append behavior (live arrow preview + automatically
 * opening the label editor after creation).
 */
export const wardleyAppendModule: ModuleDeclaration = {
  __depends__: [ConnectionPreviewModule],
  __init__: ['wardleyAppendBehavior'],
  wardleyAppendBehavior: ['type', WardleyAppendBehavior],
};

export { default as WardleyAppendBehavior } from './WardleyAppendBehavior.js';
