import { describe, expect, it } from 'vitest';
import { fitViewbox } from '../src/io/fitViewbox.js';

const PLOT = { x: 0, y: 0, width: 1190, height: 776 };

describe('fitViewbox', () => {
  it('caps the scale at 100 % and centres the bounds', () => {
    expect(fitViewbox(PLOT, { width: 1440, height: 790 })).toEqual({
      x: -125,
      y: -7,
      width: 1440,
      height: 790,
    });
  });

  it('scales down to fit a smaller container', () => {
    const box = fitViewbox(PLOT, { width: 595, height: 776 })!;
    expect(box.width).toBeCloseTo(1190);
    expect(box.height).toBeCloseTo(1552);
    expect(box.x).toBeCloseTo(0);
    expect(box.y).toBeCloseTo(388 - 776);
  });

  it('centres in the free rectangle the insets leave', () => {
    const insets = { top: 88, right: 324, bottom: 64, left: 24 };
    const box = fitViewbox(PLOT, { width: 1600, height: 1000 }, insets)!;
    const scale = 1600 / box.width;
    expect(scale).toBeCloseTo(Math.min(1, (1600 - 348) / 1190, (1000 - 152) / 776));
    const freeCentre = {
      x: box.x + (24 + (1600 - 348) / 2) / scale,
      y: box.y + (88 + (1000 - 152) / 2) / scale,
    };
    expect(freeCentre.x).toBeCloseTo(595);
    expect(freeCentre.y).toBeCloseTo(388);
  });

  it('centres an axis without free room in the whole container', () => {
    const box = fitViewbox(
      PLOT,
      { width: 1440, height: 100 },
      { top: 60, right: 0, bottom: 60, left: 0 },
    )!;
    expect(box.y + box.height / 2).toBeCloseTo(388);
  });

  it('gives nothing for an unmeasured container or empty bounds', () => {
    expect(fitViewbox(PLOT, { width: 0, height: 0 })).toBeUndefined();
    expect(
      fitViewbox({ x: 0, y: 0, width: 0, height: 10 }, { width: 800, height: 600 }),
    ).toBeUndefined();
  });
});
