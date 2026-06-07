import type { ModuleDeclaration } from 'didi';
import WardleyColorPicker from './WardleyColorPicker.js';

/** Notiz-Farb-Picker (3x3-Swatch-Popover). */
export const wardleyColorPickerModule: ModuleDeclaration = {
  __init__: ['wardleyColorPicker'],
  wardleyColorPicker: ['type', WardleyColorPicker],
};

export { default as WardleyColorPicker } from './WardleyColorPicker.js';
