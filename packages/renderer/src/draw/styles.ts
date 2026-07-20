/** Central rendering constants (geometry, colors, typography) — Miragon corporate identity. */

import { DEFAULT_PLOT_SIZE } from '@miragon/wardley-schema-model';
import { MIRAGON } from '../theme/index.js';

/**
 * Default plot area in diagram px (interior without axis margins). Changeable at runtime via
 *  config.size. Width/height come from schema-model (single source, also used for migrations).
 */
export const PLOT = {
  width: DEFAULT_PLOT_SIZE.width,
  height: DEFAULT_PLOT_SIZE.height,
  marginLeft: 66,
  marginTop: 38,
  marginRight: 44,
  marginBottom: 58,
} as const;

export const PLOT_MIN = { width: 480, height: 320 } as const;

export const NODE_SIZE = 34;
export const COMPONENT_RADIUS = 15;
export const COMPONENT_INNER_RADIUS = 12;
export const ANCHOR_ICON_SIZE = 26;
export const PIPELINE_HEIGHT = 30;
export const PIPELINE_ANCHOR_SIZE = 16;

export const NOTE_LINE_HEIGHT = 17;
const NOTE_PAD_X = 8;
const NOTE_PAD_Y = 6;
const NOTE_CHAR_W = 7.5;

/**
 * Box dimensions of a note from its (possibly multi-line) text. The note shape grows as large as
 * its text -> the move/click hitbox grows with it (instead of a fixed 34px). Minimum = NODE_SIZE.
 */
export function noteMetrics(label: string): { lines: string[]; width: number; height: number } {
  const lines = (label && label.length ? label : 'note').split('\n');
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  return {
    lines,
    width: Math.max(NODE_SIZE, Math.round(maxLen * NOTE_CHAR_W) + NOTE_PAD_X * 2),
    height: Math.max(NODE_SIZE, lines.length * NOTE_LINE_HEIGHT + NOTE_PAD_Y * 2),
  };
}

/**
 * Canvas colours — Miragon palette (blue = interactive/flow, green = accelerate/positive,
 * red = movement/decelerate). Keys are the public contract; brand values come from the single source
 * of truth in `theme/palette.ts` (`MIRAGON`). Referenced (not spread) so the literal-string types
 * survive into the published `.d.ts`.
 */
export const COLORS = {
  paper: MIRAGON.grau,
  ink: MIRAGON.schwarz,
  inkSoft: '#5B5B5B',
  axis: 'rgba(51,93,229,0.22)',
  axisText: '#6E7797',
  grid: 'rgba(51,93,229,0.12)',
  band: 'rgba(51,93,229,0.04)',
  stroke: MIRAGON.schwarz,
  componentFill: MIRAGON.weiss,
  anchorFill: MIRAGON.schwarz,
  dependency: '#9E9E9E',
  accent: MIRAGON.blau,
  accentSoft: 'rgba(51,93,229,0.12)',
  flow: MIRAGON.blau,
  movement: MIRAGON.danger,
  inertia: MIRAGON.schwarz,
  noteText: '#5B5B5B',
  pipeline: MIRAGON.schwarz,
  annotationFill: '#FBF3E0',
  plotBackground: MIRAGON.weiss,
  accelerator: '#00C853',
  deaccelerator: MIRAGON.danger,
} as const;

/**
 * Note color palette (bpmn.io-style mini picker; deliberately NOT a full color picker). Values are
 * hex and are rendered 1:1 as CSS color, or serialized in the DSL as `(color …)`.
 * Convention (also used in the Wardley-mapping skill): green = good, red = problem/risk,
 * amber = watch, blue = info, purple = idea, slate = neutral.
 */
export const NOTE_COLORS = [
  { id: 'green', name: 'Green · good', value: '#0B7A55' },
  { id: 'amber', name: 'Amber · watch', value: '#92610A' },
  { id: 'red', name: 'Red · problem', value: '#C92A2A' },
  { id: 'blue', name: 'Blue · info', value: '#2B50D4' },
  { id: 'teal', name: 'Teal', value: '#0E8181' },
  { id: 'purple', name: 'Purple · idea', value: '#6A3DB8' },
  { id: 'pink', name: 'Pink', value: '#C2185B' },
  { id: 'slate', name: 'Slate · neutral', value: '#4A4A4A' },
] as const;

/**
 * Colors of the attitude regions per kind (shared by renderer + palette icons). Miragon palette:
 * pioneers = blue (explore), settlers = amber (stabilise), town planners = green (industrialise).
 */
export const ATTITUDE_COLORS: Record<string, { fill: string; stroke: string }> = {
  pioneers: { fill: 'rgba(51,93,229,0.07)', stroke: '#335DE5' },
  settlers: { fill: 'rgba(146,97,10,0.10)', stroke: '#92610A' },
  townplanners: { fill: 'rgba(0,200,83,0.08)', stroke: '#00C853' },
};

export const FONT = {
  /**
   * Set as the `font-family` attribute DIRECTLY on all SVG text elements (canvas labels,
   * axis/stage text and consequently the SVG export too) – not inherited from a CSS container.
   * In EVERY context it reaches for the self-hosted 'Geist' (Miragon corporate typeface) if the
   * consumer provides it; otherwise (e.g. an export SVG opened standalone) it falls back safely to a
   * system sans. The library does NOT ship the font – consumers must self-host Geist themselves
   * (e.g. via @fontsource-variable/geist), see README.
   */
  family: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  label: 13,
  axis: 12,
  stage: 12,
} as const;
