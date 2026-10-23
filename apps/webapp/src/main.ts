// Geist and Geist Mono (Miragon's typefaces, SIL OFL), self-hosted: no font CDN (offline, GDPR).
// Notes and axis captions are italic; the shortcut chips and the map text are Geist Mono.
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist/wght-italic.css';
import '@fontsource-variable/geist-mono/wght.css';
// The renderer's stylesheet brings the vendored tokens, diagram-js.css, the canvas mapping and the
// map's dialogs and popovers; then the web app's text dialogs; the chrome's stylesheet comes last.
import '@miragon/wardley-renderer/assets/wardley.css';
import './style.css';
import '@miragon/modeler-shell/shell.css';
import {
  createAxisLabelsPopover,
  createCollaborativeModeler,
  createMapSizePopover,
  createShortcutsDialog,
  createTitleDialog,
  isWardleyShape,
  mapMenu,
  svgToPng,
  type ImportWarning,
  type LabelDeduplicatedEvent,
  type MapMenu,
  type Modeler,
} from '@miragon/wardley-renderer';
import { createEmptyMap, serializeMap } from '@miragon/wardley-schema-model';
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';
import {
  TEXT_FIELD_SELECTOR,
  commandKeyLabel,
  defaultMessages,
  detectPlatform,
  formatNumber,
  isUndoRedoKey,
  mountShell,
  problemSummary,
} from '@miragon/modeler-shell';
import { connectDiagramJs, shellModule } from '@miragon/modeler-shell/diagram-js';
import {
  encodeMapCompressed,
  readHashMap,
  readShareLink,
  shareUrlForPayload,
  writeHashMap,
  writeHashPayload,
  type HashMapResult,
} from './share.js';
import { downloadBlob, downloadText, importMapFile, readMapFile, type MapFile } from './io.js';
import { copyTextWhenReady } from './clipboard.js';
import { createMapReplacer } from './replace.js';
import { trackSourceText } from './source-text.js';
import { createTextDialogs } from './text-dialog.js';
import { EXAMPLE_MAP } from './example.js';
import { importWarningsText, problemItems } from './problems.js';
import { THEMES } from './themes.js';
import {
  downloadFileName,
  importErrorMessage,
  isDefaultTitle,
  type DownloadKind,
} from './map-file.js';

interface DiagramElement {
  id: string;
}
interface ElementRegistryLike {
  getAll(): DiagramElement[];
}

const APP_NAME = 'Wardley Maps Modeler';
const MAP_NAME = 'Wardley map';
const REPOSITORY_URL = 'https://github.com/Miragon/wardley-maps-modeler';
/** Extensions for the file picker and the drop; the MIME types decide during a drag (guide §9). */
const MAP_FILE_TYPES = ['.wmap', '.owm', '.json', 'application/json', 'text/plain'];
const CORRUPT_LINK_MESSAGE =
  'This map link is incomplete or damaged. Ask the sender to share it again or to send the .wmap file.';

const app = document.getElementById('app');
if (!app) throw new Error('index.html has no #app root.');

// 1. The diagram first: the map's keyboard listens on document and must run before the chrome's key
//    listener, and the Modeler builds its diagram lazily on the first get(). The web app keeps the
//    canvas's own undo and redo keys. The contract's instance reports the content bounds the
//    chrome fits to.
const collaborative = createCollaborativeModeler({
  additionalModules: [shellModule],
  // Where Enter or Space on a creating palette entry places the element (guide §5.5), where the
  // import fits the plot and where panning keeps it.
  freeArea: { insets: () => shell.fitInsets() },
});
const viewer = collaborative.diagram as Modeler;
viewer.get('canvas');
const registry = viewer.get<ElementRegistryLike>('elementRegistry');
const currentDSL = trackSourceText(viewer);
Object.assign(globalThis as Record<string, unknown>, { __wardleyViewer: viewer });

const platform = detectPlatform(navigator);
const openKey = commandKeyLabel('O', platform, defaultMessages.keyNames);
const saveKey = commandKeyLabel('S', platform, defaultMessages.keyNames);
const copyKeys = commandKeyLabel('C', platform, defaultMessages.keyNames);
const applyKeys = platform === 'mac' ? '⌘↵' : `${defaultMessages.keyNames.ctrl}+Enter`;
const SHORTCUTS_KEY = '?';

