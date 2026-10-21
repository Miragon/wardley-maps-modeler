import './assets/wardley.css';

export { Viewer } from './Viewer.js';
export { NavigatedViewer } from './NavigatedViewer.js';
export { Modeler } from './Modeler.js';
export { WardleyBaseViewer } from './WardleyBaseViewer.js';
export type {
  WardleyViewerOptions,
  EventCallback,
  MapSizeInfo,
  SetEvolutionLabelsOptions,
  SetMapSizeOptions,
  WardleyConfigChangedEvent,
} from './WardleyBaseViewer.js';

export { wardleyModelModule, WardleyElementFactory } from './model/index.js';
export {
  evolutionGridModule,
  evolutionConstraintModule,
  EvolutionGrid,
} from './evolution-grid/index.js';
export { wardleyDrawModule, WardleyRenderer } from './draw/index.js';
export { COLORS, PLOT } from './draw/styles.js';
export {
  PLOT_MIN,
  PLOT_MAX,
  MAP_SIZE_PRESETS,
  normalizeMapSize,
  presetIdForSize,
} from '@miragon/wardley-schema-model';
export type { MapSize, MapSizePreset, MapSizePresetId } from '@miragon/wardley-schema-model';

/* Miragon brand tokens (single source of truth for colour) — for consumers theming their own chrome. */
export { MIRAGON } from './theme/index.js';
export {
  ioModule,
  WardleyImporter,
  WardleyExporter,
  WardleySourceOrder,
  saveSVG,
  exportBounds,
  svgToPng,
  blobToBase64,
  ROOT_ID,
} from './io/index.js';
export type { SvgBounds, SvgToPngOptions } from './io/index.js';
export { wardleyModelingModule, WardleyModeling } from './modeling/index.js';
export { wardleyLayoutModule, WardleyLayouter } from './layout/index.js';
export type { EvolveOptions, MapConfigUpdate } from './modeling/index.js';
export { RESIZE_MAP, UPDATE_CONFIG } from './modeling/index.js';
export {
  mapResizeModule,
  MapResizeHandles,
  MapProjection,
  ResizeAwareAutoScroll,
} from './map-resize/index.js';
export { pipelineGroupModule, PipelineGroupBehavior } from './pipeline/index.js';
export {
  linkEditingModule,
  WardleyLinkEditing,
  canHaveLink,
  linkOf,
} from './link-editing/index.js';
export { wardleyLabelDragModule, WardleyLabelDragging } from './label-drag/index.js';
export { readOnlyModule, WardleyReadOnly, READ_ONLY_CHANGED } from './read-only/index.js';
export type { LabelRole } from './label-drag/index.js';
export { canvasAccessibilityModule } from './a11y/index.js';
export { wardleyLassoModule, WardleyLassoBehavior } from './lasso/index.js';
export { wardleyOrderingModule, WardleyOrderingProvider } from './ordering/index.js';
export { wardleyDrawToolModule, WardleyDrawTool } from './draw-tool/index.js';
export { wardleyRulesModule, WardleyRules } from './rules/index.js';
export { stageSnappingModule } from './snapping/index.js';
export { PanConstraintModule, PanConstraint } from './pan-constraint/index.js';
export { freeRectModule, FreeRect } from './free-rect/index.js';
export type { FreeRectInsets } from './free-rect/index.js';
export { wardleyPaletteModule } from './palette/index.js';
export { wardleyContextPadModule } from './context-pad/index.js';
export { labelEditingModule, WardleyLabelEditing } from './label-editing/index.js';
export type {
  ActiveLabelEdit,
  ActivateOptions,
  FieldSelection,
  LabelDeduplicatedEvent,
} from './label-editing/WardleyLabelEditing.js';
export { restoreEditorState, setAsideEditorState } from './editor-state.js';
export {
  WARDLEY_NOTATION,
  createCollaborativeModeler,
  createCollaborativeViewer,
} from './collaborative/index.js';
export type {
  CollaborativeWardleyModeler,
  CollaborativeWardleyOptions,
  WardleyElementsSurface,
} from './collaborative/index.js';
export {
  EXPORT_LABELS,
  createAxisLabelsPopover,
  createMapDialog,
  createMapSizePopover,
  createShortcutsDialog,
  createTitleDialog,
  dialogButton,
  mapMenu,
  mapShortcuts,
} from './map-menu/index.js';
export type {
  DialogChrome,
  MapDialog,
  MapDialogParts,
  MapShortcutOptions,
  TitleDialog,
  TitleDialogChrome,
  MapExport,
  MapExports,
  MapMenu,
  MapMenuAction,
  MapMenuActions,
  MapMenuDialog,
  MapMenuEntry,
  MapMenuIcon,
  PopoverChrome,
  PopoverHandle,
  ShortcutGroup,
  ShortcutKeyNames,
  ShortcutPlatform,
  ShortcutRow,
  ShortcutsChrome,
  ShortcutsDialog,
  ShortcutsDialogChrome,
} from './map-menu/index.js';
export type { EditorState, RestoreOptions } from './editor-state.js';
export { wardleyKeyboardModule } from './keyboard/index.js';
export type { WardleyKeyboardConfig } from './keyboard/WardleyKeyboard.js';
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

// Icons (Material Icons, Apache-2.0), deprecated: the chrome's icons come from the modeler shell.
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
} from './draw/deprecated-icons.js';
