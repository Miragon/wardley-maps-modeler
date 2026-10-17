import { describe, expect, it } from 'vitest';
import {
  formatKeys,
  isApplePlatform,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  shortcutKeys,
} from '../src/shortcuts.js';

describe('shortcut list', () => {
  it('has unique ids and only known groups', () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const shortcut of SHORTCUTS) expect(SHORTCUT_GROUPS).toContain(shortcut.group);
  });

  it('describes every entry by keys or a gesture', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.keys.length > 0 || !!shortcut.gesture).toBe(true);
    }
  });

  it('covers the canvas tools and the map gestures', () => {
    const keys = SHORTCUTS.flatMap((shortcut) => shortcut.keys);
    for (const key of ['C', 'U', 'N', 'P', 'A', 'L', 'Escape', 'Mod+A', 'Mod+D', 'Mod+Z']) {
      expect(keys).toContain(key);
    }
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(ids).toEqual(expect.arrayContaining(['resize-map', 'reset-size', 'move-label']));
  });
});

describe('formatKeys', () => {
  it.each([
    ['Mod+Shift+Z', '⇧⌘Z', 'Ctrl+Shift+Z'],
    ['Mod+Z', '⌘Z', 'Ctrl+Z'],
    ['Mod+Enter', '⌘↵', 'Ctrl+Enter'],
    ['Mod+Plus', '⌘+', 'Ctrl++'],
    ['Escape', 'Esc', 'Esc'],
    ['?', '?', '?'],
  ])('%s -> %s (Apple) / %s (others)', (combo, apple, others) => {
    expect(formatKeys(combo, true)).toBe(apple);
    expect(formatKeys(combo, false)).toBe(others);
  });

  it('gives the menu hints from the same list', () => {
    expect(shortcutKeys('undo', true)).toBe('⌘Z');
    expect(shortcutKeys('redo', false)).toBe('Ctrl+Shift+Z');
    expect(shortcutKeys('unknown', false)).toBeUndefined();
  });

  it('detects Apple platforms', () => {
    expect(isApplePlatform('MacIntel')).toBe(true);
    expect(isApplePlatform('iPhone')).toBe(true);
    expect(isApplePlatform('Win32')).toBe(false);
    expect(isApplePlatform('Linux x86_64')).toBe(false);
  });
});