/** The map's menu groups, the same as in VS Code, plus the web app's title and text views. */
function webMenu(): MapMenu {
  const map = mapMenu({
    mapTitle: () => titleDialog.open(),
    mapSize: () => mapSizePopover.open(),
    axisLabels: () => axisLabelsPopover.open(),
    exports: {
      png: { onSelect: () => void exportPicture('png') },
      svg: { onSelect: () => void exportPicture('svg') },
      transparentPng: { onSelect: () => void exportPicture('png-transparent') },
      json: { onSelect: () => exportMapText('json') },
      wmap: { onSelect: () => exportMapText('dsl'), shortcut: saveKey },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
    shortcutsKey: SHORTCUTS_KEY,
  });
  return {
    ...map,
    model: [
      ...map.model,
      {
        kind: 'dialog',
        id: 'edit-dsl',
        label: 'Edit as OWM-DSL…',
        onSelect: () => textDialogs.open('dsl', currentDSL()),
      },
      {
        kind: 'dialog',
        id: 'view-json',
        label: 'View as JSON…',
        // Reading the map changes nothing, so it stays usable on a read-only canvas.
        keepEnabledWhenReadOnly: true,
        onSelect: () => textDialogs.open('json', serializeMap(viewer.exportMap())),
      },
    ],
  };
}

// 2. The chrome around it: the whole web column of guide §5.2.
const shell = mountShell(app, {
  host: 'web',
  canvas: viewer.container,
  lang: 'en',
  platform,
  themes: THEMES,
  messages: { canvas: MAP_NAME },
  primary: { onSelect: () => share() },
  legal: { links: [{ label: 'GitHub', href: REPOSITORY_URL }] },
  file: {
    newDiagram: { onSelect: () => void newDiagram() },
    open: { onSelect: () => pickFile(), shortcut: openKey },
    showExample: { onSelect: () => void showExample() },
  },
  menu: webMenu(),
  // The findings name lines; none names an element the map still has, so no row selects one.
  problems: {},
  // A new, empty map says how to start, as the VS Code editor does for an empty file.
  emptyHint: {},
  emptyState: {
    title: APP_NAME,
    text: 'Start a new diagram, or explore the example.',
    komet: '/miragon-komet-blau.svg',
    onNewDiagram: () => void newDiagram(),
    onShowExample: () => void showExample(),
    // The same types the reject toast names (the accept list's extensions).
    dropHint: 'Or drop a .wmap, .owm, or .json file here',
  },
  dropZone: {
    accept: MAP_FILE_TYPES,
    onDrop: ([file]) => {
      if (file) void openMapFile(file);
    },
  },
});

// The map's own dialogs and popovers in the chrome's root; they go with the diagram.
const shortcutsDialog = createShortcutsDialog(shell, {
  fileKeys: true,
  shortcutsKey: SHORTCUTS_KEY,
});
const titleDialog = createTitleDialog(shell, viewer);
const mapSizePopover = createMapSizePopover(shell, viewer);
const axisLabelsPopover = createAxisLabelsPopover(shell, viewer);
const textDialogs = createTextDialogs(shell, {
  apply: (text) => replaceMap(importText(text)),
  download: (text, mode) => exportMapText(mode, text),
  applyKeys,
  copyKeys,
});
viewer.on('diagram.destroy', () => {
  shortcutsDialog.destroy();
  titleDialog.destroy();
  mapSizePopover.destroy();
  axisLabelsPopover.destroy();
  textDialogs.destroy();
});

// 3. Viewport, palette skin, keys. The shell fits to the renderer's content bounds, which always
//    hold the plot, so a new map fits its plot (guide §5.9) and they tell no empty map: empty means
//    no element.
const isEmpty = (): boolean => !registry.getAll().some(isWardleyShape);
const connection = connectDiagramJs(shell, viewer, { modeler: collaborative, isEmpty });
const { viewport } = connection;

// ---------------------------------------------------------------------------
// Documents: every new map opens like the first (guide §5.9)
// ---------------------------------------------------------------------------

/** A damaged share link stays in the address bar (to copy or report) until the first real edit. */
let keepBrokenHash = false;

type MapLoad = () => Promise<readonly ImportWarning[]>;

const importText =
  (text: string): MapLoad =>
  async () =>
    (await viewer.importDSL(text)).warnings;

function isEmptyMap(): boolean {
  const map = viewer.exportMap();
  return map.elements.length === 0 && map.edges.length === 0;
}

/** Like `isEmptyMap`, but a custom axis, size or title is also worth keeping (persistence). */
function isBlankMap(): boolean {
  const { config } = viewer.exportMap();
  return (
    isEmptyMap() &&
    !config.evolutionLabels &&
    !config.yAxisLabel &&
    !config.size &&
    isDefaultTitle(config.title)
  );
}

function currentTitle(): string {
  return viewer.exportMap().config.title ?? '';
}

/** The map's title in the tab (guide §5.4: the web app's title names the file), else the app. */
function updateDocumentTitle(): void {
  const title = currentTitle();
  document.title =
    shell.isEmptyStateShown() || isDefaultTitle(title) ? APP_NAME : `${title} · ${APP_NAME}`;
}

async function openDocument(load: MapLoad): Promise<readonly ImportWarning[]> {
  viewport.newDocument();
  let warnings: readonly ImportWarning[];
  try {
    warnings = await load();
  } finally {
    viewport.afterImport();
  }
  keepBrokenHash = false;
  shell.setEmptyState(false);
  shell.menu.refresh();
  updateDocumentTitle();
  shell.setProblems(problemSummary(problemItems(warnings)));
  return warnings;
}

/**
 * Import findings go to the problems pill and its list. A toast points at them after an import the
 * user started (open, drop, paste, example, applied text, link), never after a restore (guide §9).
 */
function reportWarnings(warnings: readonly ImportWarning[]): void {
  for (const warning of warnings) console.warn(`[wardley-import] ${warning.message}`);
  if (warnings.length === 0) return;
  const pill = shell.messages.problems(warnings.length, formatNumber(warnings.length, shell.lang));
  shell.toast({ status: 'warning', text: importWarningsText(warnings.length, pill) });
}

// Replacing the map clears the canvas history, so instead of asking first (guide §9) every
// replacement keeps the previous map as text and offers it back: "Map replaced · Undo", and
// Cmd/Ctrl+Z while the canvas has nothing else to undo.
const mapReplacer = createMapReplacer({
  isBlank: isBlankMap,
  snapshot: () => currentDSL(),
  restore: async (snapshot) => {
    await openDocument(importText(snapshot));
  },
  offerUndo: (undo) =>
    shell.toast({
      status: 'info',
      text: 'Map replaced',
      action: { label: 'Undo', onSelect: undo },
    }),
});

// The findings toast comes before the undo offer, so both stack as in the other Miragon web
// modelers.
async function replaceMap(load: MapLoad): Promise<void> {
  await mapReplacer.replace(async () => {
    const warnings = await openDocument(load);
    reportWarnings(warnings);
    return warnings;
  });
}

function newDiagram(): Promise<void> {
  return replaceMap(async () => (await viewer.importMap(createEmptyMap())).warnings);
}

function showExample(): Promise<void> {
  return replaceMap(importText(EXAMPLE_MAP));
}

function showOpenError(error: unknown, fileName: string): void {
  console.error('[wardley-import]', error);
  shell.toast({ status: 'danger', text: importErrorMessage(error, fileName) });
}

/** Reads the file before the canvas is touched, so a file that is no map keeps map and view. */
async function openMapFile(file: File): Promise<void> {
  let mapFile: MapFile;
  try {
    mapFile = await readMapFile(file);
  } catch (error) {
    showOpenError(error, file.name);
    return;
  }
  try {
    await replaceMap(() => importMapFile(mapFile, viewer));
  } catch (error) {
    showOpenError(error, file.name);
  }
}

async function importLink(result: HashMapResult): Promise<void> {
  if (result.kind === 'corrupt') {
    keepBrokenHash = true;
    shell.toast({ status: 'danger', text: CORRUPT_LINK_MESSAGE });
  } else if (result.kind === 'ok' && result.dsl !== currentDSL()) {
    await replaceMap(importText(result.dsl));
  }
}

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = MAP_FILE_TYPES.join(',');
fileInput.hidden = true;
document.body.append(fileInput);
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void openMapFile(file);
});

