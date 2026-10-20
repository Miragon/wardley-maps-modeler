import { describe, expect, it } from 'vitest';
import { WEBVIEW_THEMES } from '../../vscode/src/themes.js';
import { THEMES } from '../src/themes.js';

describe('THEMES', () => {
  it('declares the modes of the VS Code webview: one map, one look in both hosts', () => {
    expect(THEMES).toEqual(WEBVIEW_THEMES);
    expect(THEMES).toEqual(['light']);
  });
});
