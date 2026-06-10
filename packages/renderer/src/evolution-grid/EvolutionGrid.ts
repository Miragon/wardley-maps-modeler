import {
  append as svgAppend,
  create as svgCreate,
  attr as svgAttr,
  clear as svgClear,
} from 'tiny-svg';
import {
  evolutionStage,
  DEFAULT_STAGE_BOUNDARIES,
  DEFAULT_EVOLUTION_LABELS,
  type Coordinate,
  type EvolutionStage,
  type MapConfig,
} from '@miragon/wardley-schema-model';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type { Point } from 'diagram-js/lib/util/Types';
import { PLOT, PLOT_MIN, COLORS, FONT } from '../draw/styles.js';

const AXES_LAYER = 'wardley-axes';

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Holds the SINGLE pixel<->normalized transform (guiding principle P7) and renders the
 * non-interactive axis/grid background into its own diagram-js layer (z below the
 * elements). The plot size is changeable at runtime via `config.size` ("scale map").
 */
export default class EvolutionGrid {
  static $inject = ['canvas'];

  private boundaries: readonly [number, number, number] = DEFAULT_STAGE_BOUNDARIES;
  private labels: readonly [string, string, string, string] = DEFAULT_EVOLUTION_LABELS;
  private yAxisLabel = 'Value Chain';
  private yAxisEndLabels: readonly [string, string] = ['invisible', 'visible'];
  private plotWidth: number = PLOT.width;
  private plotHeight: number = PLOT.height;

  constructor(private readonly canvas: Canvas) {}

  configure(config: MapConfig): void {
    this.boundaries = config.stageBoundaries ?? DEFAULT_STAGE_BOUNDARIES;
    this.labels = config.evolutionLabels ?? DEFAULT_EVOLUTION_LABELS;
    this.yAxisLabel = config.yAxisLabel ?? 'Value Chain';
    this.yAxisEndLabels = config.yAxisEndLabels ?? ['invisible', 'visible'];
    this.plotWidth = Math.max(config.size?.width ?? PLOT.width, PLOT_MIN.width);
    this.plotHeight = Math.max(config.size?.height ?? PLOT.height, PLOT_MIN.height);
  }

  /** Normalized -> diagram px (center of the node). */
  toCanvas(coord: Coordinate): Point {
    return {
      x: PLOT.marginLeft + coord.evolution * this.plotWidth,
      y: PLOT.marginTop + (1 - coord.visibility) * this.plotHeight,
    };
  }

  /** diagram px -> normalized, clamped to [0,1]. */
  fromCanvas(point: Point): Coordinate {
    return {
      evolution: clamp01((point.x - PLOT.marginLeft) / this.plotWidth),
      visibility: clamp01(1 - (point.y - PLOT.marginTop) / this.plotHeight),
    };
  }

  stageOf(evolution: number): EvolutionStage {
    return evolutionStage(evolution, this.boundaries);
  }

  /** The three stage boundaries (evolution values) — for snapping. */
  getBoundaries(): readonly [number, number, number] {
    return this.boundaries;
  }

  getPlotSize(): { width: number; height: number } {
    return { width: this.plotWidth, height: this.plotHeight };
  }

  /** Outer bounds including margins (for the initial viewbox). */
  outerBounds(): { x: number; y: number; width: number; height: number } {
    return {
      x: 0,
      y: 0,
      width: PLOT.marginLeft + this.plotWidth + PLOT.marginRight,
      height: PLOT.marginTop + this.plotHeight + PLOT.marginBottom,
    };
  }

  render(): void {
    const layer = this.canvas.getLayer(AXES_LAYER, -1);
    svgClear(layer);

    const left = PLOT.marginLeft;
    const top = PLOT.marginTop;
    const right = left + this.plotWidth;
    const bottom = top + this.plotHeight;

    // Plot background
    svgAppend(
      layer,
      rect(left, top, this.plotWidth, this.plotHeight, {
        fill: COLORS.plotBackground,
        stroke: COLORS.grid,
      }),
    );

    const edges = [0, ...this.boundaries, 1];
    for (let i = 0; i < 4; i++) {
      const x0 = left + edges[i]! * this.plotWidth;
      const x1 = left + edges[i + 1]! * this.plotWidth;
      if (i % 2 === 1) {
        svgAppend(
          layer,
          rect(x0, top, x1 - x0, this.plotHeight, { fill: COLORS.band, stroke: 'none' }),
        );
      }
      if (i > 0) {
        svgAppend(
          layer,
          line(x0, top, x0, bottom, { stroke: COLORS.grid, 'stroke-dasharray': '3 5' }),
        );
      }
      const midX = (x0 + x1) / 2;
      svgAppend(
        layer,
        text(this.labels[i]!.toUpperCase(), midX, bottom + 18, {
          'text-anchor': 'middle',
          'font-size': FONT.stage,
          'letter-spacing': '0.08em',
          fill: COLORS.axisText,
        }),
      );
    }

    svgAppend(layer, line(left, bottom, right + 10, bottom, { stroke: COLORS.axis }));
    svgAppend(layer, arrowHead(right + 10, bottom, 'right'));
    svgAppend(
      layer,
      text('Evolution', right + 6, bottom + 38, {
        'text-anchor': 'end',
        'font-size': FONT.axis,
        fill: COLORS.axisText,
        'font-style': 'italic',
      }),
    );

    svgAppend(layer, line(left, bottom, left, top - 10, { stroke: COLORS.axis }));
    svgAppend(layer, arrowHead(left, top - 10, 'up'));
    const yLabel = text(this.yAxisLabel, 0, 0, {
      'text-anchor': 'middle',
      'font-size': FONT.axis,
      fill: COLORS.axisText,
      'font-style': 'italic',
    });
    svgAttr(yLabel, { transform: `translate(${left - 46}, ${(top + bottom) / 2}) rotate(-90)` });
    svgAppend(layer, yLabel);

    // Axis end labels [bottom, top] — configurable via `y-axis Label->Bottom->Top`.
    svgAppend(
      layer,
      text(this.yAxisEndLabels[1], left - 10, top + 11, {
        'text-anchor': 'end',
        'font-size': FONT.stage,
        fill: COLORS.axisText,
      }),
    );
    svgAppend(
      layer,
      text(this.yAxisEndLabels[0], left - 10, bottom - 2, {
        'text-anchor': 'end',
        'font-size': FONT.stage,
        fill: COLORS.axisText,
      }),
    );
  }
}

type Attrs = Record<string, string | number>;

function rect(x: number, y: number, w: number, h: number, attrs: Attrs): SVGElement {
  return svgAttr(svgCreate('rect'), { x, y, width: w, height: h, 'stroke-width': 1, ...attrs });
}

function line(x1: number, y1: number, x2: number, y2: number, attrs: Attrs): SVGElement {
  return svgAttr(svgCreate('line'), { x1, y1, x2, y2, 'stroke-width': 1, ...attrs });
}

function text(content: string, x: number, y: number, attrs: Attrs): SVGElement {
  const el = svgAttr(svgCreate('text'), { x, y, 'font-family': FONT.family, ...attrs });
  el.textContent = content;
  return el;
}

function arrowHead(x: number, y: number, dir: 'right' | 'up'): SVGElement {
  const s = 5;
  const points =
    dir === 'right'
      ? `${x - s},${y - s} ${x + 2},${y} ${x - s},${y + s}`
      : `${x - s},${y + s} ${x},${y - 2} ${x + s},${y + s}`;
  return svgAttr(svgCreate('polygon'), { points, fill: COLORS.axis });
}