function pickFile(): void {
  fileInput.click();
}

// ---------------------------------------------------------------------------
// Share and export
// ---------------------------------------------------------------------------

/**
 * Copies the link inside the click (Safari keeps the gesture only there) and shows it in the
 * address bar. Where the clipboard refuses, the toast offers the link to copy by hand.
 */
function share(): void {
  const payload = encodeMapCompressed(currentDSL());
  const copied = copyTextWhenReady(payload.then(shareUrlForPayload));
  void (async () => {
    let link: string;
    try {
      const encoded = await payload;
      link = shareUrlForPayload(encoded);
      writeHashPayload(encoded);
      keepBrokenHash = false;
    } catch (error) {
      console.error('[wardley-share]', error);
      shell.toast({ status: 'danger', text: "Couldn't create the share link. Try again." });
      return;
    }
    if (await copied) {
      shell.toast({ status: 'success', text: 'Link copied' });
      return;
    }
    shell.toast({
      status: 'danger',
      text: "Couldn't copy the link.",
      action: { label: 'Show link', onSelect: () => textDialogs.open('share', link) },
    });
  })();
}

function saveAs(kind: DownloadKind, save: (name: string) => void): void {
  const name = downloadFileName(currentTitle(), kind);
  save(name);
  shell.toast({ status: 'success', text: `Exported ${name}.` });
}

