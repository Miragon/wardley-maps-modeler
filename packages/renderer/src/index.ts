import './assets/wardley.css';

export { Viewer } from './Viewer.js';
export { NavigatedViewer } from './NavigatedViewer.js';
export { Modeler } from './Modeler.js';
export { WardleyBaseViewer } from './WardleyBaseViewer.js';
export type { WardleyViewerOptions, EventCallback } from './WardleyBaseViewer.js';

export { wardleyModelModule, WardleyElementFactory } from './model/index.js';
export {
  evolutionGridModule,
  evolutionConstraintModule,
  EvolutionGrid,
} from './evolution-grid/index.js';
export { wardleyDrawModule, WardleyRenderer } from './draw/index.js';
export { COLORS, PLOT } from './draw/styles.js';

/* Miragon brand tokens (single source of truth for colour) — for consumers theming their own chrome. */
export { MIRAGON } from './theme/index.js';
export { ioModule, WardleyImporter, WardleyExporter, saveSVG, ROOT_ID } from './io/index.js';
export { wardleyModelingModule, WardleyModeling } from './modeling/index.js';
export type { EvolveOptions } from './modeling/index.js';
export { wardleyRulesModule, WardleyRules } from './rules/index.js';
export { stageSnappingModule } from './snapping/index.js';
export { PanConstraintModule, PanConstraint } from './pan-constraint/index.js';
export { wardleyPaletteModule } from './palette/index.js';
export { wardleyContextPadModule } from './context-pad/index.js';
export { labelEditingModule, WardleyLabelEditing } from './label-editing/index.js';
export { wardleyKeyboardModule } from './keyboard/index.js';
export { wardleyEvolveModule, WardleyEvolveDragging } from './evolve/index.js';
export {
  wardleyPopupModule,
  WardleyElementSettingsProvider,
  POPUP_PROVIDER_ID,
} from './popup/index.js';
export { wardleyAppendModule, WardleyAppendBehavior } from './append/index.js';
export { wardleyColorPickerModule, WardleyColorPicker } from './color-picker/index.js';

// Note color palette (canonical source for consumers / the Wardley-mapping skill).
export { NOTE_COLORS } from './draw/styles.js';

export { isWardleyShape, isWardleyConnection, isComponent, isPipeline } from './model/di-types.js';
export type {
  WardleyShape,
  WardleyConnection,
  WardleyShapeType,
  WardleyConnectionType,
} from './model/di-types.js';
export type { ImportWarning, RootBusinessObject } from './io/index.js';

// Icons (Material Icons, Apache-2.0) – reusable for consumers' buttons/chrome.
export {
  iconMarkup,
  ICON_UNDO,
  ICON_REDO,
  ICON_DATA_OBJECT,
  ICON_CODE,
  ICON_DOWNLOAD,
  ICON_ASPECT_RATIO,
  ICON_EDIT,
  ICON_PERSON,
  ICON_SHARE,
  ICON_DELETE,
  ICON_FOLDER_OPEN,
  ICON_IMAGE,
  ICON_NEW,
  ICON_MENU,
  ICON_VISIBILITY,
  ICON_ADD,
} from './draw/icons.js';
