/**
 * Wardley metamodel (concept doc §2.2).
 *
 * All interfaces are `readonly` and serve purely as the serialization/interface format.
 * The runtime source of truth while editing lives in the mutable diagram-js DI properties
 * (@miragon/wardley-renderer). `exportMap()` builds a `WardleyMap` from those properties.
 *
 * Coordinates are continuous and normalized; the discrete evolution stage is derived
 * (see `stage.ts`), never persisted (guiding principle P2).
 */

/** Normalized position on the two continuous axes. Invariant: 0 <= v,e <= 1. */
export interface Coordinate {
  /** Y: 1 = visible (top, near the anchor), 0 = infrastructural (bottom). */
  readonly visibility: number;
  /** X: 0 = Genesis (left), 1 = Commodity/Utility (right). */
  readonly evolution: number;
}

export type ElementType =
  | 'anchor'
  | 'component'
  | 'pipeline'
  | 'note'
  | 'annotation'
  | 'accelerator'
  | 'attitude'
  | 'submap'
  | 'drawing';

export type Method = 'build' | 'buy' | 'outsource';

/** Decorator flags; market/ecosystem as flags rather than dedicated types (modernized OWM syntax). */
export interface ComponentDecorators {
  readonly market?: boolean;
  readonly ecosystem?: boolean;
  readonly inertia?: boolean;
  readonly method?: Method;
}

export interface LabelOffset {
  readonly dx: number;
  readonly dy: number;
}

/** Anchored to the node. */
export interface Movement {
  readonly targetEvolution: number;
  readonly newLabel?: string;
  readonly method?: Method;
  readonly labelOffset?: LabelOffset;
}

export interface MapElementBase {
  readonly id: string;
  readonly elementType: ElementType;
  readonly label: string;
  readonly position: Coordinate;
  readonly labelOffset?: LabelOffset;
  /**
   * Optional element color (CSS color, typically hex from the renderer's palette).
   *  Serialized as the project extension `(color …)` after the coordinates.
   */
  readonly color?: string;
}

export interface AnchorElement extends MapElementBase {
  readonly elementType: 'anchor';
}

export interface ComponentElement extends MapElementBase {
  readonly elementType: 'component';
  readonly decorators?: ComponentDecorators;
  readonly movement?: Movement;
  /** Membership in a pipeline (shares its visibility). */
  readonly pipelineId?: string;
  /** Resolved address from OWM `url Name [address]` + a `url(Name)` reference. */
  readonly url?: string;
}

export interface PipelineElement extends MapElementBase {
  readonly elementType: 'pipeline';
  /** DSL brackets for `pipeline` = [evolutionStart, evolutionEnd] (see §7.4). */
  readonly evolutionStart: number;
  readonly evolutionEnd: number;
  /** ComponentElement.id of the children; they share the pipeline's visibility. */
  readonly childIds: readonly string[];
}

export type ClimaticPattern =
  | 'everythingEvolves'
  | 'characteristicsChange'
  | 'noOneSizeFitsAll'
  | 'efficiencyEnablesInnovation'
  | 'pastSuccessBreedsInertia'
  | 'capitalFlowsToNewValue';

export interface NoteElement extends MapElementBase {
  readonly elementType: 'note';
  readonly patternType?: ClimaticPattern;
}

export interface AnnotationElement extends MapElementBase {
  readonly elementType: 'annotation';
  readonly number: number;
  readonly positions: readonly Coordinate[];
  readonly text: string;
}

export type AcceleratorDirection = 'accelerate' | 'deaccelerate';

export interface AcceleratorElement extends MapElementBase {
  readonly elementType: 'accelerator';
  readonly direction: AcceleratorDirection;
}

export type AttitudeKind = 'pioneers' | 'settlers' | 'townplanners';

export interface AttitudeElement extends MapElementBase {
  /**
   * OWM syntax: `<kind> [vis1, mat1, vis2, mat2]` (two corner points, normalized).
   *  `position` = anchor point at the top left (higher visibility, lower evolution),
   *  `corner2` = opposite corner at the bottom right.
   */
  readonly elementType: 'attitude';
  readonly kind: AttitudeKind;
  readonly corner2: Coordinate;
}

export interface SubmapElement extends MapElementBase {
  readonly elementType: 'submap';
  readonly urlRef?: string;
}

export type DrawingStrokeStyle = 'solid' | 'dashed' | 'dotted';

/**
 * Freeform polyline/polygon (project extension, Excalidraw-style annotation drawing).
 *  `position` mirrors the first point; `points` are absolute normalized coordinates.
 */
export interface DrawingElement extends MapElementBase {
  readonly elementType: 'drawing';
  readonly points: readonly Coordinate[];
  /** true = closed polygon, false/absent = open polyline. */
  readonly closed?: boolean;
  readonly strokeStyle?: DrawingStrokeStyle;
}

export type MapElement =
  | AnchorElement
  | ComponentElement
  | PipelineElement
  | NoteElement
  | AnnotationElement
  | AcceleratorElement
  | AttitudeElement
  | SubmapElement
  | DrawingElement;

export type EdgeType = 'dependency' | 'flow';

export interface DependencyLink {
  readonly id: string;
  readonly edgeType: 'dependency';
  /** MapElement.id of the more visible/higher node. */
  readonly from: string;
  /** MapElement.id of the dependency. */
  readonly to: string;
  readonly label?: string;
}

export interface FlowLink {
  readonly id: string;
  readonly edgeType: 'flow';
  readonly from: string;
  readonly to: string;
  /** Value on the flow: `+'120ms'>`. */
  readonly flowValue?: string;
  /** `+<>` */
  readonly bidirectional?: boolean;
  /** Annotation text after `;`, e.g. `A +> B; limited by`. */
  readonly label?: string;
}

export type MapEdge = DependencyLink | FlowLink;

export type MapStyle = 'wardley' | 'handwritten' | 'colour' | 'dark';

export interface MapConfig {
  readonly title: string;
  readonly size?: { readonly width: number; readonly height: number };
  readonly style?: MapStyle;
  /** Custom X-axis stage labels, otherwise the default Genesis/Custom/Product/Commodity. */
  readonly evolutionLabels?: readonly [string, string, string, string];
  /** Configurable stage boundaries (default [0.17, 0.40, 0.70]). */
  readonly stageBoundaries?: readonly [number, number, number];
  readonly yAxisLabel?: string;
  /** End labels of the value-chain axis [bottom, top] — OWM `y-axis Label->Bottom->Top`. */
  readonly yAxisEndLabels?: readonly [string, string];
  readonly annotationsBoxPosition?: Coordinate;
}

/**
 * Default plot area in diagram px (inner area without axis margins). Single source of truth for
 * the renderer (PLOT) and for migrations (legacy px -> normalized); can be overridden via
 * `config.size`.
 */
export const DEFAULT_PLOT_SIZE = { width: 1080, height: 680 } as const;

/** Root object. Domain and layout are separated logically (not physically). */
export interface WardleyMap {
  readonly schemaVersion: number;
  readonly config: MapConfig;
  readonly elements: readonly MapElement[];
  readonly edges: readonly MapEdge[];
  /** Preserve unknown/future DSL lines losslessly (round-trip fidelity). */
  readonly rawPassthrough?: readonly string[];
}
