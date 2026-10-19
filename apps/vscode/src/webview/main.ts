import './zod-jitless.js';
// Geist (Miragon typeface), self-hosted variable fonts; notes and axis captions are italic, and
// the shortcut chips are Geist Mono.
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist/wght-italic.css';
import '@fontsource-variable/geist-mono/wght.css';
// The renderer brings its stylesheet (tokens, diagram-js.css, cd-canvas.css); the shell's comes
// last.
import {
  blobToBase64,
  createAxisLabelsPopover,
  createCollaborativeModeler,
  createMapSizePopover,
  createShortcutsDialog,
  isWardleyShape,
  mapMenu,
  svgToPng,
  type CollaborativeWardleyModeler,
  type LabelDeduplicatedEvent,
  type Modeler,
  type PanConstraint,
  type SvgToPngOptions,
  type WardleyReadOnly,
} from '@miragon/wardley-renderer';
import { patchDSL } from '@miragon/wardley-dsl';
import type { WardleyMap } from '@miragon/wardley-schema-model';
import '@miragon/modeler-shell/shell.css';
import type { ShellHandle } from '@miragon/modeler-shell';
import { INVALID_STATUS_DELAY_MS } from '@miragon/modeler-shell/core';
import {
  connectDiagramJs,
  shellModule,
  type DiagramJsConnection,
} from '@miragon/modeler-shell/diagram-js';
import {
  mountVsCodeShell,
  persistView,
  readShellState,
} from '@miragon/modeler-shell/vscode/webview';
import {
  isWebviewCommand,
  type ExportFormat,
  type HostToWebview,
  type WebviewCommand,
  type WebviewToHost,
} from '../protocol.js';
import { WEBVIEW_THEMES } from '../themes.js';

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare const acquireVsCodeApi: () => VsCodeApi;

interface ElementRegistryLike {
  getAll(): unknown[];
}

const MAP_NAME = 'Wardley map';

const vscode = acquireVsCodeApi();
const storedShellState = readShellState(vscode);

// The diagram first: the renderer's keyboard listens on document and must run before the shell's
// key listener, and the Modeler builds its diagram lazily on the first get(). Undo and redo keys
// stay unbound: VS Code's document history owns them (guide §13.5). The webview runs the same
// collaborative-modeler contract as every other host, so its imports are silent and keep an open
// label editor.
const collaborative = createCollaborativeModeler({
  additionalModules: [shellModule],
  keyboard: { undoRedo: false },
  freeRectInsets: () => shell.fitInsets(),
});
const modeler = collaborative.diagram as Modeler;
modeler.get('canvas');
const registry = modeler.get<ElementRegistryLike>('elementRegistry');
const panConstraint = modeler.get<PanConstraint>('panConstraint');
// The canvas lock of an invalid file: context pad, move, resize, delete, paste, label editor.
const canvasLock = modeler.get<WardleyReadOnly>('wardleyReadOnly');

const app = document.getElementById('app');
if (!app) throw new Error('The webview HTML has no #app root.');

const shell: ShellHandle = mountVsCodeShell(app, {
  themes: WEBVIEW_THEMES,
  canvas: modeler.container,
  messages: { canvas: MAP_NAME },
  menu: mapMenu({
    mapSize: () => mapSizePopover.open(),
    axisLabels: () => axisLabelsPopover.open(),
    // The web app's Export group without the map file itself: here the document is the file.
    exports: {
      png: { onSelect: () => void exportPng() },
      svg: { onSelect: () => void exportSvg() },
      transparentPng: { onSelect: () => void exportPngTransparent() },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
  }),
  problems: { onActivate: () => post({ type: 'showProblems' }) },
  emptyHint: { onInsertExample: () => post({ type: 'insertExample' }) },
});
// The modeler's own content in the shell root; it goes with the diagram.
const shortcutsDialog = createShortcutsDialog(shell);
const mapSizePopover = createMapSizePopover(shell, modeler);
const axisLabelsPopover = createAxisLabelsPopover(shell, modeler);
modeler.on('diagram.destroy', () => {
  shortcutsDialog.destroy();
  mapSizePopover.destroy();
  axisLabelsPopover.destroy();
});

// Empty means no element (guide §13.5); the plot always counts as content, so an empty map still
// fits its plot (guide §5.9). The pan constraint measures the same bounds the shell fits to.
const isEmpty = (): boolean => !registry.getAll().some(isWardleyShape);
const connection: DiagramJsConnection = connectDiagramJs(shell, modeler, {
  isEmpty,
  contentBounds: () => panConstraint.contentBounds(),
});
const { viewport } = connection;
persistView(vscode, viewport);

// ---------------------------------------------------------------------------
// Two-way sync with the document
// ---------------------------------------------------------------------------

let lastText = ''; // text last reconciled with the host
// The modeler's map lastText was written from: the modeler keeps the ids of its last import while
// a re-read of lastText derives them from the current names, so this pairs the two.
let lastMap: WardleyMap | undefined;
let initialized = false;

function post(message: WebviewToHost): void {
  vscode.postMessage(message);
}

/** Compares two DSL texts modulo line endings/trailing whitespace (= save transforms). */
function sameMapText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
}

function showValidMap(): void {
  canvasLock.setReadOnly(false);
  shell.setReadOnly(false);
  shell.setStatus(null);
}

