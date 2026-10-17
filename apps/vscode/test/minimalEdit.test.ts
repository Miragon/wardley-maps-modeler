import { describe, it, expect } from 'vitest';
import { minimalLineEdit, splitLines } from '../src/minimalEdit.js';
import { Range } from './__mocks__/vscode';
import { applyRangeEdit } from './fakes.js';

function roundTrip(before: string, after: string) {
  const edit = minimalLineEdit(splitLines(before), after);
  if (!edit) return { edit, result: before };
  const range = new Range(edit.start.line, edit.start.character, edit.end.line, edit.end.character);
  return { edit, result: applyRangeEdit(before, range, edit.text) };
}

describe('minimalLineEdit', () => {
  it('returns null for identical text and for a line-break-only difference', () => {
    expect(minimalLineEdit(splitLines('a\nb\n'), 'a\nb\n')).toBeNull();
    expect(minimalLineEdit(splitLines('a\r\nb\r\n'), 'a\nb\n')).toBeNull();
  });

  it('touches a single line for a one-line change', () => {
    const { edit, result } = roundTrip('a\nb\nc\n', 'a\nB\nc\n');
    expect(edit).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 2, character: 0 },
      text: 'B\n',
    });
    expect(result).toBe('a\nB\nc\n');
  });

  it.each([
    ['insert in the middle', 'a\nc\n', 'a\nb\nc\n'],
    ['delete in the middle', 'a\nb\nc\n', 'a\nc\n'],
    ['append a line (trailing newline)', 'a\nb\n', 'a\nb\nc\n'],
    ['append to a file without a trailing newline', 'a\nb', 'a\nb\nc'],
    ['delete the last line (no trailing newline)', 'a\nb\nc', 'a\nb'],
    ['change the last line (no trailing newline)', 'a\nb', 'a\nB'],
    ['add a trailing newline', 'a\nb', 'a\nb\n'],
    ['remove the trailing newline', 'a\nb\n', 'a\nb'],
    ['replace everything', 'x\ny', 'p\nq\nr'],
    ['empty document', '', 'title A\n'],
    ['clear the document', 'title A\n', ''],
    ['repeated lines', 'a\na\na\n', 'a\na\n'],
  ])('%s', (_name, before, after) => {
    expect(roundTrip(before, after).result).toBe(after);
  });

  it('keeps CRLF line breaks of the document', () => {
    expect(roundTrip('a\r\nb\r\nc\r\n', 'a\nB\nc\n').result).toBe('a\r\nB\r\nc\r\n');
  });
});
