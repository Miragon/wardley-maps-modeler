import type { ModuleDeclaration } from 'didi';
import describeCanvas from './describeCanvas.js';

/** Names the canvas for assistive technology (role, role description, label). */
export const canvasAccessibilityModule: ModuleDeclaration = {
  __init__: [describeCanvas],
};

export {
  canvasSvg,
  focusCanvasWithoutRing,
  lastInteractionWasPointer,
  trackInputModality,
} from './canvasFocus.js';