function exportMapText(mode: 'dsl' | 'json', text?: string): void {
  if (mode === 'dsl') {
    saveAs('wmap', (name) => downloadText(text ?? currentDSL(), name, 'text/plain;charset=utf-8'));
  } else {
    saveAs('json', (name) =>
      downloadText(text ?? serializeMap(viewer.exportMap()), name, 'application/json'),
    );
  }
}

/** saveSVG leaves selection and hover state out, so the user's selection stays as it is. */
async function exportPicture(kind: 'svg' | 'png' | 'png-transparent'): Promise<void> {
  try {
    const { svg } = await viewer.saveSVG();
    if (kind === 'svg') {
      saveAs('svg', (name) => downloadText(svg, name, 'image/svg+xml'));
      return;
    }
    const png = await svgToPng(svg, kind === 'png' ? {} : { scale: 4, transparent: true });
    saveAs(kind, (name) => downloadBlob(png, name));
  } catch (error) {
    console.error('[wardley-export]', error);
    shell.toast({
      status: 'danger',
      text:
        kind === 'svg'
          ? "Couldn't export the map as SVG. Try again."
          : "Couldn't export the map as PNG. Try again, or export it as SVG.",
    });
  }
}

// ---------------------------------------------------------------------------
// The web app's own keys: Cmd/Ctrl+O opens a file, Cmd/Ctrl+S exports the .wmap file, "?" shows
// the shortcuts, Cmd/Ctrl+Z takes back a replaced map
// ---------------------------------------------------------------------------

function isInTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest(TEXT_FIELD_SELECTOR) !== null)
  );
}

function modalOpen(): boolean {
  return document.querySelector('dialog:modal') !== null;
}

/** A modal dialog, or a popover such as "Map size…" or the problems list. */
function anyDialogOpen(): boolean {
  return document.querySelector('dialog[open], [role="dialog"]:not([hidden])') !== null;
}

// Capture phase: runs before the canvas's own Cmd/Ctrl+Z, which has nothing left to undo here.
function onUndoReplaceKey(event: KeyboardEvent): void {
  if (!mapReplacer.hasPendingUndo() || viewer.canUndo()) return;
  if (event.shiftKey || event.altKey || event.isComposing || !isUndoRedoKey(event)) return;
  // Cmd/Ctrl+Y is redo; the typed letter decides (QWERTZ swaps the keys), as in isUndoRedoKey.
  const ascii = event.key.length === 1 && event.key.charCodeAt(0) < 0x80;
  if ((ascii ? event.key.toLowerCase() : event.code === 'KeyZ' ? 'z' : '') !== 'z') return;
  if (isInTextField(event.target) || modalOpen() || shell.isEmptyStateShown()) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) mapReplacer.undoPending();
}

function saveFromKey(): void {
  // Inside the text dialog the text shown there is saved, also before it was applied.
  const open = textDialogs.openDocument();
  if (open) {
    exportMapText(open.mode, open.text);
    return;
  }
  // The start screen has no map yet to save (guide §8: only the card and the legal line).
  if (modalOpen() || shell.isEmptyStateShown()) return;
  // A name being typed belongs in the file (and its name): the key does not take the focus off
  // the inline editor the way a menu click does.
  viewer.commitPendingEdits();
  exportMapText('dsl');
}

