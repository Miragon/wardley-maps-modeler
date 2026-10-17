import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { append as svgAppend, create as svgCreate, attr as svgAttr } from 'tiny-svg';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ElementLike, ShapeLike, ConnectionLike } from 'diagram-js/lib/model/Types';
import type { Point } from 'diagram-js/lib/util/Types';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import {
  COLORS,
  FONT,
  COMPONENT_RADIUS,
  COMPONENT_INNER_RADIUS,
  ANCHOR_ICON_SIZE,
  ATTITUDE_COLORS,
  ATTITUDE_TITLES,
  NOTE_LINE_HEIGHT,
  PIPELINE_ANCHOR_SIZE,
} from './styles.js';
import { drawIcon, ICON_FAST_FORWARD, ICON_FAST_REWIND, ICON_PERSON } from './icons.js';
import {
  LABEL_METHOD_LINE_SHIFT,
  anchorLabelPlacement,
  componentLabelPlacement,
  movementDeltaX as movementDeltaXOf,
  movementLabelPlacement,
  type LabelPlacement,
} from './label-layout.js';
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from '../model/di-types.js';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import { connectionAnchorOf } from '../layout/index.js';

/** BaseRenderer default is 1000; 1500 wins the render.shape/render.connection event. */
const WARDLEY_RENDER_PRIORITY = 1500;

/** Primary name text of a node (contract shared with other modules and consumers' CSS). */
export const NAME_LABEL_CLASS = 'wardley-name-label';
/** Groups every evolve visual so tools (e.g. the context pad) can tell the node from its movement. */
export const MOVEMENT_CLASS = 'wardley-movement';
/** Labels the user may drag to set an OWM `label [dx, dy]` offset (see the label-drag module). */
export const LABEL_HANDLE_CLASS = 'wardley-label-handle';
/** Which offset a dragged label writes: the node's own `labelOffset` or its evolve's. */
export const LABEL_ROLE_ATTRIBUTE = 'data-label-role';
const ATTITUDE_TITLE_CLEARANCE = 6;

type Attrs = Record<string, string | number>;

