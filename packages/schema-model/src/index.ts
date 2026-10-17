export type {
  Coordinate,
  ElementType,
  Method,
  ComponentDecorators,
  LabelOffset,
  Movement,
  MapElementBase,
  AnchorElement,
  ComponentElement,
  PipelineElement,
  ClimaticPattern,
  NoteElement,
  AnnotationElement,
  AcceleratorDirection,
  AcceleratorElement,
  AttitudeKind,
  AttitudeElement,
  SubmapElement,
  DrawingStrokeStyle,
  DrawingElement,
  MapElement,
  EdgeType,
  DependencyLink,
  FlowLink,
  MapEdge,
  MapStyle,
  MapConfig,
  WardleyMap,
} from './types.js';

// Layout default (plot area) — shared by renderer and migrations
export { DEFAULT_MAP_TITLE, DEFAULT_PLOT_SIZE } from './types.js';

export {
  PLOT_MIN,
  PLOT_MAX,
  MAP_SIZE_PRESETS,
  drawnPlotLength,
  normalizeMapSize,
  parsePlotLength,
  plotLengthMessage,
  presetIdForSize,
} from './map-size.js';
export type { MapSize, MapSizePreset, MapSizePresetId } from './map-size.js';

export {
  evolutionStage,
  DEFAULT_STAGE_BOUNDARIES,
  DEFAULT_EVOLUTION_LABELS,
  EVOLUTION_PRESETS,
  normalizeEvolutionLabels,
  sameEvolutionLabels,
} from './stage.js';
export type { EvolutionStage, EvolutionPreset } from './stage.js';

export { validateMap, loadMap, parseMapJSON, serializeMap, createEmptyMap } from './serialize.js';

export { wardleyMapSchema, mapElementSchema, mapEdgeSchema } from './schema.js';
export type { WardleyMapInput } from './schema.js';

export { migrate, CURRENT_SCHEMA_VERSION } from './migrations.js';