function onAppKey(event: KeyboardEvent): void {
  const command = event.metaKey || event.ctrlKey;
  if (command && !event.altKey && !event.shiftKey && !event.isComposing) {
    const key = event.key.toLowerCase();
    if (key === 'o' || key === 's') {
      // Never the browser's "Open file" or "Save page as" instead, also not over a dialog.
      event.preventDefault();
      if (event.repeat) return;
      if (key === 's') saveFromKey();
      else if (!modalOpen()) pickFile();
      return;
    }
  }
  if (event.key !== SHORTCUTS_KEY || command || event.altKey || event.isComposing) return;
  if (event.defaultPrevented || isInTextField(event.target) || anyDialogOpen()) return;
  if (shell.isEmptyStateShown()) return;
  event.preventDefault();
  shell.menu.close();
  shortcutsDialog.open();
}

/** OWM text or a share link pasted onto the canvas opens it (undoable like any replacement). */
function onPaste(event: ClipboardEvent): void {
  if (event.defaultPrevented || anyDialogOpen() || isInTextField(event.target)) return;
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (!text.trim()) return;
  if (/#mz?=/.test(text)) {
    event.preventDefault();
    void readShareLink(text).then(importLink);
    return;
  }
  if (parseDSLWithDiagnostics(text).map.elements.length === 0) return;
  event.preventDefault();
  void replaceMap(importText(text));
}

// ---------------------------------------------------------------------------
// The link: every change is in the URL hash, a pasted link replaces the map
// ---------------------------------------------------------------------------

function syncUrl(): void {
  if (!isBlankMap()) {
    void writeHashMap(currentDSL());
  } else if (!keepBrokenHash) {
    // An empty map without custom config drops the hash: a clean URL, an empty start stays shareable.
    history.replaceState(null, '', location.pathname + location.search);
  }
}

viewer.on<{ trigger?: string }>('commandStack.changed', (event) => {
  if (event.trigger !== 'clear') {
    // The first edit is a start as well; and an edit makes an open undo offer stale.
    shell.setEmptyState(false);
    keepBrokenHash = false;
    mapReplacer.withdrawUndo();
  }
  shell.menu.refresh();
  updateDocumentTitle();
  syncUrl();
});
viewer.on('import.done', () => {
  updateDocumentTitle();
  syncUrl();
});
// Live previews (axis labels, map size, plot-handle drags) are committed later as one change.
viewer.on<{ transient?: boolean }>('wardley.config.changed', (event) => {
  if (event.transient) return;
  updateDocumentTitle();
  syncUrl();
});
viewer.on<LabelDeduplicatedEvent>('wardley.label.deduplicated', (event) => {
  shell.toast({
    status: 'info',
    text: `“${event.requested}” already exists — renamed to “${event.applied}”, because links refer to names.`,
  });
});

/** A link pasted into the address bar: writeHashMap uses replaceState and fires no hashchange. */
function onHashChange(): void {
  void readHashMap().then(importLink);
}

window.addEventListener('keydown', onUndoReplaceKey, true);
window.addEventListener('keydown', onAppKey);
document.addEventListener('paste', onPaste);
window.addEventListener('hashchange', onHashChange);

// ---------------------------------------------------------------------------
// Start: the map from the link, else the start screen on an empty map
// ---------------------------------------------------------------------------

const initial = await readHashMap();
if (initial.kind === 'ok') {
  reportWarnings(await openDocument(importText(initial.dsl)));
} else {
  keepBrokenHash = initial.kind === 'corrupt';
  await viewer.importMap(createEmptyMap());
  viewport.afterImport();
  shell.setEmptyState(true);
  updateDocumentTitle();
  if (keepBrokenHash) shell.toast({ status: 'danger', text: CORRUPT_LINK_MESSAGE });
}

let destroyed = false;

/** For the console and the e2e suite: the app's parts and its teardown, once it started. */
const wardleyApp = {
  ready: true,
  shell,
  connection,
  destroy(): void {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener('keydown', onUndoReplaceKey, true);
    window.removeEventListener('keydown', onAppKey);
    document.removeEventListener('paste', onPaste);
    window.removeEventListener('hashchange', onHashChange);
    fileInput.remove();
    connection.destroy();
    viewer.destroy();
    shell.destroy();
  },
};
Object.assign(globalThis as Record<string, unknown>, { __wardleyApp: wardleyApp });
