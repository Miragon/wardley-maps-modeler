import type { ModuleDeclaration } from 'didi';
import WardleyLabelDragging from './WardleyLabelDragging.js';

/** OWM-style draggable labels persisted as `label [dx, dy]` (undoable). */
export const wardleyLabelDragModule: ModuleDeclaration = {
  __init__: ['wardleyLabelDragging'],
  wardleyLabelDragging: ['type', WardleyLabelDragging],
};

export { default as WardleyLabelDragging, type LabelRole } from './WardleyLabelDragging.js';
