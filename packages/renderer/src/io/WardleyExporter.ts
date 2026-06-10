import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { Root } from 'diagram-js/lib/model/Types';
import {
  validateMap,
  CURRENT_SCHEMA_VERSION,
  type AnchorElement,
  type AnnotationElement,
  type AttitudeElement,
  type ComponentElement,
  type MapConfig,
  type MapEdge,
  type MapElement,
  type NoteElement,
  type PipelineElement,
  type SubmapElement,
  type WardleyMap,
} from '@miragon/wardley-schema-model';
import { isWardleyConnection, isWardleyShape, type WardleyShape } from '../model/di-types.js';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import { ROOT_ID, type RootBusinessObject } from './types.js';

function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Reconstructs a WardleyMap from the diagram-js runtime model. The source of truth for positions are
 * the DI properties `evolution`/`visibility`; editable fields (label, decorators, movement,
 * pipeline range) are likewise read from the DI properties (concept doc §5.6). The
 * `businessObject` serves only as a fallback for type-specific fields that are not (yet) editable.
 */
export default class WardleyExporter {
  static $inject = ['elementRegistry', 'canvas', 'evolutionGrid'];

  constructor(
    private readonly elementRegistry: ElementRegistry,
    private readonly canvas: Canvas,
    private readonly grid: EvolutionGrid,
  ) {}

  export(): WardleyMap {
    const root = this.canvas.getRootElement() as Root & { businessObject?: RootBusinessObject };
    const meta = root.businessObject;
    const config: MapConfig = meta?.config ?? { title: 'Untitled Map' };

    const elements: MapElement[] = [];
    const edges: MapEdge[] = [];

    for (const el of this.elementRegistry.getAll()) {
      if (el.id === ROOT_ID) continue;
      if (isWardleyConnection(el)) {
        if (el.businessObject) {
          edges.push(el.businessObject);
        } else {
          const base = { id: el.id, from: el.source?.id ?? '', to: el.target?.id ?? '' };
          edges.push(
            el.wardleyType === 'flow'
              ? { ...base, edgeType: 'flow', ...(el.bidirectional ? { bidirectional: true } : {}) }
              : { ...base, edgeType: 'dependency' },
          );
        }
      } else if (isWardleyShape(el)) {
        const built = this.buildElement(el);
        if (built) elements.push(built);
      }
    }

    // Consolidate pipeline membership: childIds are derived from component.pipelineId
    // (single source of truth); pipelineId references to deleted pipelines are discarded.
    const pipelineIds = new Set(
      elements.filter((e) => e.elementType === 'pipeline').map((e) => e.id),
    );
    const consolidated = elements.map((el) => {
      if (el.elementType === 'component' && el.pipelineId && !pipelineIds.has(el.pipelineId)) {
        const { pipelineId: _stale, ...rest } = el;
        return rest as MapElement;
      }
      if (el.elementType === 'pipeline') {
        const childIds = elements
          .filter((e) => e.elementType === 'component' && e.pipelineId === el.id)
          .map((e) => e.id);
        return { ...el, childIds };
      }
      return el;
    });

    const map: WardleyMap = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      config,
      elements: consolidated,
      edges,
      ...(meta?.rawPassthrough ? { rawPassthrough: meta.rawPassthrough } : {}),
    };

    return validateMap(map);
  }

  /** Builds a MapElement from the DI properties (common types) or the businessObject (the rest). */
  private buildElement(el: WardleyShape): MapElement | undefined {
    const position = { visibility: el.visibility, evolution: el.evolution };
    const bo = el.businessObject;

    switch (el.wardleyType) {
      case 'component':
        return compact({
          id: el.id,
          elementType: 'component',
          label: el.wardleyLabel,
          position,
          // labelOffset is not editable (yet); without the fallback it would be lost on
          // every export round trip.
          labelOffset: el.labelOffset ?? (bo as ComponentElement | undefined)?.labelOffset,
          decorators: el.decorators,
          movement: el.movement,
          // Membership is geometry-derived runtime truth (set on import, cleared when the box
          // moves away) — deliberately NO businessObject fallback.
          pipelineId: el.pipelineId,
          url: (bo as ComponentElement | undefined)?.url,
          color: el.color,
        }) as ComponentElement;
      case 'anchor':
        return compact({
          id: el.id,
          elementType: 'anchor',
          label: el.wardleyLabel,
          position,
          labelOffset: el.labelOffset ?? (bo as AnchorElement | undefined)?.labelOffset,
          color: el.color,
        }) as AnchorElement;
      case 'note':
        return compact({
          id: el.id,
          elementType: 'note',
          label: el.wardleyLabel,
          position,
          patternType: (bo as NoteElement | undefined)?.patternType,
          color: el.color,
        }) as NoteElement;
      case 'pipeline':
        return {
          id: el.id,
          elementType: 'pipeline',
          label: el.wardleyLabel,
          position,
          evolutionStart: el.evolutionStart ?? 0,
          evolutionEnd: el.evolutionEnd ?? 1,
          childIds: (bo as PipelineElement | undefined)?.childIds ?? [],
          ...(el.color ? { color: el.color } : {}),
        };
      case 'attitude':
        return {
          id: el.id,
          elementType: 'attitude',
          kind: el.attitudeKind ?? 'pioneers',
          label: el.wardleyLabel,
          position,
          // corner2 is maintained by the EvolutionConstraintBehavior on move/resize/create.
          corner2: el.corner2 ??
            (bo as AttitudeElement | undefined)?.corner2 ?? {
              visibility: Math.max(0, position.visibility - 0.1),
              evolution: Math.min(1, position.evolution + 0.15),
            },
          ...(el.color ? { color: el.color } : {}),
        };
      case 'accelerator':
        return {
          id: el.id,
          elementType: 'accelerator',
          direction: el.acceleratorDirection ?? 'accelerate',
          label: el.wardleyLabel,
          position,
          ...(el.color ? { color: el.color } : {}),
        };
      case 'annotation': {
        // The marker shows positions[0]; additional positions (multi-point annotation) are
        // preserved from the businessObject instead of collapsing to a single point on round trip.
        const extraPositions = ((bo as AnnotationElement | undefined)?.positions ?? []).slice(1);
        return {
          id: el.id,
          elementType: 'annotation',
          label: el.wardleyLabel,
          position,
          number: el.annotationNumber ?? 0,
          positions: [position, ...extraPositions],
          text: el.wardleyLabel,
          ...(el.color ? { color: el.color } : {}),
        };
      }
      case 'submap':
        return compact({
          id: el.id,
          elementType: 'submap',
          label: el.wardleyLabel,
          position,
          urlRef: (bo as SubmapElement | undefined)?.urlRef,
          color: el.color,
        }) as SubmapElement;
      case 'drawing': {
        // Points are stored relative to the shape in px — convert back per point.
        const points = (el.drawingPoints ?? []).map((p) =>
          this.grid.fromCanvas({ x: el.x + p.x, y: el.y + p.y }),
        );
        if (points.length < 2) return undefined;
        return {
          id: el.id,
          elementType: 'drawing',
          label: '',
          position: points[0]!,
          points,
          ...(el.closed ? { closed: true } : {}),
          ...(el.strokeStyle ? { strokeStyle: el.strokeStyle } : {}),
          ...(el.color ? { color: el.color } : {}),
        };
      }
      default: {
        const exhaustive: never = el.wardleyType;
        void exhaustive;
        return bo ? ({ ...bo, position } as MapElement) : undefined;
      }
    }
  }
}
