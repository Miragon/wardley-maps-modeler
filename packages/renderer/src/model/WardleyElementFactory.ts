import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type {
  AcceleratorDirection,
  AcceleratorElement,
  AnchorElement,
  AnnotationElement,
  AttitudeElement,
  AttitudeKind,
  ComponentElement,
  MapEdge,
  NoteElement,
  PipelineElement,
  SubmapElement,
} from '@wardley/schema-model';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import { NODE_SIZE, PIPELINE_HEIGHT } from '../draw/styles.js';
import type { WardleyConnection, WardleyShape } from './di-types.js';

/** Optionale Defaults beim Drag-to-create (Palette). */
export interface CreateNewExtra {
  attitudeKind?: AttitudeKind;
  acceleratorDirection?: AcceleratorDirection;
  annotationNumber?: number;
  /** Komponenten-Decorator vorbelegen (z.B. Market-/Ecosystem-Palette-Eintrag). */
  market?: boolean;
  ecosystem?: boolean;
}

/**
 * Erzeugt diagram-js-Laufzeitelemente mit Wardley-Markern. Projiziert normierte Koordinaten
 * ueber die EINZIGE Mathematik-Quelle (EvolutionGrid, P7) nach Pixeln.
 */
export default class WardleyElementFactory {
  static $inject = ['elementFactory', 'evolutionGrid', 'elementRegistry'];

  constructor(
    private readonly elementFactory: ElementFactory,
    private readonly grid: EvolutionGrid,
    private readonly elementRegistry: ElementRegistry,
  ) {}

