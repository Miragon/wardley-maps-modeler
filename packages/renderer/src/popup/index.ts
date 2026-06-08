import type { ModuleDeclaration } from 'didi';
import WardleyElementSettingsProvider from './WardleyElementSettingsProvider.js';

/** Popup submenu for element settings (type/sourcing/inertia). */
export const wardleyPopupModule: ModuleDeclaration = {
  __init__: ['wardleyElementSettings'],
  wardleyElementSettings: ['type', WardleyElementSettingsProvider],
};

export {
  default as WardleyElementSettingsProvider,
  POPUP_PROVIDER_ID,
} from './WardleyElementSettingsProvider.js';
