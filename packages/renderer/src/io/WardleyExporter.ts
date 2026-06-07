import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { Root } from 'diagram-js/lib/model/Types';
import {
  validateMap,
  CURRENT_SCHEMA_VERSION,
  type ComponentElement,
  type MapConfig,
  type MapEdge,
  type MapElement,
  type NoteElement,
  type PipelineElement,
  type SubmapElement,
  type WardleyMap,
} from '@wardley/schema-model';
import { isWardleyConnection, isWardleyShape, type WardleyShape } from '../model/di-types.js';
import { ROOT_ID, type RootBusinessObject } from './types.js';

function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Rekonstruiert ein WardleyMap aus dem diagram-js-Laufzeitmodell. Positions-Wahrheit sind die
 * DI-Properties `evolution`/`visibility`; editierbare Felder (Label, Decorators, Movement,
 * Pipeline-Range) werden ebenfalls aus den DI-Properties gelesen (Konzept §5.6). Das
 * `businessObject` dient nur als Fallback fuer (noch) nicht editierbare typ-spezifische Felder.
 */
export default class WardleyExporter {
  static $inject = ['elementRegistry', 'canvas'];

  constructor(
    private readonly elementRegistry: ElementRegistry,
    private readonly canvas: Canvas,
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

    const map: WardleyMap = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      config,
      elements,
      edges,
      ...(meta?.rawPassthrough ? { rawPassthrough: meta.rawPassthrough } : {}),
    };

    return validateMap(map);
  }

  /** Baut ein MapElement aus den DI-Properties (gaengige Typen) bzw. dem businessObject (Rest). */
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
          decorators: el.decorators,
          movement: el.movement,
          pipelineId: (bo as ComponentElement | undefined)?.pipelineId,
        }) as ComponentElement;
      case 'anchor':
        return { id: el.id, elementType: 'anchor', label: el.wardleyLabel, position };
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
        };
      case 'attitude':
        return {
          id: el.id,
          elementType: 'attitude',
          kind: el.attitudeKind ?? 'pioneers',
          label: el.wardleyLabel,
          position,
          width: el.width,
          height: el.height,
        };
      case 'accelerator':
        return {
          id: el.id,
          elementType: 'accelerator',
          direction: el.acceleratorDirection ?? 'accelerate',
          label: el.wardleyLabel,
          position,
        };
      case 'annotation':
        return {
          id: el.id,
          elementType: 'annotation',
          label: el.wardleyLabel,
          position,
          number: el.annotationNumber ?? 0,
          positions: [position],
          text: el.wardleyLabel,
        };
      case 'submap':
        return compact({
          id: el.id,
          elementType: 'submap',
          label: el.wardleyLabel,
          position,
          urlRef: (bo as SubmapElement | undefined)?.urlRef,
        }) as SubmapElement;
      default: {
        const exhaustive: never = el.wardleyType;
        void exhaustive;
        return bo ? ({ ...bo, position } as MapElement) : undefined;
      }
    }
  }
}