export default class WardleyRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'evolutionGrid', 'elementRegistry'];

  constructor(
    eventBus: EventBus,
    private readonly grid: EvolutionGrid,
    private readonly elementRegistry: ElementRegistry,
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
      case 'drawing':
        return this.drawDrawing(visuals, shape);
      case 'component':
      default:
        return this.drawComponent(visuals, shape);
    }
  }

  /** Freeform drawing: polyline/polygon from relative points (see WardleyDrawTool). */
  private drawDrawing(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const pts = shape.drawingPoints ?? [];
    const dash =
      shape.strokeStyle === 'dashed' ? '8 5' : shape.strokeStyle === 'dotted' ? '2 4' : undefined;
    const path = svgAttr(svgCreate(shape.closed ? 'polygon' : 'polyline'), {
      points: pts.map((p) => `${p.x},${p.y}`).join(' '),
      fill: 'none',
      stroke: shape.color ?? COLORS.ink,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...(dash ? { 'stroke-dasharray': dash } : {}),
    });
    svgAppend(visuals, path);
    return path;
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

    // Canon: dependencies are plain lines WITHOUT an arrowhead (direction follows from the value
    // chain, concept doc §8.3); only flow links carry arrowheads (bidirectional: on both ends).
    if (isFlow) {
      svgAppend(visuals, connectionArrow(start, end, color, 11, 5));
      if (conn.bidirectional) {
        svgAppend(visuals, connectionArrow(end, start, color, 11, 5));
      }
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
    // Link annotation (`; …`) at the midpoint (a bit lower if a flow value is also present).
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

  private drawComponent(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const cx = shape.width / 2;
    const cy = shape.height / 2;
    const dec = shape.decorators;
    const movementDeltaX = movementDeltaXOf(shape, this.grid);

    if (movementDeltaX !== undefined) this.drawMovement(visuals, shape, cx, cy, movementDeltaX);
    if (dec?.inertia) drawInertiaMarker(visuals, cx, cy);

    // User-picked element color tints stroke and label (default: ink-on-paper look).
    const tint = shape.color ?? COLORS.stroke;
    const ring = circle(cx, cy, COMPONENT_RADIUS, {
      fill: COLORS.componentFill,
      stroke: tint,
      'stroke-width': 2,
    });
    svgAppend(visuals, ring);

    // "evolving" = double ring (echoing the BPMN intermediate event).
    if (shape.movement) {
      svgAppend(
        visuals,
        circle(cx, cy, COMPONENT_INNER_RADIUS, { fill: 'none', stroke: tint, 'stroke-width': 1.5 }),
      );
    }

    drawComponentSymbols(visuals, cx, cy, tint, dec);
    drawComponentLabel(visuals, shape, cx, cy, componentLabelPlacement(shape, movementDeltaX));
    return ring;
  }

  /** Planned evolution (canon: DASHED red line with arrow, target label in red). */
  private drawMovement(
    visuals: SVGElement,
    shape: WardleyShape,
    cx: number,
    cy: number,
    movementDeltaX: number,
  ): void {
    const mv = shape.movement;
    if (!mv) return;
    const group = svgAttr(svgCreate('g'), { class: MOVEMENT_CLASS });
    svgAppend(visuals, group);
    const tx = cx + movementDeltaX;
    // End the arrowhead BEFORE the target circle's edge — otherwise the circle hides it entirely.
    const dir = Math.sign(movementDeltaX) || 1;
    const tipX = tx - dir * (COMPONENT_RADIUS + 2);
    // Paper-coloured knock-out: a pipeline's dashed top edge runs through its anchor component's
    // centre line, and two interleaved dash patterns read as one broken line.
    svgAppend(
      group,
      line(cx, cy, tipX, cy, {
        stroke: COLORS.plotBackground,
        'stroke-width': 4,
        'stroke-linecap': 'butt',
        class: 'wardley-movement-underlay',
      }),
    );
    svgAppend(
      group,
      line(cx, cy, tipX, cy, {
        stroke: COLORS.movement,
        'stroke-width': 1.5,
        'stroke-dasharray': '6 4',
      }),
    );
    svgAppend(group, connectionArrow({ x: cx, y: cy }, { x: tipX, y: cy }, COLORS.movement));
    // Target circle = direct drag handle: marked by class so the evolve module can intercept a
    // mousedown on it and let the target be moved by dragging (see WardleyEvolveDragging).
    svgAppend(
      group,
      circle(tx, cy, COMPONENT_RADIUS, {
        fill: COLORS.paper,
        stroke: COLORS.movement,
        'stroke-width': 2,
        class: 'wardley-evolve-handle',
      }),
    );
    // Target label (evolve Old->New) or the component's name — canonically red at the target circle.
    const placement = movementLabelPlacement(mv.labelOffset, movementDeltaX);
    svgAppend(
      group,
      label(mv.newLabel ?? shape.wardleyLabel, cx + placement.x, cy + placement.y, {
        'font-weight': '500',
        fill: COLORS.movement,
        'text-anchor': placement.anchor,
        class: `wardley-movement-label ${LABEL_HANDLE_CLASS}`,
        [LABEL_ROLE_ATTRIBUTE]: 'movement',
      }),
    );
    if (mv.method) {
      svgAppend(
        group,
        label(mv.method, cx + placement.x, cy + placement.y + LABEL_METHOD_LINE_SHIFT, {
          'font-size': 10.5,
          fill: COLORS.movement,
          'text-anchor': placement.anchor,
        }),
      );
    }
  }

  private drawAnchor(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const cx = shape.width / 2;
    const cy = shape.height / 2;
    const icon = drawIcon(ICON_PERSON, cx, cy, ANCHOR_ICON_SIZE, shape.color ?? COLORS.ink);
    svgAppend(visuals, icon);
    const placement = anchorLabelPlacement(shape);
    svgAppend(
      visuals,
      label(shape.wardleyLabel, cx + placement.x, cy + placement.y, {
        'text-anchor': placement.anchor,
        'font-weight': '700',
        class: `${NAME_LABEL_CLASS} ${LABEL_HANDLE_CLASS}`,
        [LABEL_ROLE_ATTRIBUTE]: 'name',
        ...(shape.color ? { fill: shape.color } : {}),
      }),
    );
    return icon;
  }

  private drawPipeline(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const width = Math.max(shape.width, 1);
    const tint = shape.color;
    const box = svgAttr(svgCreate('rect'), {
      x: 0,
      y: 0,
      width,
      height: Math.max(shape.height, 1),
      rx: 4,
      // No background fill — the box is a pure outline (the variants stay fully visible).
      fill: 'none',
      stroke: tint ?? COLORS.pipeline,
      'stroke-width': 1.25,
      'stroke-dasharray': '6 3',
    });
    svgAppend(visuals, box);
    // OWM anchor convention: if a same-named component exists, THAT component is the anchor —
    // drawing a second ■ (and a duplicate label) on the box would just clutter the line.
    // Only standalone pipelines render their own ■ anchor + name on the top edge.
    const hasNamedComponent = this.elementRegistry
      .filter(
        (el) => isWardleyShape(el) && (el as unknown as WardleyShape).wardleyType === 'component',
      )
      .some((c) => (c as unknown as WardleyShape).wardleyLabel === shape.wardleyLabel);
    if (!hasNamedComponent) {
      const half = PIPELINE_ANCHOR_SIZE / 2;
      svgAppend(
        visuals,
        svgAttr(svgCreate('rect'), {
          x: width / 2 - half,
          y: -half,
          width: PIPELINE_ANCHOR_SIZE,
          height: PIPELINE_ANCHOR_SIZE,
          fill: COLORS.componentFill,
          stroke: tint ?? COLORS.stroke,
          'stroke-width': 2,
        }),
      );
      svgAppend(
        visuals,
        label(shape.wardleyLabel, width / 2 + half + 6, -4, {
          'font-weight': '500',
          class: NAME_LABEL_CLASS,
          ...(tint ? { fill: tint } : {}),
        }),
      );
    }
    return box;
  }

  private drawNote(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const color = shape.color;
    const lines = (shape.wardleyLabel ?? '').split('\n');
    const cx = shape.width / 2;
    // Center the block of lines vertically in the box (+4 ~ baseline offset for 13px).
    const y0 = shape.height / 2 - ((lines.length - 1) * NOTE_LINE_HEIGHT) / 2 + 4;
    const attrs = {
      'text-anchor': 'middle',
      class: NAME_LABEL_CLASS,
      fill: color ?? COLORS.noteText,
      'font-style': 'italic',
      // Colored notes are slightly bolder -> feedback (good/bad) stands out.
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
    const kind = shape.attitudeKind ?? 'pioneers';
    const c = ATTITUDE_COLORS[kind] ?? ATTITUDE_COLORS['pioneers']!;
    // A user-picked color overrides the kind palette (stroke + label; the soft fill stays).
    const stroke = shape.color ?? c.stroke;
    const box = svgAttr(svgCreate('rect'), {
      x: 0,
      y: 0,
      width: Math.max(shape.width, 1),
      height: Math.max(shape.height, 1),
      rx: 10,
      fill: c.fill,
      stroke,
      'stroke-width': 1.25,
      'stroke-dasharray': '5 4',
    });
    svgAppend(visuals, box);
    // Regions sit behind every line, so a title inside the box gets struck through by dependencies.
    // Above the top edge it stays clear — unless that would leave the plot (then it stays inside).
    const plotTop = this.grid.toCanvas({ visibility: 1, evolution: 0 }).y;
    const titleAbove = shape.y - ATTITUDE_TITLE_CLEARANCE - FONT.label >= plotTop;
    // Regions are unlabelled as in OWM: the title is always the canonical kind name.
    svgAppend(
      visuals,
      label(
        ATTITUDE_TITLES[kind] ?? kind,
        titleAbove ? 4 : 10,
        titleAbove ? -ATTITUDE_TITLE_CLEARANCE : 18,
        {
          fill: stroke,
          'font-weight': '700',
          'letter-spacing': '0.04em',
          class: 'wardley-attitude-title',
        },
      ),
    );
    return box;
  }

  private drawAnnotation(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const cx = shape.width / 2;
    const cy = shape.height / 2;
    const marker = circle(cx, cy, 10, {
      fill: COLORS.annotationFill,
      stroke: shape.color ?? COLORS.stroke,
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
    // Real arrow symbol (OWM canon: a clearly visible market force, not a text glyph).
    const sym = drawIcon(
      accelerate ? ICON_FAST_FORWARD : ICON_FAST_REWIND,
      cx,
      cy,
      24,
      shape.color ?? (accelerate ? COLORS.accelerator : COLORS.deaccelerator),
    );
    svgAppend(visuals, sym);
    if (shape.wardleyLabel) {
      svgAppend(
        visuals,
        label(shape.wardleyLabel, cx + 15, cy + 5, { 'font-size': 12, class: NAME_LABEL_CLASS }),
      );
    }
    return sym;
  }

  private drawSubmap(visuals: SVGElement, shape: WardleyShape): SVGElement {
    const cx = shape.width / 2;
    const cy = shape.height / 2;
    const r = COMPONENT_RADIUS + 1;
    const tint = shape.color ?? COLORS.stroke;
    const outer = svgAttr(svgCreate('rect'), {
      x: cx - r,
      y: cy - r,
      width: r * 2,
      height: r * 2,
      rx: 3,
      fill: COLORS.componentFill,
      stroke: tint,
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
        stroke: tint,
        'stroke-width': 1,
      }),
    );
    svgAppend(
      visuals,
      label(shape.wardleyLabel, cx + r + 6, cy - 6, {
        'font-weight': '500',
        class: NAME_LABEL_CLASS,
        ...(shape.color ? { fill: shape.color } : {}),
      }),
    );
    return outer;
  }
}

function drawInertiaMarker(visuals: SVGElement, cx: number, cy: number): void {
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

/** Canon symbols: market = three dots in a triangle, ecosystem = dotted outer ring. */
function drawComponentSymbols(
  visuals: SVGElement,
  cx: number,
  cy: number,
  tint: string,
  dec: WardleyShape['decorators'],
): void {
  if (dec?.ecosystem) {
    svgAppend(
      visuals,
      circle(cx, cy, COMPONENT_RADIUS + 3.5, {
        fill: 'none',
        stroke: tint,
        'stroke-width': 1.25,
        'stroke-dasharray': '1.5 3',
        'stroke-linecap': 'round',
      }),
    );
  }
  if (dec?.market) {
    for (const [mx, my] of [
      [0, -3.8],
      [-3.4, 2.4],
      [3.4, 2.4],
    ] as const) {
      svgAppend(visuals, circle(cx + mx, cy + my, 1.7, { fill: tint }));
    }
  }
}

/**
 * Name label (honoring the OWM `label [dx, dy]` offset) plus the optional sourcing method below it.
 * Sourcing stays a subtle text label — deliberately no marker box (product decision: calm canvas).
 */
function drawComponentLabel(
  visuals: SVGElement,
  shape: WardleyShape,
  cx: number,
  cy: number,
  placement: LabelPlacement,
): void {
  const lx = cx + placement.x;
  const ly = cy + placement.y;
  svgAppend(
    visuals,
    label(shape.wardleyLabel, lx, ly, {
      'font-weight': '500',
      'text-anchor': placement.anchor,
      class: `${NAME_LABEL_CLASS} ${LABEL_HANDLE_CLASS}`,
      [LABEL_ROLE_ATTRIBUTE]: 'name',
      ...(shape.color ? { fill: shape.color } : {}),
    }),
  );
  const method = shape.decorators?.method;
  if (method) {
    svgAppend(
      visuals,
      label(method, lx, ly + LABEL_METHOD_LINE_SHIFT, {
        'font-size': 10.5,
        'text-anchor': placement.anchor,
        fill: COLORS.axisText,
      }),
    );
  }
}

function circle(cx: number, cy: number, r: number, attrs: Attrs): SVGElement {
  return svgAttr(svgCreate('circle'), { cx, cy, r, 'stroke-width': 1, ...attrs });
}

function line(x1: number, y1: number, x2: number, y2: number, attrs: Attrs): SVGElement {
  return svgAttr(svgCreate('line'), { x1, y1, x2, y2, ...attrs });
}

/**
 * Text label with a paper halo (paint-order: stroke) for legibility over lines/bands.
 * `halo=false` disables the halo (e.g. for annotation numbers on a filled marker).
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

/** Effective radius of a node for cropping the connection at its boundary. */
function radiusOf(s: WardleyShape): number {
  if (s.wardleyType === 'component') return COMPONENT_RADIUS + 2;
  if (s.wardleyType === 'anchor') return ANCHOR_ICON_SIZE / 2 + 1;
  if (s.wardleyType === 'pipeline') return PIPELINE_ANCHOR_SIZE / 2 + 2;
  return Math.min(s.width, s.height) / 2;
}

/**
 * Connection endpoints from the CURRENT node centers, cropped at their boundary
 * (BPMN look: line ends at the edge, arrowhead visible — independent of z-order, and
 * correct after moving, since recomputed on every render).
 */
function endpoints(conn: WardleyConnection): [Point, Point] {
  const s = conn.source as unknown as WardleyShape | undefined;
  const t = conn.target as unknown as WardleyShape | undefined;
  const wp = conn.waypoints;
  if (!s || !t) {
    const a = wp[0] ?? { x: 0, y: 0 };
    return [a, wp[wp.length - 1] ?? a];
  }
  const sc = connectionAnchorOf(s);
  const tc = connectionAnchorOf(t);
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
