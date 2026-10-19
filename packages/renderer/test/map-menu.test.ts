import { describe, expect, it } from 'vitest';
import { mapMenu, mapShortcuts, type ShortcutsChrome } from '../src/map-menu/index.js';

const noop = () => undefined;

function chrome(platform: 'mac' | 'other'): ShortcutsChrome {
  return {
    platform,
    lang: 'en',
    messages: {
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      zoomToActual: (percent) => `Zoom to ${percent}`,
      fit: 'Fit to view',
      keyNames: { ctrl: 'Ctrl', shift: 'Shift', plus: 'Plus', minus: 'Minus' },
    },
  };
}

describe('mapMenu', () => {
  const menu = mapMenu({
    mapSize: noop,
    axisLabels: noop,
    exports: {
      png: { onSelect: noop },
      svg: { onSelect: noop },
      transparentPng: { onSelect: noop },
    },
    showKeyboardShortcuts: noop,
  });

  it('puts the two popovers in the Model group, as dialog entries that change the document', () => {
    expect(menu.model.map((entry) => [entry.kind, entry.id, entry.label])).toEqual([
      ['dialog', 'map-size', 'Map size…'],
      ['dialog', 'x-axis-labels', 'X-axis labels…'],
    ]);
    for (const entry of menu.model) {
      expect(entry.keepEnabledWhenReadOnly).toBeUndefined();
      expect(entry.icon).toBeUndefined();
    }
  });

  it('exports PNG first, then SVG, then the transparent variant (guide §5.4)', () => {
    expect(menu.export.map((entry) => [entry.label, entry.icon])).toEqual([
      ['Export as PNG', 'file-image'],
      ['Export as SVG', 'file-code-corner'],
      ['Export as PNG (4×, transparent)', undefined],
    ]);
  });

  it('offers the keyboard shortcuts in the Help group', () => {
    expect(menu.help.map((entry) => [entry.kind, entry.label, entry.icon])).toEqual([
      ['dialog', 'Keyboard shortcuts…', 'keyboard'],
    ]);
    expect(menu.help[0]).not.toHaveProperty('shortcut');
  });

  it('puts "Map title…" first in the Model group where the host offers it', () => {
    let opened = 0;
    const withTitle = mapMenu({
      mapTitle: () => (opened += 1),
      mapSize: noop,
      axisLabels: noop,
      exports: { png: { onSelect: noop }, svg: { onSelect: noop } },
      showKeyboardShortcuts: noop,
    });
    expect(withTitle.model.map((entry) => [entry.kind, entry.id, entry.label])).toEqual([
      ['dialog', 'map-title', 'Map title…'],
      ['dialog', 'map-size', 'Map size…'],
      ['dialog', 'x-axis-labels', 'X-axis labels…'],
    ]);
    expect(withTitle.model[0]!.keepEnabledWhenReadOnly).toBeUndefined();
    withTitle.model[0]!.onSelect();
    expect(opened).toBe(1);
  });

  it('adds the map file and JSON to the Export group, the file with its key chip', () => {
    const web = mapMenu({
      mapSize: noop,
      axisLabels: noop,
      exports: {
        png: { onSelect: noop },
        svg: { onSelect: noop },
        transparentPng: { onSelect: noop },
        json: { onSelect: noop },
        wmap: { onSelect: noop, shortcut: '⌘S' },
      },
      showKeyboardShortcuts: noop,
    });
    expect(web.export.map((entry) => [entry.id, entry.label])).toEqual([
      ['export-png', 'Export as PNG'],
      ['export-svg', 'Export as SVG'],
      ['export-png-transparent', 'Export as PNG (4×, transparent)'],
      ['export-json', 'Export as JSON'],
      ['export-wmap', 'Export as .wmap'],
    ]);
    expect(web.export.at(-1)).toMatchObject({ kind: 'action', shortcut: '⌘S' });
  });
});

describe('mapShortcuts', () => {
  it('groups the shortcuts as View, Edit, the tools and the map', () => {
    expect(mapShortcuts(chrome('mac')).map((group) => group.title)).toEqual([
      'View',
      'Edit',
      'Tools',
      'Map',
    ]);
  });

  it('names the zoom keys as the zoom panel does: 100 % on ⌘0, fit on Shift+1', () => {
    const view = (platform: 'mac' | 'other') =>
      mapShortcuts(chrome(platform))[0]!.rows.map((row) => [row.action, ...row.keys]);
    expect(view('mac')).toEqual([
      ['Zoom in', '⌘+'],
      ['Zoom out', '⌘−'],
      ['Zoom to 100%', '⌘0'],
      ['Fit to view', '⇧1'],
    ]);
    expect(view('other')).toEqual([
      ['Zoom in', 'Ctrl+Plus'],
      ['Zoom out', 'Ctrl+Minus'],
      ['Zoom to 100%', 'Ctrl+0'],
      ['Fit to view', 'Shift+1'],
    ]);
  });

  it("leads with the web app's File keys and lists its shortcuts key where it binds them", () => {
    const groups = (platform: 'mac' | 'other') =>
      mapShortcuts(chrome(platform), { fileKeys: true, shortcutsKey: '?' });
    expect(groups('mac').map((group) => group.title)).toEqual([
      'File',
      'View',
      'Edit',
      'Tools',
      'Map',
    ]);
    expect(groups('mac')[0]!.rows).toEqual([
      { action: 'Open…', keys: ['⌘O'] },
      { action: 'Export as .wmap', keys: ['⌘S'] },
      { action: 'Paste OWM text or a share link', keys: ['⌘V'] },
    ]);
    expect(groups('other')[0]!.rows.map((row) => row.keys)).toEqual([
      ['Ctrl+O'],
      ['Ctrl+S'],
      ['Ctrl+V'],
    ]);
    expect(groups('mac')[1]!.rows.at(-1)).toEqual({ action: 'Keyboard shortcuts', keys: ['?'] });
    const localized = {
      ...chrome('other'),
      messages: { ...chrome('other').messages, openFile: 'Öffnen …' },
    };
    expect(mapShortcuts(localized, { fileKeys: true })[0]!.rows[0]!.action).toBe('Öffnen …');
  });

  it('lists the single-key tools the canvas binds', () => {
    const tools = mapShortcuts(chrome('other'))[2]!.rows;
    const single = Object.fromEntries(
      tools
        .filter((row) => row.keys.length === 1 && row.keys[0]!.length === 1)
        .map((row) => [row.keys[0], row.action]),
    );
    expect(single).toEqual({
      C: 'Component',
      U: 'User (anchor)',
      N: 'Note',
      P: 'Pipeline',
      A: 'Connect from the selected node',
      L: 'Lasso',
    });
  });
});
