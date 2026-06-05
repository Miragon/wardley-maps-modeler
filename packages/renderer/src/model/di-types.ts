import type { Shape, Connection } from 'diagram-js/lib/model/Types';
import type {
  AcceleratorDirection,
  AttitudeKind,
  ComponentDecorators,
  MapEdge,
  MapElement,
  Movement,
} from '@wardley/schema-model';

/**
 * diagram-js-Laufzeitmodell mit Wardley-Erweiterungen.
 *
 * Die Positions-Wahrheit waehrend des Editierens sind `evolution`/`visibility` (normiert),
 * NICHT `x`/`y` (Pixel) und NICHT das `businessObject` (Konzept §2.2, §5.6).
 * `businessObject` ist Identitaets-/Metadaten-Backref auf das urspruengliche Modell-Element.
 */

export type WardleyShapeType =
  | 'component'
  | 'anchor'
  | 'pipeline'
  | 'note'
  | 'annotation'
  | 'attitude'
  | 'submap'
  | 'accelerator';

export type WardleyConnectionType = 'dependency' | 'flow';

export interface WardleyShape extends Shape {
  wardleyType: WardleyShapeType;
  /** normiert [0,1] — Laufzeit-Wahrheit der X-Position. */
  evolution: number;
  /** normiert [0,1] — Laufzeit-Wahrheit der Y-Position. */
  visibility: number;
  /** Anzeigetext (getrennt von diagram-js `label`, das ein Label-Element referenziert). */
  wardleyLabel: string;
  decorators?: ComponentDecorators;
  movement?: Movement;
  /** nur Pipeline: Evolution-Range. */
  evolutionStart?: number;
  evolutionEnd?: number;
  /** nur Annotation. */
  annotationNumber?: number;
  /** nur Attitude-Region. */
  attitudeKind?: AttitudeKind;
  /** nur Accelerator. */
  acceleratorDirection?: AcceleratorDirection;
  businessObject?: MapElement;
}

export interface WardleyConnection extends Connection {
  wardleyType: WardleyConnectionType;
  bidirectional?: boolean;
  flowValue?: string;
  /** Annotationstext nach `;` (z.B. "limited by"). */
  linkLabel?: string;
  businessObject?: MapEdge;
}

function isObject(el: unknown): el is Record<string, unknown> {
  return typeof el === 'object' && el !== null;
}

export function isWardleyShape(el: unknown): el is WardleyShape {
  return isObject(el) && typeof el['wardleyType'] === 'string' && 'evolution' in el;
}

export function isWardleyConnection(el: unknown): el is WardleyConnection {
  return isObject(el) && typeof el['wardleyType'] === 'string' && 'waypoints' in el;
}

export function isComponent(el: unknown): el is WardleyShape {
  return isWardleyShape(el) && el.wardleyType === 'component';
}

export function isPipeline(el: unknown): el is WardleyShape {
  return isWardleyShape(el) && el.wardleyType === 'pipeline';
}
