import { describe, it, expect } from 'vitest';
import { mapToJSON, parseDSL, parseDSLWithDiagnostics, serializeDSL } from '../src/index.js';

const BODY = 'component Tea [0.8, 0.6]\ncomponent Water [0.3, 0.8]\nTea -> Water';

function withSize(sizeLine: string): string {
  return `title Sized\n${sizeLine}\n${BODY}`;
}

function messagesOf(text: string): string[] {
  return parseDSLWithDiagnostics(text).diagnostics.map((diagnostic) => diagnostic.message);
}

describe('size diagnostics', () => {
  it('reports nothing for an integer size within the limits', () => {
    for (const line of [
      'size [480, 320]',
      'size [1080, 680]',
      'size [1760, 720]',
      'size [5000, 5000]',
    ]) {
      expect(messagesOf(withSize(line))).toEqual([]);
    }
  });

  it('explains a size below the minimum and keeps the written value', () => {
    const text = withSize('size [100, 50]');
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(map.config.size).toEqual({ width: 100, height: 50 });
    expect(diagnostics).toEqual([
      {
        line: 2,
        message: 'Map size 100×50 is below the minimum 480×320 — drawn at 480×320',
        text: 'size [100, 50]',
      },
    ]);
  });

  it('explains a zero or negative size', () => {
    expect(messagesOf(withSize('size [0, 0]'))).toEqual([
      'Map size 0×0 is below the minimum 480×320 — drawn at 480×320',
    ]);
    expect(messagesOf(withSize('size [-100, 700]'))).toEqual([
      'Map size -100×700 is below the minimum 480×320 — drawn at 480×700',
    ]);
  });

  it('explains a size above the maximum', () => {
    expect(messagesOf(withSize('size [6000, 3000]'))).toEqual([
      'Map size 6000×3000 is above the maximum 5000×5000 — drawn at 5000×3000',
    ]);
  });

  it('explains a size that is both too narrow and too tall', () => {
    expect(messagesOf(withSize('size [100, 9000]'))).toEqual([
      'Map size 100×9000 is outside 480×320 to 5000×5000 — drawn at 480×5000',
    ]);
  });

  it('explains a size that is not in whole pixels', () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(withSize('size [1080.5, 680]'));
    expect(map.config.size).toEqual({ width: 1080.5, height: 680 });
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'Map size 1080.5×680 is not in whole pixels — OWM only reads whole-pixel sizes',
    ]);
  });

  it('reports both findings for a fractional size below the minimum', () => {
    expect(messagesOf(withSize('size [100.5, 50]'))).toEqual([
      'Map size 100.5×50 is below the minimum 480×320 — drawn at 480×320',
      'Map size 100.5×50 is not in whole pixels — OWM only reads whole-pixel sizes',
    ]);
  });
});

describe('size round-trip', () => {
  const SIZE_MATRIX = [
    'size [1080, 680]',
    'size [720, 460]',
    'size [1440, 900]',
    'size [1760, 720]',
    'size [680, 1080]',
    'size [480, 320]',
    'size [5000, 5000]',
    'size [100, 50]',
    'size [0, 0]',
    'size [-100, 200]',
    'size [6000, 3000]',
    'size [1080.5, 680.25]',
    'size [1234, 777]',
  ];

  it.each(SIZE_MATRIX)('keeps %s byte-stable and exactly as written', (line) => {
    const text = withSize(line);
    const once = serializeDSL(parseDSL(text));
    expect(once.split('\n')).toContain(line);
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
    expect(mapToJSON(parseDSL(once))).toBe(mapToJSON(parseDSL(text)));
  });

  it('writes no size line for a map without one', () => {
    const once = serializeDSL(parseDSL(`title Plain\n${BODY}`));
    expect(once).not.toMatch(/^size /m);
  });

  it('normalizes the spacing inside the brackets only', () => {
    expect(serializeDSL(parseDSL(withSize('size [ 800 ,600 ]')))).toContain('size [800, 600]');
  });
});
