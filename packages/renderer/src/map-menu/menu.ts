/*
 * The map's entries of the chrome menu (guide §5.4), the same in every host. The types mirror
 * the menu groups of `@miragon/modeler-shell` structurally, so an app hands the result to the
 * shell as it is while the renderer never imports the shell.
 */

/** The icons the guide gives these entries (guide §5.14, the shell's common set). */
export type MapMenuIcon = 'file-image' | 'file-code-corner' | 'keyboard';

interface MapMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: MapMenuIcon;
  readonly keepEnabledWhenReadOnly?: boolean;
}

export interface MapMenuAction extends MapMenuItem {
  readonly kind: 'action';
  readonly shortcut?: string;
  onSelect(): void;
}

export interface MapMenuDialog extends MapMenuItem {
  readonly kind: 'dialog';
  /** The chip of a key that opens the dialog as well, e.g. "?". */
  readonly shortcut?: string;
  onSelect(): void;
}

export type MapMenuEntry = MapMenuAction | MapMenuDialog;

export interface MapMenu {
  readonly model: readonly MapMenuEntry[];
  readonly export: readonly MapMenuEntry[];
  readonly help: readonly MapMenuEntry[];
}

export interface MapExport {
  onSelect(): void;
  /** The chip of an app key that runs the same export, e.g. "⌘S". */
  readonly shortcut?: string | undefined;
}

/**
 * The exports a host offers, in the guide's order: PNG first (the more frequent target), then
 * SVG, then the variants, then further formats. Only the web app adds the map file itself, which
 * in VS Code is the document.
 */
export interface MapExports {
  readonly png: MapExport;
  readonly svg: MapExport;
  readonly transparentPng?: MapExport | undefined;
  readonly json?: MapExport | undefined;
  readonly wmap?: MapExport | undefined;
}

export interface MapMenuActions {
  /** Opens the "Map title…" dialog; without it the Model group has no title entry. */
  mapTitle?: (() => void) | undefined;
  /** Opens the "Map size…" popover. */
  mapSize(): void;
  /** Opens the "X-axis labels…" popover. */
  axisLabels(): void;
  readonly exports: MapExports;
  showKeyboardShortcuts(): void;
  /** The chip of a key the host binds to the shortcuts dialog as well, e.g. "?" in the web app. */
  readonly shortcutsKey?: string | undefined;
}

/** The labels of the export entries, also used by the hosts' commands and notifications. */
export const EXPORT_LABELS = {
  png: 'Export as PNG',
  svg: 'Export as SVG',
  transparentPng: 'Export as PNG (4×, transparent)',
  json: 'Export as JSON',
  wmap: 'Export as .wmap',
} as const;

function exportEntry(
  id: string,
  label: string,
  action: MapExport,
  icon?: MapMenuIcon,
): MapMenuAction {
  return {
    kind: 'action',
    id,
    label,
    ...(icon ? { icon } : {}),
    ...(action.shortcut ? { shortcut: action.shortcut } : {}),
    onSelect: () => action.onSelect(),
  };
}

function exportEntries(exports: MapExports): MapMenuAction[] {
  const entries = [
    exportEntry('export-png', EXPORT_LABELS.png, exports.png, 'file-image'),
    exportEntry('export-svg', EXPORT_LABELS.svg, exports.svg, 'file-code-corner'),
  ];
  if (exports.transparentPng) {
    entries.push(
      exportEntry('export-png-transparent', EXPORT_LABELS.transparentPng, exports.transparentPng),
    );
  }
  if (exports.json) entries.push(exportEntry('export-json', EXPORT_LABELS.json, exports.json));
  if (exports.wmap) entries.push(exportEntry('export-wmap', EXPORT_LABELS.wmap, exports.wmap));
  return entries;
}

/**
 * The menu groups of a map (guide §5.4): Model with the title dialog where the host offers it and
 * the two popovers (all three change the document, so a read-only canvas disables them), Export
 * with PNG first, Help with the shortcuts dialog.
 */
export function mapMenu(actions: MapMenuActions): MapMenu {
  const { mapTitle, shortcutsKey } = actions;
  const titleEntries: MapMenuEntry[] = mapTitle
    ? [{ kind: 'dialog', id: 'map-title', label: 'Map title…', onSelect: () => mapTitle() }]
    : [];
  return {
    model: [
      ...titleEntries,
      { kind: 'dialog', id: 'map-size', label: 'Map size…', onSelect: () => actions.mapSize() },
      {
        kind: 'dialog',
        id: 'x-axis-labels',
        label: 'X-axis labels…',
        onSelect: () => actions.axisLabels(),
      },
    ],
    export: exportEntries(actions.exports),
    help: [
      {
        kind: 'dialog',
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts…',
        icon: 'keyboard',
        ...(shortcutsKey ? { shortcut: shortcutsKey } : {}),
        onSelect: () => actions.showKeyboardShortcuts(),
      },
    ],
  };
}
