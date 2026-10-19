import { EXPORT_LABELS } from './menu.js';

/*
 * Every shortcut and gesture of a map for the "Keyboard shortcuts…" dialog (guide §5.4): one
 * table per group, the keys as chips like the chrome tooltip's (guide §5.6). The chrome's texts
 * and key names come in structurally (a `@miragon/modeler-shell` handle fits), so the View rows
 * say what the zoom panel's tooltips say.
 */

export type ShortcutPlatform = 'mac' | 'other';

export interface ShortcutKeyNames {
  readonly ctrl: string;
  readonly shift: string;
  readonly plus: string;
  readonly minus: string;
}

/** What the shortcuts need of the chrome around the map. */
export interface ShortcutsChrome {
  readonly platform: ShortcutPlatform;
  /** The tool's UI language, for the percentage in "Zoom to 100%". */
  readonly lang: string;
  readonly messages: {
    readonly zoomIn: string;
    readonly zoomOut: string;
    zoomToActual(percent: string): string;
    readonly fit: string;
    /** The File group's "Open…" (the shell's `messages.openFile`); default "Open…". */
    readonly openFile?: string | undefined;
    readonly keyNames: ShortcutKeyNames;
  };
}

/** Keys a web app binds itself, next to the canvas's and the chrome's. */
export interface MapShortcutOptions {
  /**
   * Cmd/Ctrl+O opens a file, Cmd/Ctrl+S exports the .wmap file and Cmd/Ctrl+V opens OWM text or a
   * share link pasted onto the canvas: a File group comes first.
   */
  readonly fileKeys?: boolean | undefined;
  /** The key that opens the dialog itself, e.g. "?", listed in the View group. */
  readonly shortcutsKey?: string | undefined;
}

export interface ShortcutRow {
  readonly action: string;
  /** Alternative keys or gestures, each shown as its own chip. */
  readonly keys: readonly string[];
}

export interface ShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

const ARROWS = '←↑→↓';

function percentOfActualSize(lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: 'percent' }).format(1);
  } catch {
    return new Intl.NumberFormat('en', { style: 'percent' }).format(1);
  }
}

/** The chips of one platform: modifier symbols on macOS, names elsewhere. */
function keysOf(platform: ShortcutPlatform, names: ShortcutKeyNames) {
  if (platform === 'mac') {
    return {
      command: (key: string) => `⌘${key}`,
      shiftCommand: (key: string) => `⌘⇧${key}`,
      shift: (what: string) => `⇧ ${what}`,
      alt: (what: string) => `⌥ ${what}`,
      zoomIn: '⌘+',
      zoomOut: '⌘−',
      zoomToActual: '⌘0',
      fit: '⇧1',
      remove: ['⌫'],
      enter: '↵',
    };
  }
  const { ctrl, shift, plus, minus } = names;
  return {
    command: (key: string) => `${ctrl}+${key}`,
    shiftCommand: (key: string) => `${ctrl}+${shift}+${key}`,
    shift: (what: string) => `${shift}+${what}`,
    alt: (what: string) => `Alt+${what}`,
    zoomIn: `${ctrl}+${plus}`,
    zoomOut: `${ctrl}+${minus}`,
    zoomToActual: `${ctrl}+0`,
    fit: `${shift}+1`,
    remove: ['Del', 'Backspace'],
    enter: 'Enter',
  };
}

function fileGroup(chrome: ShortcutsChrome, command: (key: string) => string): ShortcutGroup {
  return {
    title: 'File',
    rows: [
      { action: chrome.messages.openFile ?? 'Open…', keys: [command('O')] },
      { action: EXPORT_LABELS.wmap, keys: [command('S')] },
      { action: 'Paste OWM text or a share link', keys: [command('V')] },
    ],
  };
}

/**
 * Every shortcut of a map, grouped as guide §5.4 asks: View (the chrome's zoom keys), Edit, the
 * notation's tools and the gestures on the map itself, after the web app's File keys where it
 * binds them.
 */
export function mapShortcuts(
  chrome: ShortcutsChrome,
  options: MapShortcutOptions = {},
): ShortcutGroup[] {
  const { platform, messages } = chrome;
  const keys = keysOf(platform, messages.keyNames);
  return [
    ...(options.fileKeys ? [fileGroup(chrome, keys.command)] : []),
    {
      title: 'View',
      rows: [
        { action: messages.zoomIn, keys: [keys.zoomIn] },
        { action: messages.zoomOut, keys: [keys.zoomOut] },
        {
          action: messages.zoomToActual(percentOfActualSize(chrome.lang)),
          keys: [keys.zoomToActual],
        },
        { action: messages.fit, keys: [keys.fit] },
        ...(options.shortcutsKey
          ? [{ action: 'Keyboard shortcuts', keys: [options.shortcutsKey] }]
          : []),
      ],
    },
    {
      title: 'Edit',
      rows: [
        { action: 'Undo', keys: [keys.command('Z')] },
        {
          action: 'Redo',
          keys:
            platform === 'mac'
              ? [keys.shiftCommand('Z')]
              : [keys.shiftCommand('Z'), keys.command('Y')],
        },
        { action: 'Rename', keys: ['Double-click'] },
        { action: 'Save a note while editing', keys: [keys.command(keys.enter)] },
        { action: 'Copy', keys: [keys.command('C')] },
        { action: 'Paste (a click places it, Esc cancels)', keys: [keys.command('V')] },
        { action: 'Duplicate', keys: [keys.command('D')] },
        { action: 'Delete', keys: keys.remove },
        { action: 'Move the selection', keys: [ARROWS] },
        { action: 'Move the selection further', keys: [keys.shift(ARROWS)] },
        { action: 'Select all', keys: [keys.command('A')] },
        { action: 'Add to the selection', keys: [keys.shift('Click')] },
        { action: 'Deselect, cancel', keys: ['Esc'] },
      ],
    },
    {
      title: 'Tools',
      rows: [
        { action: 'Component', keys: ['C'] },
        { action: 'User (anchor)', keys: ['U'] },
        { action: 'Note', keys: ['N'] },
        { action: 'Pipeline', keys: ['P'] },
        { action: 'Connect from the selected node', keys: ['A'] },
        { action: 'Lasso', keys: ['L'] },
        { action: 'Lasso by dragging', keys: [keys.shift('Drag')] },
        { action: 'Draw: place a point', keys: ['Click'] },
        { action: 'Finish a drawing', keys: [keys.enter, 'Double-click'] },
        { action: 'Close a drawing', keys: ['Click the first point'] },
      ],
    },
    {
      title: 'Map',
      rows: [
        { action: 'Move a label', keys: ['Drag the label'] },
        { action: 'Reset a label’s position', keys: [keys.alt('Double-click')] },
        { action: 'Resize the map', keys: ['Drag the right or bottom edge'] },
        { action: 'Resize, keeping the ratio', keys: [keys.shift('Drag')] },
        { action: 'Resize without snapping', keys: [keys.alt('Drag')] },
        { action: 'Reset the map size', keys: ['Double-click the corner'] },
      ],
    },
  ];
}
