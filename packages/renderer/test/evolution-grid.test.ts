// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import EvolutionGrid from '../src/evolution-grid/EvolutionGrid.js';
import { clampRange } from '../src/evolution-grid/EvolutionConstraintBehavior.js';

/** Pure math tests (P7): no canvas/rendering needed. */
function grid(): EvolutionGrid {
  return new EvolutionGrid(undefined as unknown as Canvas);
}

describe('EvolutionGrid (single source of math)', () => {
  it('toCanvas: evolution -> x, visibility -> y (top = visible)', () => {
    const g = grid();
    const p0 = g.toCanvas({ visibility: 1, evolution: 0 });
    const p1 = g.toCanvas({ visibility: 0, evolution: 1 });
    expect(p1.x).toBeGreaterThan(p0.x); // evolution grows to the right
    expect(p1.y).toBeGreaterThan(p0.y); // visibility 0 is further down
  });

  it('invariant: toCanvas(fromCanvas(p)) ~= p (within the plot area)', () => {
    const g = grid();
    for (const coord of [
      { visibility: 0.43, evolution: 0.35 },
      { visibility: 0.95, evolution: 0.63 },
      { visibility: 0.1, evolution: 0.71 },
    ]) {
      const back = g.fromCanvas(g.toCanvas(coord));
      expect(back.evolution).toBeCloseTo(coord.evolution, 6);
      expect(back.visibility).toBeCloseTo(coord.visibility, 6);
    }
  });

  it('fromCanvas clamps to [0,1]', () => {
    const g = grid();
    const c = g.fromCanvas({ x: -9999, y: 9999 });
    expect(c.evolution).toBe(0);
    expect(c.visibility).toBe(0);
  });

  it('stageOf follows the (configurable) boundaries', () => {
    const g = grid();
    expect(g.stageOf(0.05)).toBe(0);
    expect(g.stageOf(0.5)).toBe(2);
    expect(g.stageOf(0.95)).toBe(3);
    g.configure({ title: 'T', stageBoundaries: [0.6, 0.7, 0.8] });
    expect(g.stageOf(0.5)).toBe(0);
  });

  it('respects config.size in toCanvas/outerBounds (export viewBox)', () => {
    const g = grid();
    g.configure({ title: 'T', size: { width: 1760, height: 720 } });
    expect(g.getPlotSize()).toEqual({ width: 1760, height: 720 });
    expect(g.outerBounds().width).toBeGreaterThan(1760);
  });
});

describe('clampRange (pipeline invariant 0 <= start < end <= 1)', () => {
  // Regression: pipeline dragged past the right plot edge -> fromCanvas clamped start AND end
  // to 1, evolutionEnd became 1.001 -> Zod schema violated -> export/share/autosave crashed.
  it('keeps the invariant when both edges are clamped to 1', () => {
    const [s, e] = clampRange(1, 1);
    expect(e).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(e);
  });

  it('keeps the invariant when both edges are clamped to 0', () => {
    const [s, e] = clampRange(0, 0);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(e);
    expect(e).toBeLessThanOrEqual(1);
  });

  it('leaves valid ranges untouched', () => {
    expect(clampRange(0.2, 0.8)).toEqual([0.2, 0.8]);
  });
});
