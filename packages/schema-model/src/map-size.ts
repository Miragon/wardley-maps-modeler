/**
 * Map size policy (plot area in px, OWM `size [w, h]` semantics). DOM-free so the parser, the
 * renderer and the apps all clamp, round and name sizes the same way.
 */
import { DEFAULT_PLOT_SIZE } from './types.js';

export interface MapSize {
  readonly width: number;
  readonly height: number;
}

/** Smallest plot the renderer draws; smaller written sizes are drawn at this size. */
export const PLOT_MIN = { width: 480, height: 320 } as const;

/** Largest plot (OWM's own limit); larger written sizes are drawn at this size. */
export const PLOT_MAX = { width: 5000, height: 5000 } as const;

export type MapSizePresetId = 'compact' | 'standard' | 'large' | 'wide';

export interface MapSizePreset {
  readonly id: MapSizePresetId;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export const MAP_SIZE_PRESETS: readonly MapSizePreset[] = [
  { id: 'compact', name: 'Compact', width: 720, height: 460 },
  {
    id: 'standard',
    name: 'Standard',
    width: DEFAULT_PLOT_SIZE.width,
    height: DEFAULT_PLOT_SIZE.height,
  },
  { id: 'large', name: 'Large', width: 1440, height: 900 },
  { id: 'wide', name: 'Wide', width: 1760, height: 720 },
];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * The size an editor may write: whole pixels (OWM only reads integer sizes) within
 * [PLOT_MIN, PLOT_MAX]. Throws a RangeError for non-finite input so callers fail before they
 * touch any state.
 */
export function normalizeMapSize(width: number, height: number): MapSize {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new RangeError(`Map size must be finite, got ${String(width)} × ${String(height)}`);
  }
  return {
    width: clamp(Math.round(width), PLOT_MIN.width, PLOT_MAX.width),
    height: clamp(Math.round(height), PLOT_MIN.height, PLOT_MAX.height),
  };
}

/**
 * The preset with exactly this size. A missing size means the default plot, which is the
 * "standard" preset.
 */
export function presetIdForSize(size?: MapSize): MapSizePresetId | undefined {
  const { width, height } = size ?? DEFAULT_PLOT_SIZE;
  return MAP_SIZE_PRESETS.find((preset) => preset.width === width && preset.height === height)?.id;
}

/**
 * The length the renderer draws for a written `size` value: clamped to [PLOT_MIN, PLOT_MAX] but
 * not rounded (the written value stays in the config as is); a missing or non-finite value draws
 * the default plot.
 */
export function drawnPlotLength(written: number | undefined, axis: 'width' | 'height'): number {
  if (written === undefined || !Number.isFinite(written)) return DEFAULT_PLOT_SIZE[axis];
  return clamp(written, PLOT_MIN[axis], PLOT_MAX[axis]);
}

/**
 * A plot length typed by the user: whole pixels within [PLOT_MIN, PLOT_MAX] for `axis`, or
 * undefined. Unlike `normalizeMapSize` nothing is rounded or clamped, so a typo is refused instead
 * of silently changing the map.
 */
export function parsePlotLength(value: string, axis: 'width' | 'height'): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const length = Number(trimmed);
  return length >= PLOT_MIN[axis] && length <= PLOT_MAX[axis] ? length : undefined;
}

/** The message for a length `parsePlotLength` refused. */
export function plotLengthMessage(axis: 'width' | 'height'): string {
  const name = axis === 'width' ? 'Width' : 'Height';
  return `${name} must be a whole number from ${PLOT_MIN[axis]} to ${PLOT_MAX[axis]}.`;
}
