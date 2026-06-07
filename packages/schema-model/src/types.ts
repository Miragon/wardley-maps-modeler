/**
 * Wardley-Metamodell (Konzept §2.2).
 *
 * Alle Interfaces sind `readonly` und ausschliesslich Serialisierungs-/Schnittstellenformat.
 * Die Laufzeit-Wahrheit waehrend des Editierens lebt in den mutablen diagram-js-DI-Properties
 * (@wardley/renderer). `exportMap()` baut ein `WardleyMap` aus diesen Properties.
 *
 * Koordinaten sind kontinuierlich und normiert; die diskrete Evolution-Stage wird abgeleitet
 * (siehe `stage.ts`), nie persistiert (Leitprinzip P2).
 */

/** Normierte Position auf den zwei kontinuierlichen Achsen. Invariante: 0 <= v,e <= 1. */
export interface Coordinate {
  /** Y: 1 = sichtbar (oben beim Anchor), 0 = infrastrukturell (unten). */
  readonly visibility: number;
  /** X: 0 = Genesis (links), 1 = Commodity/Utility (rechts). */
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
  | 'submap';

export type Method = 'build' | 'buy' | 'outsource';

/** Decorator-Flags; market/ecosystem als Flags statt eigener Typen (modernisierte OWM-Syntax). */
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

/** Geplante Evolution (evolve). Am Knoten verankert. */
export interface Movement {
  readonly targetEvolution: number;
  readonly newLabel?: string;
  readonly method?: Method;
  readonly labelOffset?: LabelOffset;
}

/** Gemeinsame Basis aller Knoten. */
export interface MapElementBase {
  readonly id: string;
  readonly elementType: ElementType;
  readonly label: string;
  readonly position: Coordinate;
  readonly labelOffset?: LabelOffset;
}

export interface AnchorElement extends MapElementBase {
  readonly elementType: 'anchor';
}

export interface ComponentElement extends MapElementBase {
  readonly elementType: 'component';
  readonly decorators?: ComponentDecorators;
  readonly movement?: Movement;
  /** Zugehoerigkeit zu einer Pipeline (teilt deren visibility). */
  readonly pipelineId?: string;
}

export interface PipelineElement extends MapElementBase {
  readonly elementType: 'pipeline';
  /** DSL-Klammern fuer `pipeline` = [evolutionStart, evolutionEnd] (siehe §7.4). */
  readonly evolutionStart: number;
  readonly evolutionEnd: number;
  /** ComponentElement.id der Kinder; sie teilen die visibility der Pipeline. */
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
  /** Optionale Notiz-Farbe (CSS-Farbe, i.d.R. Hex aus der Renderer-`NOTE_COLORS`-Palette). */
  readonly color?: string;
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
  /** OWM-Syntax: `<kind> [visibility, maturity] width height`. `position` = Ankerpunkt (oben links),
   *  `width`/`height` in (OWM-)Pixeln. */
  readonly elementType: 'attitude';
  readonly kind: AttitudeKind;
  readonly width: number;
  readonly height: number;
}

export interface SubmapElement extends MapElementBase {
  readonly elementType: 'submap';
  readonly urlRef?: string;
}

/** Diskriminierte Union ueber `elementType`. */
export type MapElement =
  | AnchorElement
  | ComponentElement
  | PipelineElement
  | NoteElement
  | AnnotationElement
  | AcceleratorElement
  | AttitudeElement
  | SubmapElement;

export type EdgeType = 'dependency' | 'flow';

export interface DependencyLink {
  readonly id: string;
  readonly edgeType: 'dependency';
  /** MapElement.id des sichtbareren/hoeheren Knotens. */
  readonly from: string;
  /** MapElement.id der Abhaengigkeit. */
  readonly to: string;
  readonly label?: string;
}

export interface FlowLink {
  readonly id: string;
  readonly edgeType: 'flow';
  readonly from: string;
  readonly to: string;
  /** Wert am Flow: `+'120ms'>`. */
  readonly flowValue?: string;
  /** `+<>` */
  readonly bidirectional?: boolean;
  /** Annotationstext nach `;`, z.B. `A +> B; limited by`. */
  readonly label?: string;
}

export type MapEdge = DependencyLink | FlowLink;

export type MapStyle = 'wardley' | 'handwritten' | 'colour' | 'dark';

/** Map-Level-Konfiguration (Achsenlabels, Stil, Groesse). */
export interface MapConfig {
  readonly title: string;
  readonly size?: { readonly width: number; readonly height: number };
  readonly style?: MapStyle;
  /** Custom X-Achsen-Stage-Labels, sonst Default Genesis/Custom/Product/Commodity. */
  readonly evolutionLabels?: readonly [string, string, string, string];
  /** Konfigurierbare Stage-Grenzen (Default [0.17, 0.40, 0.70]). */
  readonly stageBoundaries?: readonly [number, number, number];
  readonly yAxisLabel?: string;
  readonly annotationsBoxPosition?: Coordinate;
}

/** Wurzelobjekt. Domaene und Layout logisch (nicht physisch) getrennt. */
export interface WardleyMap {
  readonly schemaVersion: number;
  readonly config: MapConfig;
  readonly elements: readonly MapElement[];
  readonly edges: readonly MapEdge[];
  /** Unbekannte/zukuenftige DSL-Zeilen verlustfrei erhalten (Round-Trip-Treue). */
  readonly rawPassthrough?: readonly string[];
}
