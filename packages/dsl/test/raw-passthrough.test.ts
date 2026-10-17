import { describe, expect, it } from 'vitest';
import { parseDSL, withoutRawStatements } from '../src/index.js';

describe('withoutRawStatements', () => {
  it('drops only statements, never lines inside a block comment', () => {
    const map = parseDSL(`title T
/* Notes:
   Size of market: large
*/
size [abc]
component A [0.5, 0.5]`);
    expect(map.rawPassthrough).toContain('   Size of market: large');
    expect(withoutRawStatements(map.rawPassthrough, 'size')).toEqual([
      '/* Notes:',
      '   Size of market: large',
      '*/',
    ]);
  });

  it('returns the same array when nothing matches', () => {
    const raw = ['// size [1, 2]', 'sizes 3'];
    expect(withoutRawStatements(raw, 'size')).toBe(raw);
    expect(withoutRawStatements(undefined, 'size')).toBeUndefined();
  });
});
