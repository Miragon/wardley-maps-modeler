// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import EvolutionGrid from '../src/evolution-grid/EvolutionGrid.js';
import { sizeForDrag, sizeLabel } from '../src/map-resize/MapResizeHandles.js';
import { configWithSize, withoutRawSizeStatements } from '../src/map-resize/MapProjection.js';

const START = { width: 1080, height: 680 };

describe('EvolutionGrid.configure size limits', () => {
  const grid = () => new EvolutionGrid(undefined as unknown as Canvas);

  it('falls back to the default plot for non-finite sizes', () => {
    const g = grid();
    g.configure({ title: 'T', size: { width: Number.NaN, height: Number.POSITIVE_INFINITY } });
    expect(g.getPlotSize()).toEqual({ width: 1080, height: 680 });
  });

  it('clamps to PLOT_MIN and PLOT_MAX', () => {
    const g = grid();
    g.configure({ title: 'T', size: { width: -100, height: 9000 } });
    expect(g.getPlotSize()).toEqual({ width: 480, height: 5000 });
  });

  it('keeps an in-range size as written', () => {
    const g = grid();
    g.configure({ title: 'T', size: { width: 1234.5, height: 777 } });
    expect(g.getPlotSize()).toEqual({ width: 1234.5, height: 777 });
  });
});

describe('sizeForDrag', () => {
  it('moves only the dragged edge', () => {
    expect(sizeForDrag(START, 'x', 203, 57)).toEqual({ width: 1280, height: 680 });
    expect(sizeForDrag(START, 'y', 203, 57)).toEqual({ width: 1080, height: 740 });
  });

  it('snaps to 10px steps', () => {
    expect(sizeForDrag(START, 'xy', 123, -44)).toEqual({ width: 1200, height: 640 });
  });

  it('snaps magnetically to a preset within 12px', () => {
    expect(sizeForDrag(START, 'xy', 355, 211)).toEqual({ width: 1440, height: 900 });
    expect(sizeForDrag(START, 'xy', 691, 47)).toEqual({ width: 1760, height: 720 });
  });

  it('keeps the start aspect ratio with Shift', () => {
    const size = sizeForDrag(START, 'xy', 540, 3, {
      keepAspectRatio: true,
      disableSnapping: false,
    });
    expect(size).toEqual({ width: 1620, height: 1020 });
    const fromEdge = sizeForDrag(START, 'y', 0, 340, {
      keepAspectRatio: true,
      disableSnapping: false,
    });
    expect(fromEdge).toEqual({ width: 1620, height: 1020 });
  });

  it('gives whole pixels without snapping when Alt is held', () => {
    expect(
      sizeForDrag(START, 'xy', 3.4, 7.6, { keepAspectRatio: false, disableSnapping: true }),
    ).toEqual({ width: 1083, height: 688 });
  });

  it('clamps to the minimum and the maximum', () => {
    expect(sizeForDrag(START, 'xy', -5000, -5000)).toEqual({ width: 480, height: 320 });
    expect(sizeForDrag(START, 'xy', 99999, 99999)).toEqual({ width: 5000, height: 5000 });
  });
});

describe('sizeLabel', () => {
  it('names a preset size', () => {
    expect(sizeLabel({ width: 1440, height: 900 })).toBe('1440 × 900 · Large');
  });

  it('shows only the numbers for a custom size', () => {
    expect(sizeLabel({ width: 1234, height: 777 })).toBe('1234 × 777');
  });
});

describe('size config helpers', () => {
  it('sets or removes config.size without touching other fields', () => {
    const config = { title: 'T', style: 'dark' as const, size: { width: 720, height: 460 } };
    expect(configWithSize(config, { width: 1440, height: 900 })).toEqual({
      title: 'T',
      style: 'dark',
      size: { width: 1440, height: 900 },
    });
    expect(configWithSize(config, undefined)).toEqual({ title: 'T', style: 'dark' });
  });

  it('drops raw size statements only by their keyword', () => {
    const drops = (line: string) => withoutRawSizeStatements([line, 'keep'])?.length === 1;
    expect(drops('size [1e3, 5e2]')).toBe(true);
    expect(drops('  Size [800 600]')).toBe(true);
    expect(drops('size')).toBe(true);
    expect(drops('sizes [1, 2]')).toBe(false);
    expect(drops('size-x [1, 2]')).toBe(false);
    expect(drops('sizeä [1, 2]')).toBe(false);
    expect(drops('// size [1, 2]')).toBe(false);
    expect(drops('component size [0.5, 0.5]')).toBe(false);
  });

  it('keeps block comment lines that start with "size"', () => {
    const raw = ['/* Context:', '   Size of market: large', 'size: x', '*/', 'size [1e3, 5e2]'];
    expect(withoutRawSizeStatements(raw)).toEqual([
      '/* Context:',
      '   Size of market: large',
      'size: x',
      '*/',
    ]);
  });

  it('keeps the comment of a dropped size statement', () => {
    expect(withoutRawSizeStatements(['size [x] /* opens', 'still comment */'])).toEqual([
      '/* opens',
      'still comment */',
    ]);
    expect(withoutRawSizeStatements(['size [x]'])).toBeUndefined();
  });
});