function showInvalidMap(): void {
  // Locked at once; the marks and the status box follow after 800ms without a valid import, so
  // typing in the text editor neither flickers nor re-announces the alert (guide §13.5).
  canvasLock.setReadOnly(true);
  shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
  shell.setStatus(
    { severity: 'danger', text: shell.messages.invalidFile(MAP_NAME) },
    { delayMs: INVALID_STATUS_DELAY_MS },
  );
}

/**
 * Loads `text` into the modeler. The first import takes the stored view or fits; every later one
 * (a host undo, the text editor, Git) keeps viewbox, selection and an open label editor. An update
 * that describes the map the canvas already shows (only whitespace/EOL differ, e.g.
 * `insertFinalNewline` on save) is not re-imported at all.
 */
async function importText(text: string): Promise<void> {
  const first = !initialized;
  if (!first && (sameMapText(text, lastText) || sameMapText(text, collaborative.exportText()))) {
    lastText = text;
    showValidMap();
    return;
  }
  const keep = first ? undefined : viewport.getViewbox();
  const wasEmpty = isEmpty();
  try {
    await collaborative.importText(text);
    lastText = text;
    lastMap = modeler.exportMap();
    showValidMap();
    if (keep) viewport.restore(keep);
    else if (first && storedShellState.view) viewport.setState(storedShellState.view);
    viewport.afterImport();
    // The first elements of an empty file fit like a fresh file would ("Insert example", §13.5);
    // the plot alone already counted as content, so the shell would keep the view.
    if (!first && wasEmpty && !isEmpty() && viewport.isAutomatic()) {
      viewport.fit({ animate: false });
    }
    shell.menu.refresh();
  } catch {
    showInvalidMap();
  } finally {
    initialized = true;
  }
}

// Strictly serialized: init/update arrive as un-awaited messages, and two quick updates (several
// undos) must not import concurrently and finish in the wrong order.
let importChain: Promise<void> = Promise.resolve();
function enqueueImport(text: string): Promise<void> {
  importChain = importChain
    .then(() => importText(text))
    .catch((error: unknown) => console.error('Wardley map import failed', error));
  return importChain;
}

/**
 * Graphical change -> write it into the last known text, keeping comments, blank lines, statement
 * order and number formatting of everything the change did not touch.
 */
function pushEdit(): void {
  // Before the first import the canvas does not show the document yet; read-only: it shows the
  // last valid map. Either way an edit would overwrite text the canvas never saw.
  if (!initialized || shell.isReadOnly()) return;
  const map = modeler.exportMap();
  const text = patchDSL(lastText, map, lastMap ? { previous: lastMap } : {});
  lastMap = map;
  if (text === lastText) return;
  lastText = text;
  post({ type: 'edit', text });
}

collaborative.onContentChanged(pushEdit);
// The menu reads the map (size, labels): refresh after every change, undo and redo included.
modeler.on('commandStack.changed', () => shell.menu.refresh());
modeler.on('wardley.label.deduplicated', (event: LabelDeduplicatedEvent) => {
  post({
    type: 'info',
    message: `“${event.requested}” already exists — renamed to “${event.applied}”, because links refer to names.`,
  });
});

// ---------------------------------------------------------------------------
// Export (the webview rasterizes/serializes; the host shows the save dialog)
// ---------------------------------------------------------------------------

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The picture never shows selection or hover state (saveSVG leaves it out): the selection stays.
async function exportSvg(): Promise<void> {
  try {
    const { svg } = await modeler.saveSVG();
    post({ type: 'export', format: 'svg', data: svg });
  } catch (error) {
    post({ type: 'error', message: `Could not export the map as SVG: ${messageOf(error)}` });
  }
}

async function exportRaster(format: ExportFormat, options: SvgToPngOptions): Promise<void> {
  try {
    const { svg } = await modeler.saveSVG();
    post({ type: 'export', format, data: await blobToBase64(await svgToPng(svg, options)) });
  } catch (error) {
    post({ type: 'error', message: `Could not export the map as PNG: ${messageOf(error)}` });
  }
}

const exportPng = (): Promise<void> => exportRaster('png', {});
/** Four times the size, without the paper (slides, documents), as in the web app. */
const exportPngTransparent = (): Promise<void> =>
  exportRaster('png-transparent', { scale: 4, transparent: true });

// ---------------------------------------------------------------------------
// Messages from the extension host
// ---------------------------------------------------------------------------

const COMMANDS: Readonly<Record<WebviewCommand, () => void>> = {
  fitView: () => viewport.fit(),
  exportPng: () => void exportPng(),
  exportSvg: () => void exportSvg(),
  exportPngTransparent: () => void exportPngTransparent(),
};

function isHostMessage(data: unknown): data is HostToWebview {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { type?: unknown }).type === 'string'
  );
}

let firstImportSettled: () => void = () => undefined;
const ready = new Promise<void>((resolve) => (firstImportSettled = resolve));

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isHostMessage(event.data)) return;
  const message = event.data;
  switch (message.type) {
    case 'init':
      void enqueueImport(message.text).then(firstImportSettled);
      break;
    case 'update':
      void enqueueImport(message.text);
      break;
    case 'problems':
      shell.setProblems({ count: message.count, errors: message.errors });
      break;
    case 'command':
      // Checked against COMMANDS itself, so a name such as "constructor" never reaches
      // Object.prototype even if the protocol's list and COMMANDS drift apart.
      if (isWebviewCommand(message.name) && Object.hasOwn(COMMANDS, message.name)) {
        COMMANDS[message.name]();
      }
      break;
  }
});

post({ type: 'ready' });

/** For test pages: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeWardleyModeler;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = { shell, modeler: collaborative, connection, ready };
