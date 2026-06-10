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
export { DEFAULT_PLOT_SIZE } from './types.js';

export {
  evolutionStage,
  DEFAULT_STAGE_BOUNDARIES,
  DEFAULT_EVOLUTION_LABELS,
  EVOLUTION_PRESETS,
} from './stage.js';
export type { EvolutionStage, EvolutionPreset } from './stage.js';

export { validateMap, loadMap, parseMapJSON, serializeMap, createEmptyMap } from './serialize.js';

export { wardleyMapSchema, mapElementSchema, mapEdgeSchema } from './schema.js';
export type { WardleyMapInput } from './schema.js';

export { migrate, CURRENT_SCHEMA_VERSION } from './migrations.js';
