import type { ModuleDeclaration } from 'didi';
import WardleyRenderer from './WardleyRenderer.js';

/** SVG rendering of all Wardley types (BaseRenderer subclass, priority 1500). */
export const wardleyDrawModule: ModuleDeclaration = {
  __init__: ['wardleyRenderer'],
  wardleyRenderer: ['type', WardleyRenderer],
};

export {
  default as WardleyRenderer,
  LABEL_HANDLE_CLASS,
  LABEL_ROLE_ATTRIBUTE,
  MOVEMENT_CLASS,
  NAME_LABEL_CLASS,
} from './WardleyRenderer.js';
export {
  componentLabelPlacement,
  componentLabelSlot,
  movementDeltaX,
  movementLabelPlacement,
  movementLabelSlot,
  normalizeLabelOffset,
  type LabelPlacement,
} from './label-layout.js';
