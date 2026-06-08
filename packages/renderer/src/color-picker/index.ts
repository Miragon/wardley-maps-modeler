import type { ModuleDeclaration } from 'didi';
import WardleyColorPicker from './WardleyColorPicker.js';

/** Note color picker (3x3 swatch popover). */
export const wardleyColorPickerModule: ModuleDeclaration = {
  __init__: ['wardleyColorPicker'],
  wardleyColorPicker: ['type', WardleyColorPicker],
};

export { default as WardleyColorPicker } from './WardleyColorPicker.js';
