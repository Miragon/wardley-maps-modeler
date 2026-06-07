import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { append as svgAppend, create as svgCreate, attr as svgAttr } from 'tiny-svg';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ElementLike, ShapeLike, ConnectionLike } from 'diagram-js/lib/model/Types';
import type { Point } from 'diagram-js/lib/util/Types';
import {
  COLORS,
  FONT,
  COMPONENT_RADIUS,
  COMPONENT_INNER_RADIUS,
  ANCHOR_ICON_SIZE,
  ATTITUDE_COLORS,
  NOTE_LINE_HEIGHT,
} from './styles.js';
import { drawIcon, ICON_PERSON } from './icons.js';
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from '../model/di-types.js';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';

/** BaseRenderer-Default ist 1000; 1500 gewinnt das render.shape/render.connection-Event. */
const WARDLEY_RENDER_PRIORITY = 1500;

type Attrs = Record<string, string | number>;

export default class WardleyRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'evolutionGrid'];

  constructor(
    eventBus: EventBus,
    private readonly grid: EvolutionGrid,
  ) {
    super(eventBus, WARDLEY_RENDER_PRIORITY);
  }

  override canRender(element: ElementLike): boolean {
    return isWardleyShape(element) || isWardleyConnection(element);
  }

  override drawShape(visuals: SVGElement, element: ShapeLike): SVGElement {
    const shape = element as unknown as WardleyShape;
    switch (shape.wardleyType) {
      case 'pipeline':
        return this.drawPipeline(visuals, shape);
      case 'anchor':
        return this.drawAnchor(visuals, shape);
      case 'note':
        return this.drawNote(visuals, shape);
      case 'attitude':
        return this.drawAttitude(visuals, shape);
      case 'annotation':
        return this.drawAnnotation(visuals, shape);
      case 'accelerator':
        return this.drawAccelerator(visuals, shape);
      case 'submap':
        return this.drawSubmap(visuals, shape);
      case 'component':
      default:
        return this.drawComponent(visuals, shape);
    }
  }

  override drawConnection(visuals: SVGElement, element: ConnectionLike): SVGElement {
    const conn = element as unknown as WardleyConnection;
    const isFlow = conn.wardleyType === 'flow';
    const color = isFlow ? COLORS.flow : COLORS.dependency;
    const [start, end] = endpoints(conn);

    const path = svgAttr(svgCreate('polyline'), {
      points: `${start.x},${start.y} ${end.x},${end.y}`,
      fill: 'none',
      stroke: color,
      'stroke-width': isFlow ? 2.5 : 1.5,
      'stroke-linecap': 'round',
    });
    svgAppend(visuals, path);

    // BPMN-Stil-Pfeilspitze am Ziel (beide Linientypen); bei bidirektionalem Flow auch an der Quelle.
    svgAppend(visuals, connectionArrow(start, end, color, isFlow ? 11 : 9, isFlow ? 5 : 4));
    if (isFlow && conn.bidirectional) {
      svgAppend(visuals, connectionArrow(end, start, color, 11, 5));
    }
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    if (isFlow && conn.flowValue) {
      svgAppend(
        visuals,
        label(conn.flowValue, mx, my - 5, {
          'text-anchor': 'middle',
          'font-size': 11,
          fill: COLORS.flow,
        }),
      );
    }
    // Link-Annotation (`; …`) am Mittelpunkt (etwas tiefer, falls auch ein Flow-Wert da ist).
    if (conn.linkLabel) {
      svgAppend(
        visuals,
        label(conn.linkLabel, mx, my + (conn.flowValue ? 12 : -4), {
          'text-anchor': 'middle',
          'font-size': 11,
          'font-style': 'italic',
          fill: COLORS.axisText,
        }),
      );
    }
    return path;
  }

  override getShapePath(shape: ShapeLike): string {
    const { x, y, width, height } = shape;
    return `M${x},${y}l${width},0l0,${height}l${-width},0z`;
  }

  override getConnectionPath(connection: ConnectionLike): string {
    const [first, ...rest] = connection.waypoints;
    if (!first) return '';
    return `M${first.x},${first.y}` + rest.map((p: Point) => `L${p.x},${p.y}`).join('');
  }

  // --- Knoten ---

  private drawComponent(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const cx = shape.width / 2;
    const cy = shape.height / 2;
    const evolving = !!shape.movement;
    const dec = shape.decorators;

    // Geplante Evolution: roter Pfeil zum Ziel-Event-Kreis (Pixel-Delta ueber die einzige Mathematik-Quelle).
    if (shape.movement) {
      const here = this.grid.toCanvas({ visibility: shape.visibility, evolution: shape.evolution });
      const there = this.grid.toCanvas({
        visibility: shape.visibility,
        evolution: shape.movement.targetEvolution,
      });
      const dx = there.x - here.x;
      svgAppend(
        visuals,
        line(cx, cy, cx + dx, cy, { stroke: COLORS.movement, 'stroke-width': 1.5 }),
      );
      svgAppend(visuals, connectionArrow({ x: cx, y: cy }, { x: cx + dx, y: cy }, COLORS.movement));
      // Ziel-Kreis = direkter Drag-Griff: per Klasse markiert, damit das Evolve-Modul ein
      // mousedown darauf abfängt und das Ziel per Drag verschieben lässt (siehe WardleyEvolveDragging).
      svgAppend(
        visuals,
        circle(cx + dx, cy, COMPONENT_RADIUS, {
          fill: COLORS.paper,
          stroke: COLORS.movement,
          'stroke-width': 2,
          class: 'wardley-evolve-handle',
        }),
      );
    }

    if (dec?.inertia) {
      const bx = cx + COMPONENT_RADIUS + 3;
      svgAppend(
        visuals,
        line(bx, cy - 13, bx, cy + 13, {
          stroke: COLORS.inertia,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        }),
      );
    }

    // Komponente im BPMN-Event-Stil: sauberer Kreis, weisse Fuellung, duenner Rand.
    const ring = circle(cx, cy, COMPONENT_RADIUS, {
      fill: COLORS.componentFill,
      stroke: COLORS.stroke,
      'stroke-width': 2,
    });
    svgAppend(visuals, ring);

    // "evolving" = Doppelring (Anlehnung an das BPMN-Intermediate-Event).
    if (evolving) {
      svgAppend(
        visuals,
        circle(cx, cy, COMPONENT_INNER_RADIUS, {
          fill: 'none',
          stroke: COLORS.stroke,
          'stroke-width': 1.5,
        }),
      );
    }

    // Market/Ecosystem als inneres Symbol (Event-Icon-Idiom).
    if (dec?.ecosystem) {
      svgAppend(
        visuals,
        circle(cx, cy, 4.5, { fill: 'none', stroke: COLORS.stroke, 'stroke-width': 1.5 }),
      );
    } else if (dec?.market) {
      svgAppend(visuals, circle(cx, cy, 3, { fill: COLORS.stroke }));
    }

    svgAppend(
      visuals,
      label(shape.wardleyLabel, cx + COMPONENT_RADIUS + 7, cy - 4, { 'font-weight': '500' }),
    );
    if (dec?.method) {
      svgAppend(
        visuals,
        label(dec.method, cx + COMPONENT_RADIUS + 7, cy + 11, {
          'font-size': 10.5,
          fill: COLORS.axisText,
        }),
      );
    }
    return ring;
  }

  private drawAnchor(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const cx = shape.width / 2;
    const cy = shape.height / 2;
    const icon = drawIcon(ICON_PERSON, cx, cy, ANCHOR_ICON_SIZE, COLORS.ink);
    svgAppend(visuals, icon);
    svgAppend(
      visuals,
      label(shape.wardleyLabel, cx, cy - ANCHOR_ICON_SIZE / 2 - 4, {
        'text-anchor': 'middle',
        'font-weight': '700',
      }),
    );
    return icon;
  }

  private drawPipeline(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const box = svgAttr(svgCreate('rect'), {
      x: 0,
      y: 0,
      width: Math.max(shape.width, 1),
      height: Math.max(shape.height, 1),
      rx: 4,
      fill: COLORS.accentSoft,
      stroke: COLORS.pipeline,
      'stroke-width': 1.25,
      'stroke-dasharray': '6 3',
    });
    svgAppend(visuals, box);
    svgAppend(visuals, label(shape.wardleyLabel, 4, -6, { 'font-weight': '500' }));
    return box;
  }

  private drawNote(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const color = shape.color;
    const lines = (shape.wardleyLabel ?? '').split('\n');
    const cx = shape.width / 2;
    // Zeilenblock vertikal in der Box zentrieren (+4 ~ Baseline-Offset fuer 13px).
    const y0 = shape.height / 2 - ((lines.length - 1) * NOTE_LINE_HEIGHT) / 2 + 4;
    const attrs = {
      'text-anchor': 'middle',
      fill: color ?? COLORS.noteText,
      'font-style': 'italic',
      // Eingefärbte Notizen leicht fetter -> Feedback (gut/schlecht) sticht hervor.
      ...(color ? { 'font-weight': '600' } : {}),
    };
    let first: SVGElement | undefined;
    lines.forEach((line, i) => {
      const el = label(line, cx, y0 + i * NOTE_LINE_HEIGHT, attrs);
      svgAppend(visuals, el);
      if (!first) first = el;
    });
    return first ?? svgCreate('text');
  }

  private drawAttitude(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const c = ATTITUDE_COLORS[shape.attitudeKind ?? 'pioneers'] ?? {
      fill: 'rgba(0,0,0,0.05)',
      stroke: '#666666',
    };
    const box = svgAttr(svgCreate('rect'), {
      x: 0,
      y: 0,
      width: Math.max(shape.width, 1),
      height: Math.max(shape.height, 1),
      rx: 10,
      fill: c.fill,
      stroke: c.stroke,
      'stroke-width': 1.25,
      'stroke-dasharray': '5 4',
    });
    svgAppend(visuals, box);
    svgAppend(
      visuals,
      label(capitalize(shape.attitudeKind ?? shape.wardleyLabel), 10, 18, {
        fill: c.stroke,
        'font-weight': '700',
        'letter-spacing': '0.04em',
      }),
    );
    return box;
  }

  private drawAnnotation(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const cx = shape.width / 2;
    const cy = shape.height / 2;
    const marker = circle(cx, cy, 10, {
      fill: '#fff8e6',
      stroke: COLORS.stroke,
      'stroke-width': 1.25,
    });
    svgAppend(visuals, marker);
    svgAppend(
      visuals,
      label(
        String(shape.annotationNumber ?? ''),
        cx,
        cy + 4,
        { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': '700' },
        false,
      ),
    );
    if (shape.wardleyLabel) {
      svgAppend(
        visuals,
        label(shape.wardleyLabel, cx + 15, cy + 4, { 'font-size': 12, fill: COLORS.noteText }),
      );
    }
    return marker;
  }

  private drawAccelerator(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const cx = shape.width / 2;
    const cy = shape.height / 2;
    const accelerate = shape.acceleratorDirection !== 'deaccelerate';
    const sym = label(accelerate ? '»' : '«', cx, cy + 6, {
      'text-anchor': 'middle',
      'font-size': 19,
      'font-weight': '700',
      fill: accelerate ? COLORS.flow : COLORS.movement,
    });
    svgAppend(visuals, sym);
    if (shape.wardleyLabel) {
      svgAppend(visuals, label(shape.wardleyLabel, cx + 11, cy + 6, { 'font-size': 12 }));
    }
    return sym;
  }

  private drawSubmap(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const cx = shape.width / 2;
    const cy = shape.height / 2;
    const r = COMPONENT_RADIUS + 1;
    // Distinkt: abgerundetes Quadrat mit innerem Quadrat (verschachtelte Karte).
    const outer = svgAttr(svgCreate('rect'), {
      x: cx - r,
      y: cy - r,
      width: r * 2,
      height: r * 2,
      rx: 3,
      fill: COLORS.componentFill,
      stroke: COLORS.stroke,
      'stroke-width': 2,
    });
    svgAppend(visuals, outer);
    svgAppend(
      visuals,
      svgAttr(svgCreate('rect'), {
        x: cx - r + 3,
        y: cy - r + 3,
        width: r * 2 - 6,
        height: r * 2 - 6,
        rx: 1.5,
        fill: 'none',
        stroke: COLORS.stroke,
        'stroke-width': 1,
      }),
    );
    svgAppend(visuals, label(shape.wardleyLabel, cx + r + 6, cy - 6, { 'font-weight': '500' }));
    return outer;
  }
}