  /**
   * Liefert ein eindeutiges Label: `base`, sonst `base 2`, `base 3`, … Eindeutige Labels sind
   * Pflicht, weil die OWM-DSL Elemente UEBER IHREN NAMEN referenziert — doppelte Namen wuerden beim
   * Serialisieren/Re-Import zu ID-Kollisionen fuehren und Kanten (Linien) verlieren.
   *
   * @param excludeId optional die ID des gerade umbenannten Elements (zaehlt seinen eigenen
   *        aktuellen Namen NICHT als Kollision — sonst wuerde jedes Umbenennen suffixen).
   */
  uniqueLabel(base: string, excludeId?: string): string {
    const taken = new Set<string>();
    for (const el of this.elementRegistry.getAll()) {
      if (excludeId && el.id === excludeId) continue;
      const lbl = (el as { wardleyLabel?: unknown }).wardleyLabel;
      if (typeof lbl === 'string') taken.add(lbl);
    }
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  createComponent(el: ComponentElement): WardleyShape {
    return this.node(
      'component',
      el.id,
      el.label,
      el.position.visibility,
      el.position.evolution,
      el,
      {
        ...(el.decorators ? { decorators: el.decorators } : {}),
        ...(el.movement ? { movement: el.movement } : {}),
      },
    );
  }

  createAnchor(el: AnchorElement): WardleyShape {
    return this.node('anchor', el.id, el.label, el.position.visibility, el.position.evolution, el);
  }

  createNote(el: NoteElement): WardleyShape {
    return this.node('note', el.id, el.label, el.position.visibility, el.position.evolution, el);
  }

  createPipeline(el: PipelineElement): WardleyShape {
    const start = this.grid.toCanvas({
      visibility: el.position.visibility,
      evolution: el.evolutionStart,
    });
    const end = this.grid.toCanvas({
      visibility: el.position.visibility,
      evolution: el.evolutionEnd,
    });
    const width = Math.max(end.x - start.x, 2);
    const shape = this.elementFactory.createShape({
      id: el.id,
      x: start.x,
      y: start.y - PIPELINE_HEIGHT / 2,
      width,
      height: PIPELINE_HEIGHT,
      wardleyType: 'pipeline',
      wardleyLabel: el.label,
      evolution: el.position.evolution,
      visibility: el.position.visibility,
      evolutionStart: el.evolutionStart,
      evolutionEnd: el.evolutionEnd,
      // Rahmen: nur der Rand ist klickbar -> Innenklicks erreichen die Knoten (diagram-js isFrame).
      isFrame: true,
      businessObject: el,
    });
    return shape as unknown as WardleyShape;
  }

  createAnnotation(el: AnnotationElement): WardleyShape {
    const pos = el.positions[0] ?? el.position;
    return this.node('annotation', el.id, el.text, pos.visibility, pos.evolution, el, {
      annotationNumber: el.number,
    });
  }

  createAccelerator(el: AcceleratorElement): WardleyShape {
    return this.node(
      'accelerator',
      el.id,
      el.label,
      el.position.visibility,
      el.position.evolution,
      el,
      {
        acceleratorDirection: el.direction,
      },
    );
  }

  createAttitude(el: AttitudeElement): WardleyShape {
    // OWM: position = Ankerpunkt (oben links), width/height in px.
    const anchor = this.grid.toCanvas(el.position);
    const shape = this.elementFactory.createShape({
      id: el.id,
      x: anchor.x,
      y: anchor.y,
      width: Math.max(el.width, 4),
      height: Math.max(el.height, 4),
      wardleyType: 'attitude',
      wardleyLabel: el.label || el.kind,
      attitudeKind: el.kind,
      evolution: el.position.evolution,
      visibility: el.position.visibility,
      isFrame: true,
      businessObject: el,
    });
    return shape as unknown as WardleyShape;
  }

  createSubmap(el: SubmapElement): WardleyShape {
    return this.node('submap', el.id, el.label, el.position.visibility, el.position.evolution, el);
  }

  /** Erzeugt eine neue, noch nicht platzierte Shape (fuer Palette-/Drag-to-create). */
  createNew(
    type: WardleyShape['wardleyType'],
    rawLabel: string,
    extra: CreateNewExtra = {},
  ): WardleyShape {
    // Eindeutiges Label erzwingen -> verlustfreier DSL-Round-Trip (siehe uniqueLabel).
    const label = this.uniqueLabel(rawLabel);
    if (type === 'pipeline') {
      const shape = this.elementFactory.createShape({
        width: 200,
        height: PIPELINE_HEIGHT,
        wardleyType: 'pipeline',
        wardleyLabel: label,
        evolution: 0.5,
        visibility: 0.5,
        evolutionStart: 0.4,
        evolutionEnd: 0.6,
        isFrame: true,
      });
      return shape as unknown as WardleyShape;
    }
    if (type === 'attitude') {
      const shape = this.elementFactory.createShape({
        width: 180,
        height: 48,
        wardleyType: 'attitude',
        wardleyLabel: label,
        attitudeKind: extra.attitudeKind ?? 'pioneers',
        evolution: 0.5,
        visibility: 0.5,
        isFrame: true,
      });
      return shape as unknown as WardleyShape;
    }
    const decorators = extra.market
      ? { market: true }
      : extra.ecosystem
        ? { ecosystem: true }
        : undefined;
    const shape = this.elementFactory.createShape({
      width: NODE_SIZE,
      height: NODE_SIZE,
      wardleyType: type,
      wardleyLabel: label,
      evolution: 0.5,
      visibility: 0.5,
      ...(extra.acceleratorDirection ? { acceleratorDirection: extra.acceleratorDirection } : {}),
      ...(extra.annotationNumber !== undefined ? { annotationNumber: extra.annotationNumber } : {}),
      ...(decorators ? { decorators } : {}),
    });
    return shape as unknown as WardleyShape;
  }

  createDependency(edge: MapEdge, source: WardleyShape, target: WardleyShape): WardleyConnection {
    return this.connection('dependency', edge, source, target);
  }

  createFlow(edge: MapEdge, source: WardleyShape, target: WardleyShape): WardleyConnection {
    const bidirectional = edge.edgeType === 'flow' && edge.bidirectional === true;
    return this.connection('flow', edge, source, target, bidirectional);
  }

  private node(
    type: WardleyShape['wardleyType'],
    id: string,
    label: string,
    visibility: number,
    evolution: number,
    businessObject: WardleyShape['businessObject'],
    extra: Partial<WardleyShape> = {},
  ): WardleyShape {
    const center = this.grid.toCanvas({ visibility, evolution });
    const shape = this.elementFactory.createShape({
      id,
      x: center.x - NODE_SIZE / 2,
      y: center.y - NODE_SIZE / 2,
      width: NODE_SIZE,
      height: NODE_SIZE,
      wardleyType: type,
      wardleyLabel: label,
      evolution,
      visibility,
      businessObject,
      ...extra,
    });
    return shape as unknown as WardleyShape;
  }

  private connection(
    type: WardleyConnection['wardleyType'],
    edge: MapEdge,
    source: WardleyShape,
    target: WardleyShape,
    bidirectional = false,
  ): WardleyConnection {
    const flowValue = edge.edgeType === 'flow' ? edge.flowValue : undefined;
    const conn = this.elementFactory.createConnection({
      id: edge.id,
      source,
      target,
      waypoints: [centerOf(source), centerOf(target)],
      wardleyType: type,
      bidirectional,
      ...(flowValue ? { flowValue } : {}),
      ...(edge.label ? { linkLabel: edge.label } : {}),
      businessObject: edge,
    });
    return conn as unknown as WardleyConnection;
  }
}

function centerOf(shape: WardleyShape): { x: number; y: number } {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}
