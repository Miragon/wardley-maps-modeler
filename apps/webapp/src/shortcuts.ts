/**
 * The one list of keyboard shortcuts and gestures. The shortcuts dialog and the menu's key hints
 * are both generated from it, so they cannot drift apart. Key combos use `Mod` for Cmd (Apple) or
 * Ctrl (everyone else); `formatKeys` renders them per platform.
 */

export type ShortcutGroup = 'Create' | 'Edit' | 'Select' | 'History' | 'View' | 'File' | 'Map';

export interface Shortcut {
  /** Stable handle for the menu hints (`shortcutKeys('undo')`). */
  readonly id: string;
  readonly group: ShortcutGroup;
  readonly action: string;
  /** Alternatives, each a `+`-joined combo such as `Mod+Shift+Z`. Empty for pure gestures. */
  readonly keys: readonly string[];
  /** Mouse gesture, shown instead of or next to the keys. */
  readonly gesture?: string;
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  'Create',
  'Edit',
  'Select',
  'History',
  'View',
  'Map',
  'File',
];

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'component', group: 'Create', action: 'Component', keys: ['C'] },
  { id: 'user', group: 'Create', action: 'User (anchor)', keys: ['U'] },
  { id: 'note', group: 'Create', action: 'Note', keys: ['N'] },
  { id: 'pipeline', group: 'Create', action: 'Pipeline', keys: ['P'] },
  { id: 'connect', group: 'Create', action: 'Connect from the selected node', keys: ['A'] },
  { id: 'rename', group: 'Edit', action: 'Rename', keys: [], gesture: 'Double-click' },
  { id: 'save-note', group: 'Edit', action: 'Save a note while editing', keys: ['Mod+Enter'] },
  { id: 'delete', group: 'Edit', action: 'Delete', keys: ['Delete', 'Backspace'] },
  { id: 'copy', group: 'Edit', action: 'Copy', keys: ['Mod+C'] },
  { id: 'paste', group: 'Edit', action: 'Paste (click places, Esc cancels)', keys: ['Mod+V'] },
  { id: 'duplicate', group: 'Edit', action: 'Duplicate', keys: ['Mod+D'] },
  { id: 'nudge', group: 'Edit', action: 'Nudge', keys: ['ArrowKeys'] },
  { id: 'nudge-coarse', group: 'Edit', action: 'Nudge further', keys: ['Shift+ArrowKeys'] },
  { id: 'lasso', group: 'Select', action: 'Lasso', keys: ['L'], gesture: 'Shift-drag' },
  {
    id: 'add-to-selection',
    group: 'Select',
    action: 'Add to selection',
    keys: [],
    gesture: 'Shift-click',
  },
  { id: 'select-all', group: 'Select', action: 'Select all', keys: ['Mod+A'] },
  { id: 'deselect', group: 'Select', action: 'Deselect, cancel', keys: ['Escape'] },
  { id: 'undo', group: 'History', action: 'Undo', keys: ['Mod+Z'] },
  { id: 'redo', group: 'History', action: 'Redo', keys: ['Mod+Shift+Z', 'Mod+Y'] },
  { id: 'zoom-in', group: 'View', action: 'Zoom in', keys: ['Mod+Plus'] },
  { id: 'zoom-out', group: 'View', action: 'Zoom out', keys: ['Mod+Minus'] },
  { id: 'fit', group: 'View', action: 'Fit map', keys: ['Mod+0'] },
  {
    id: 'move-label',
    group: 'Map',
    action: 'Move a label',
    keys: [],
    gesture: 'Drag the label',
  },
  {
    id: 'reset-label',
    group: 'Map',
    action: 'Reset a label’s position',
    keys: [],
    gesture: 'Alt-double-click the label',
  },
  {
    id: 'resize-map',
    group: 'Map',
    action: 'Resize the map',
    keys: [],
    gesture: 'Drag its right or bottom edge or corner',
  },
  {
    id: 'resize-keep-ratio',
    group: 'Map',
    action: 'Resize, keeping the ratio',
    keys: [],
    gesture: 'Shift while dragging',
  },
  {
    id: 'resize-free',
    group: 'Map',
    action: 'Resize without snapping',
    keys: [],
    gesture: 'Alt while dragging',
  },
  {
    id: 'reset-size',
    group: 'Map',
    action: 'Reset the map size',
    keys: [],
    gesture: 'Double-click the corner',
  },
  { id: 'download', group: 'File', action: 'Download .wmap', keys: ['Mod+S'] },
  {
    id: 'paste-map',
    group: 'File',
    action: 'Import OWM text or a share link',
    keys: ['Mod+V'],
    gesture: 'Paste onto the canvas',
  },
  { id: 'apply-text', group: 'File', action: 'Apply edited text', keys: ['Mod+Enter'] },
  { id: 'shortcuts', group: 'File', action: 'Keyboard shortcuts', keys: ['?'] },
];

export function isApplePlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const APPLE_SYMBOLS: Record<string, string> = {
  Mod: '⌘',
  Shift: '⇧',
  Alt: '⌥',
  Enter: '↵',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: '⌫',
  ArrowKeys: '←↑→↓',
  Plus: '+',
  Minus: '−',
};

const OTHER_NAMES: Record<string, string> = {
  Mod: 'Ctrl',
  Escape: 'Esc',
  Delete: 'Del',
  ArrowKeys: '←↑→↓',
  Plus: '+',
  Minus: '−',
};

/** One combo for display: `Mod+Shift+Z` -> `⇧⌘Z` on Apple, `Ctrl+Shift+Z` elsewhere. */
export function formatKeys(combo: string, apple: boolean): string {
  const parts = combo.split('+');
  if (apple) {
    const modifiers = parts.slice(0, -1).map((part) => APPLE_SYMBOLS[part] ?? part);
    const key = parts.at(-1) ?? '';
    // Apple lists modifiers in a fixed order: Ctrl, Alt, Shift, Cmd.
    const order = ['⌥', '⇧', '⌘'];
    modifiers.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return modifiers.join('') + (APPLE_SYMBOLS[key] ?? key);
  }
  return parts.map((part) => OTHER_NAMES[part] ?? part).join('+');
}

/** The first key combo of a shortcut, formatted for the platform (menu hints). */
export function shortcutKeys(id: string, apple: boolean): string | undefined {
  const combo = SHORTCUTS.find((shortcut) => shortcut.id === id)?.keys[0];
  return combo ? formatKeys(combo, apple) : undefined;
}
