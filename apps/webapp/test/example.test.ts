import { describe, expect, it } from 'vitest';
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';
import { EXAMPLE_MAP as EXTENSION_EXAMPLE } from '../../vscode/src/examples.js';
import { EXAMPLE_MAP } from '../src/example.js';

describe('EXAMPLE_MAP', () => {
  it('is the VS Code extension’s example: one map behind "Show example" and "Insert example"', () => {
    expect(EXAMPLE_MAP).toBe(EXTENSION_EXAMPLE);
  });

  it('reads without a finding', () => {
    expect(parseDSLWithDiagnostics(EXAMPLE_MAP).diagnostics).toEqual([]);
  });
});
