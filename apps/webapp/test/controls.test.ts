import { describe, expect, it } from 'vitest';
import { lineStartOffset } from '../src/text-panel.js';

describe('lineStartOffset (diagnostics jump to a line)', () => {
  const text = 'title A\ncomponent B [0.5, 0.5]\nB -> C';

  it('finds the start of each line', () => {
    expect(lineStartOffset(text, 1)).toBe(0);
    expect(lineStartOffset(text, 2)).toBe(8);
    expect(text.slice(lineStartOffset(text, 3))).toBe('B -> C');
  });

  it('clamps lines past the end', () => {
    expect(lineStartOffset(text, 10)).toBe(text.length);
  });
});
