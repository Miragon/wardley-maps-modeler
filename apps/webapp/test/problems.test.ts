import { describe, expect, it } from 'vitest';
import { importWarningsText, problemItems } from '../src/problems.js';

describe('problemItems', () => {
  it('puts a parser finding’s line and source below its message', () => {
    const items = problemItems(
      [
        {
          message: 'Line 3: Unknown statement "compnent" — "compnent Typo [0.2, 0.2]"',
          line: 3,
          source: 'compnent Typo [0.2, 0.2]',
        },
        { message: 'Line 9: Link: "Nowhere" not found', line: 9 },
        { message: 'Link: "Search" not found' },
      ],
      () => true,
    );

    expect(items).toEqual([
      {
        severity: 'warning',
        message: 'Unknown statement "compnent"',
        location: 'Line 3 · compnent Typo [0.2, 0.2]',
      },
      { severity: 'warning', message: 'Link: "Nowhere" not found', location: 'Line 9' },
      { severity: 'warning', message: 'Link: "Search" not found' },
    ]);
  });

  it('keeps an element only while the map has it, so a click on the row can select it', () => {
    const items = problemItems(
      [
        { message: 'Edge dep_1: endpoint missing.', elementId: 'dep_1' },
        { message: 'Edge dep_2: endpoint missing.', elementId: 'dep_2' },
      ],
      (id) => id === 'dep_1',
    );

    expect(items.map((item) => item.elementId)).toEqual(['dep_1', undefined]);
    expect(items[1]).not.toHaveProperty('elementId');
  });
});

describe('importWarningsText', () => {
  it('counts the warnings and names the pill (guide §9)', () => {
    expect(importWarningsText(1, '1 problem')).toBe(
      'Imported with 1 warning. Details under “1 problem” bottom left.',
    );
    expect(importWarningsText(2, '2 problems')).toBe(
      'Imported with 2 warnings. Details under “2 problems” bottom left.',
    );
  });
});
