import type { ModuleDeclaration } from 'didi';
import WardleyLabelEditing from './WardleyLabelEditing.js';

/** Custom inline label editing (HTML overlay). */
export const labelEditingModule: ModuleDeclaration = {
  __init__: ['wardleyLabelEditing'],
  wardleyLabelEditing: ['type', WardleyLabelEditing],
};

export { default as WardleyLabelEditing } from './WardleyLabelEditing.js';
