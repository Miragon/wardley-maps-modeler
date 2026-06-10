/** Central rendering constants (geometry, colors, typography) — "Strategic Blueprint" aesthetic. */

import { DEFAULT_PLOT_SIZE } from '@miragon/wardley-schema-model';

/** Default plot area in diagram px (interior without axis margins). Changeable at runtime via
 *  config.size. Width/height come from schema-model (single source, also used for migrations). */
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
/** Inner ring for "evolving" (intermediate-event look). */
export const COMPONENT_INNER_RADIUS = 12;
export const ANCHOR_ICON_SIZE = 26;
export const PIPELINE_HEIGHT = 30;

export const NOTE_LINE_HEIGHT = 17;
const NOTE_PAD_X = 8;
const NOTE_PAD_Y = 6;
// Rough, deliberately slightly generous character width (13px Spline Sans) — the hitbox should cover
// the text reliably (better a bit too wide than too narrow). No DOM measurement -> deterministic
// (holds for import/export/headless too).
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

export const COLORS = {
  paper: '#fbfaf7',
  ink: '#1b1b1a',
  inkSoft: '#3a3a37',
  axis: '#cdc7bb',
  axisText: '#8c8475',
  grid: '#ebe7de',
  band: 'rgba(27,27,26,0.022)',
  stroke: '#1b1b1a',
  componentFill: '#ffffff',
  anchorFill: '#1b1b1a',
  dependency: '#a9a296',
  accent: '#0e7c74',
  accentSoft: 'rgba(14,124,116,0.12)',
  flow: '#0e7c74',
  movement: '#bf2f2a',
  inertia: '#1b1b1a',
  noteText: '#4a4640',
  pipeline: '#1b1b1a',
  /** Fill of the annotation marker (also used in the palette icons). */
  annotationFill: '#fff8e6',
  /** Background of the plot area (deliberately white, lighter than paper). */
  plotBackground: '#ffffff',
} as const;

/**
 * Note color palette (bpmn.io-style mini picker; deliberately NOT a full color picker). Values are
 * hex and are rendered 1:1 as CSS color, or serialized in the DSL as `(color …)`.
 * Convention (also used in the Wardley-mapping skill): green = good, red = problem/risk,
 * amber = watch, blue = info, purple = idea, slate = neutral.
 */
export const NOTE_COLORS = [
  { id: 'green', name: 'Green · good', value: '#15803d' },
  { id: 'amber', name: 'Amber · watch', value: '#b45309' },
  { id: 'red', name: 'Red · problem', value: '#b91c1c' },
  { id: 'blue', name: 'Blue · info', value: '#1d4ed8' },
  { id: 'teal', name: 'Teal', value: '#0e7c74' },
  { id: 'purple', name: 'Purple · idea', value: '#7e22ce' },
  { id: 'pink', name: 'Pink', value: '#be185d' },
  { id: 'slate', name: 'Slate · neutral', value: '#475569' },
] as const;

/** Colors of the attitude regions per kind (shared by renderer + palette icons). */
export const ATTITUDE_COLORS: Record<string, { fill: string; stroke: string }> = {
  pioneers: { fill: 'rgba(14,124,116,0.07)', stroke: '#0e7c74' },
  settlers: { fill: 'rgba(180,131,30,0.08)', stroke: '#b4831e' },
  townplanners: { fill: 'rgba(120,53,170,0.07)', stroke: '#7835aa' },
};

export const FONT = {
  /**
   * Set as the `font-family` attribute DIRECTLY on all SVG text elements (canvas labels,
   * axis/stage text and consequently the SVG export too) – not inherited from a CSS container.
   * In EVERY context it reaches for the self-hosted 'Spline Sans Variable' if the consumer provides
   * it; otherwise (e.g. an export SVG opened standalone) it falls back safely to a system sans.
   * The library does NOT ship the font – consumers must include it themselves
   * (e.g. via @fontsource-variable/spline-sans), see README.
   */
  family:
    "'Spline Sans Variable', 'Spline Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  label: 13,
  axis: 12,
  stage: 12,
} as const;