// --- SVG-Helfer ---

function circle(cx: number, cy: number, r: number, attrs: Attrs): SVGElement {
  return svgAttr(svgCreate('circle'), { cx, cy, r, 'stroke-width': 1, ...attrs });
}

function line(x1: number, y1: number, x2: number, y2: number, attrs: Attrs): SVGElement {
  return svgAttr(svgCreate('line'), { x1, y1, x2, y2, ...attrs });
}

/**
 * Text-Label mit Papier-Halo (paint-order: stroke) fuer Lesbarkeit ueber Linien/Baendern.
 * `halo=false` deaktiviert den Halo (z.B. fuer Annotationsnummern auf gefuelltem Marker).
 */
function label(content: string, x: number, y: number, attrs: Attrs = {}, halo = true): SVGElement {
  const haloAttrs: Attrs = halo
    ? {
        stroke: COLORS.paper,
        'stroke-width': 3.5,
        'paint-order': 'stroke',
        'stroke-linejoin': 'round',
      }
    : {};
  const el = svgAttr(svgCreate('text'), {
    x,
    y,
    'font-family': FONT.family,
    'font-size': FONT.label,
    fill: COLORS.ink,
    ...haloAttrs,
    ...attrs,
  });
  el.textContent = content;
  return el;
}

/** Gefuellte BPMN-Stil-Pfeilspitze am Punkt `to`, ausgerichtet entlang from->to. */
function connectionArrow(from: Point, to: Point, color: string, len = 10, w = 5): SVGElement {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const bx = to.x - len * Math.cos(angle);
  const by = to.y - len * Math.sin(angle);
  const points =
    `${to.x},${to.y} ` +
    `${bx - w * Math.sin(angle)},${by + w * Math.cos(angle)} ` +
    `${bx + w * Math.sin(angle)},${by - w * Math.cos(angle)}`;
  return svgAttr(svgCreate('polygon'), { points, fill: color });
}

