import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PLOT_SIZE,
  MAP_SIZE_PRESETS,
  PLOT_MAX,
  PLOT_MIN,
  drawnPlotLength,
  normalizeMapSize,
  parsePlotLength,
  plotLengthMessage,
  presetIdForSize,
} from '../src/index.js';

describe('map size limits', () => {
  it('match the renderer minimum and the OWM maximum', () => {
    expect(PLOT_MIN).toEqual({ width: 480, height: 320 });
    expect(PLOT_MAX).toEqual({ width: 5000, height: 5000 });
  });

  it('keep every preset inside the limits, with unique ids', () => {
    for (const preset of MAP_SIZE_PRESETS) {
      expect(preset.width).toBeGreaterThanOrEqual(PLOT_MIN.width);
      expect(preset.height).toBeGreaterThanOrEqual(PLOT_MIN.height);
      expect(preset.width).toBeLessThanOrEqual(PLOT_MAX.width);
      expect(preset.height).toBeLessThanOrEqual(PLOT_MAX.height);
    }
    const ids = MAP_SIZE_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual(['compact', 'standard', 'large', 'wide']);
  });

  it('lists the four presets with their sizes', () => {
    expect(MAP_SIZE_PRESETS.map((p) => [p.id, p.name, p.width, p.height])).toEqual([
      ['compact', 'Compact', 720, 460],
      ['standard', 'Standard', 1080, 680],
      ['large', 'Large', 1440, 900],
      ['wide', 'Wide', 1760, 720],
    ]);
  });
});

describe('normalizeMapSize', () => {
  it('throws a RangeError on non-finite input', () => {
    expect(() => normalizeMapSize(Number.NaN, 600)).toThrow(RangeError);
    expect(() => normalizeMapSize(800, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => normalizeMapSize(Number.NEGATIVE_INFINITY, 600)).toThrow(RangeError);
  });

  it('rounds to whole pixels', () => {
    expect(normalizeMapSize(1234.6, 777.4)).toEqual({ width: 1235, height: 777 });
    expect(normalizeMapSize(1000.5, 700.5)).toEqual({ width: 1001, height: 701 });
  });

  it('clamps to the minimum and maximum', () => {
    expect(normalizeMapSize(-500, 0)).toEqual(PLOT_MIN);
    expect(normalizeMapSize(100, 50)).toEqual(PLOT_MIN);
    expect(normalizeMapSize(1e6, 1e9)).toEqual(PLOT_MAX);
    expect(normalizeMapSize(100, 9000)).toEqual({ width: 480, height: 5000 });
  });

  it('keeps an in-range integer size unchanged, including the default', () => {
    expect(normalizeMapSize(1760, 720)).toEqual({ width: 1760, height: 720 });
    expect(normalizeMapSize(DEFAULT_PLOT_SIZE.width, DEFAULT_PLOT_SIZE.height)).toEqual(
      DEFAULT_PLOT_SIZE,
    );
  });
});

describe('presetIdForSize', () => {
  it('finds the preset with exactly this size', () => {
    expect(presetIdForSize({ width: 720, height: 460 })).toBe('compact');
    expect(presetIdForSize({ width: 1440, height: 900 })).toBe('large');
    expect(presetIdForSize({ width: 1760, height: 720 })).toBe('wide');
  });

  it('treats a missing size as the default plot', () => {
    expect(presetIdForSize()).toBe('standard');
    expect(presetIdForSize(undefined)).toBe('standard');
  });

  it('returns undefined for a custom size', () => {
    expect(presetIdForSize({ width: 1234, height: 777 })).toBeUndefined();
    expect(presetIdForSize({ width: 720, height: 461 })).toBeUndefined();
  });
});

describe('parsePlotLength (typed map sizes)', () => {
  it.each([
    ['1200', 1200],
    [' 480 ', 480],
    ['5000', 5000],
  ])('accepts %j', (value, length) => {
    expect(parsePlotLength(value, 'width')).toBe(length);
  });

  it.each([[''], ['abc'], ['12.5'], ['-600'], ['479'], ['5001'], ['1e3'], ['100'], ['99999']])(
    'rejects %j instead of clamping it',
    (value) => {
      expect(parsePlotLength(value, 'width')).toBeUndefined();
    },
  );

  it('uses the limits of the axis and explains them', () => {
    expect(parsePlotLength('320', 'height')).toBe(320);
    expect(parsePlotLength('320', 'width')).toBeUndefined();
    expect(plotLengthMessage('width')).toBe('Width must be a whole number from 480 to 5000.');
  });
});

describe('drawnPlotLength (written sizes as drawn)', () => {
  it('clamps without rounding and falls back to the default plot', () => {
    expect(drawnPlotLength(1000.5, 'width')).toBe(1000.5);
    expect(drawnPlotLength(100, 'width')).toBe(PLOT_MIN.width);
    expect(drawnPlotLength(99999, 'height')).toBe(PLOT_MAX.height);
    expect(drawnPlotLength(undefined, 'width')).toBe(DEFAULT_PLOT_SIZE.width);
    expect(drawnPlotLength(Number.NaN, 'height')).toBe(DEFAULT_PLOT_SIZE.height);
  });
});
