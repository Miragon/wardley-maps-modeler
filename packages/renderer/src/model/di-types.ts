import type { Shape, Connection } from 'diagram-js/lib/model/Types';
import type {
  AcceleratorDirection,
  AttitudeKind,
  ComponentDecorators,
  MapEdge,
  MapElement,
  Movement,
} from '@miragon/wardley-schema-model';

/**
 * diagram-js runtime model with Wardley extensions.
 *
 * The positional truth while editing is `evolution`/`visibility` (normalized), NOT `x`/`y` (pixels)
 * and NOT the `businessObject` (concept doc §2.2, §5.6).
 * `businessObject` is the identity/metadata backref to the original model element.
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
  /** normalized [0,1] — runtime truth of the X position. */
  evolution: number;
  /** normalized [0,1] — runtime truth of the Y position. */
  visibility: number;
  /** Display text (separate from diagram-js `label`, which references a label element). */
  wardleyLabel: string;
  decorators?: ComponentDecorators;
  movement?: Movement;
  /** pipeline only: evolution range. */
  evolutionStart?: number;
  evolutionEnd?: number;
  /** annotation only. */
  annotationNumber?: number;
  /** attitude region only. */
  attitudeKind?: AttitudeKind;
  /** accelerator only. */
  acceleratorDirection?: AcceleratorDirection;
  /** note only: optional color (CSS color/hex from NOTE_COLORS). */
  color?: string;
  businessObject?: MapElement;
}

export interface WardleyConnection extends Connection {
  wardleyType: WardleyConnectionType;
  bidirectional?: boolean;
  flowValue?: string;
  /** annotation text after `;` (e.g. "limited by"). */
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
