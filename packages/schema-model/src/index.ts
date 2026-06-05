// Typen (Metamodell §2.2)
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
  MapElement,
  EdgeType,
  DependencyLink,
  FlowLink,
  MapEdge,
  MapStyle,
  MapConfig,
  WardleyMap,
} from './types.js';

// Stage-Ableitung
export { evolutionStage, DEFAULT_STAGE_BOUNDARIES, DEFAULT_EVOLUTION_LABELS } from './stage.js';
export type { EvolutionStage } from './stage.js';

// Validierung & Serialisierung
export { validateMap, loadMap, parseMapJSON, serializeMap, createEmptyMap } from './serialize.js';

// Schema (fuer fortgeschrittene Konsumenten)
export { wardleyMapSchema, mapElementSchema, mapEdgeSchema } from './schema.js';
export type { WardleyMapInput } from './schema.js';

// Migrationen
export { migrate, CURRENT_SCHEMA_VERSION } from './migrations.js';