/** Effektiver Radius eines Knotens fuer das Cropping der Verbindung an seiner Boundary. */
function radiusOf(s: WardleyShape): number {
  if (s.wardleyType === 'component') return COMPONENT_RADIUS + 2;
  if (s.wardleyType === 'anchor') return ANCHOR_ICON_SIZE / 2 + 1;
  return Math.min(s.width, s.height) / 2;
}

/**
 * Verbindungs-Endpunkte aus den AKTUELLEN Knoten-Mittelpunkten, gecroppt an deren Boundary
 * (BPMN-Look: Linie endet am Rand, Pfeilspitze sichtbar — unabhaengig von der Z-Order, und
 * korrekt nach Verschieben, da bei jedem Render neu berechnet).
 */
function endpoints(conn: WardleyConnection): [Point, Point] {
  const s = conn.source as unknown as WardleyShape | undefined;
  const t = conn.target as unknown as WardleyShape | undefined;
  const wp = conn.waypoints;
  if (!s || !t) {
    const a = wp[0] ?? { x: 0, y: 0 };
    return [a, wp[wp.length - 1] ?? a];
  }
  const sc = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
  const tc = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const sr = radiusOf(s);
  const tr = radiusOf(t);
  if (dist <= sr + tr + 2) return [sc, tc];
  return [
    { x: sc.x + ux * sr, y: sc.y + uy * sr },
    { x: tc.x - ux * tr, y: tc.y - uy * tr },
  ];
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
