import { describe, expect, it } from 'vitest';
import { ICON_EDIT, iconMarkup, struckIconMarkup } from '../src/draw/icons.js';

describe('icon markup', () => {
  it('renders a known path unchanged', () => {
    expect(iconMarkup(ICON_EDIT, 16)).toContain(`<path d="${ICON_EDIT}"/>`);
  });

  it('escapes a path that would break out of its attribute', () => {
    const hostile = '"/><img src=x onerror=alert(1)><path d="';
    for (const markup of [iconMarkup(hostile), struckIconMarkup(hostile)]) {
      expect(markup).not.toContain('<img');
      expect(markup).toContain('&quot;/&gt;&lt;img');
    }
  });
});
