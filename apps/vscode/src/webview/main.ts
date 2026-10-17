// Geist (Miragon typeface), self-hosted variable fonts (all weights in one file each). esbuild
// inlines the woff2 as data-URLs; notes and axis captions are italic, hence the italic face too.
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist/wght-italic.css';
// Pulls the renderer CSS (incl. diagram-js.css) into the bundle.
import {
  Modeler,
  blobToBase64,
  svgToPng,
  ICON_ASPECT_RATIO,
  ICON_DOWNLOAD,
  ICON_EDIT,
  ICON_IMAGE,
  restoreEditorState,
  setAsideEditorState,
  type LabelDeduplicatedEvent,
  type SvgToPngOptions,
} from '@miragon/wardley-renderer';
import { patchDSL } from '@miragon/wardley-dsl';
import type { WardleyMap } from '@miragon/wardley-schema-model';
import './style.css';
import {
  isWebviewCommand,
  type HostToWebview,
  type WebviewCommand,
  type WebviewToHost,
} from '../protocol.js';
import { Viewport } from './viewport.js';
import { Menu } from './menu.js';
import { MapSizeControl } from './mapSize.js';
import { AxisDialog } from './axisDialog.js';
import { ProblemsIndicator, ZoomControls } from './chrome.js';

interface VsCodeApi {
  postMessage(msg: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare const acquireVsCodeApi: () => VsCodeApi;
const vscode = acquireVsCodeApi();

const app = document.getElementById('app');
const container = document.getElementById('canvas');
const toolbar = document.getElementById('toolbar');
if (!app || !container || !toolbar)
  throw new Error('Webview layout incomplete (#canvas/#toolbar).');

// VS Code owns undo/redo (the document's undo stack); the canvas leaves Cmd/Ctrl+Z/Y alone.
const modeler = new Modeler({ container, keyboard: { undoRedo: false } });
// Debug handle (like the webapp). Harmless in the sandboxed webview, helpful for diagnostics/tests.
(globalThis as Record<string, unknown>).__wardleyViewer = modeler;

// ---------------------------------------------------------------------------
// Chrome: menu (top left), zoom (bottom right), problems (bottom left)
// ---------------------------------------------------------------------------

const zoomControls = new ZoomControls(app, {
  zoomIn: () => viewport.stepZoom(1),
  zoomOut: () => viewport.stepZoom(-1),
  fit: () => viewport.fit(),
});
const viewport = new Viewport(modeler, container, (zoom) => zoomControls.show(zoom));
const problems = new ProblemsIndicator(app, () => vscode.postMessage({ type: 'showProblems' }));
const mapSize = new MapSizeControl(modeler, (message) =>
  vscode.postMessage({ type: 'error', message }),
);
const menu = new Menu(toolbar, [
  { icon: ICON_ASPECT_RATIO, label: 'Fit to view', run: () => viewport.fit() },
  'separator',
  mapSize.element,
  { icon: ICON_EDIT, label: 'X-axis labels…', run: () => axisDialog.open() },
  'separator',
  { icon: ICON_DOWNLOAD, label: 'Export · SVG', run: () => void exportSvg() },
  { icon: ICON_IMAGE, label: 'Export · PNG (2×)', run: () => void exportPng() },
  {
    icon: ICON_IMAGE,
    label: 'Export · PNG (4×, transparent)',
    run: () => void exportPng({ scale: 4, transparent: true }),
  },
]);
const axisDialog = new AxisDialog(modeler, app, () => menu.button);
menu.onOpen(() => syncMapSize());

// ---------------------------------------------------------------------------
// Two-way sync with the document
// ---------------------------------------------------------------------------

let lastText = ''; // text last reconciled with the host
// The modeler's map lastText was written from: the modeler keeps the ids of its last import while
// a re-read of lastText derives them from the current names, so this pairs the two.
let lastMap: WardleyMap | undefined;
let importing = false; // suppresses the edit echo during import
let importFailed = false; // the last import (e.g. externally typed text) was unparsable
let hasMap = false; // a map was imported (no viewport, size or editor state to keep before)

// Serialize imports STRICTLY: init/update arrive as (un-awaited) messages; without chaining, two
// quick updates (e.g. several undos) could import concurrently and finish in the wrong order.
let importChain: Promise<void> = Promise.resolve();
function enqueueImport(text: string, fit: boolean): Promise<void> {
  importChain = importChain.then(() => importText(text, fit)).catch(() => {});
  return importChain;
}

/** Compares two DSL texts modulo line endings/trailing whitespace (= save transforms). */
function sameMapText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
}

/**
 * Loads `text` into the modeler. `fit=true` (first load) fits the map; `fit=false` (external
 * change) PRESERVES the current zoom/viewport, the selection and an open inline editor: they are put
 * aside before the import and restored afterwards (typed text and caret included), as far as their
 * elements still exist. Text that
 * describes the current state (only whitespace/EOL differences, e.g. `insertFinalNewline` on save)
 * is not re-imported at all.
 */
async function importText(text: string, fit: boolean): Promise<void> {
  if (!fit && hasMap && (sameMapText(text, lastText) || sameMapText(text, modeler.exportDSL()))) {
    lastText = text;
    return;
  }
  importing = true;
  const previousView = fit || !hasMap ? undefined : viewport.current();
  // Selection and an open editor (name, link annotation, flow value, link address) survive the
  // import: an external edit, VS Code undo/redo or typing in the side editor all arrive here.
  const editorState = hasMap ? setAsideEditorState(modeler) : undefined;
  try {
    await viewport.programmatic(() => modeler.importDSL(text));
    lastText = text;
    lastMap = modeler.exportMap();
    importFailed = false;
    hasMap = true;
    viewport.activate();
    mapSize.sync();
    if (fit) viewport.fit();
    else if (previousView) viewport.restore(previousView);
    if (editorState && !fit) restoreEditorState(modeler, editorState);
  } catch (err) {
    // The canvas keeps showing the last good map. Block pushEdit so a graphical action doesn't
    // overwrite the (just externally typed) text — until a successful re-import.
    importFailed = true;
    vscode.postMessage({
      type: 'error',
      message: `Could not parse this Wardley map: ${(err as Error).message}`,
    });
  } finally {
    importing = false;
  }
}

/**
 * Graphical change -> write it into the last known text, keeping comments, blank lines, statement
 * order and number formatting of everything the change did not touch.
 */
function pushEdit(): void {
  if (importing || importFailed) return;
  const map = modeler.exportMap();
  const text = patchDSL(lastText, map, lastMap ? { previous: lastMap } : {});
  lastMap = map;
  if (text === lastText) return;
  lastText = text;
  vscode.postMessage({ type: 'edit', text });
}

function syncMapSize(): void {
  if (hasMap) mapSize.sync();
}

modeler.on('commandStack.changed', () => {
  pushEdit();
  syncMapSize();
});
modeler.on('wardley.config.changed', (event: { transient?: boolean }) => {
  if (!event.transient) syncMapSize();
});
modeler.on('wardley.label.deduplicated', (event: LabelDeduplicatedEvent) => {
  vscode.postMessage({
    type: 'info',
    message: `“${event.requested}” already exists — renamed to “${event.applied}”, because links refer to names.`,
  });
});

window.addEventListener('message', (event: MessageEvent<HostToWebview>) => {
  const msg = event.data;
  if (msg.type === 'init') void enqueueImport(msg.text, true);
  else if (msg.type === 'update') void enqueueImport(msg.text, false);
  else if (msg.type === 'command' && isWebviewCommand(msg.name)) runCommand(msg.name);
  else if (msg.type === 'diagnostics') problems.show(msg.count);
});

function runCommand(name: WebviewCommand): void {
  if (name === 'fitView') viewport.fit();
  else if (name === 'exportSvg') void exportSvg();
  else if (name === 'exportPng') void exportPng();
  else if (name === 'exportPngTransparent') void exportPng({ scale: 4, transparent: true });
}

// ---------------------------------------------------------------------------
// Keys VS Code would otherwise take: its webview host forwards every keydown that reaches `window`
// to the workbench, so these listeners sit on `document` and stop propagation there.
// ---------------------------------------------------------------------------

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea') !== null)
  );
}

document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if (isTextEntry(e.target)) {
    // Native undo inside a text field instead of undoing the last map change in the document.
    if (key === 'z' || key === 'y') e.stopPropagation();
    return;
  }
  // Canvas zoom instead of zooming the whole VS Code window.
  if (key === '=' || key === '+') viewport.stepZoom(1);
  else if (key === '-') viewport.stepZoom(-1);
  else if (key === '0') viewport.fit();
  else return;
  e.preventDefault();
  e.stopPropagation();
});

// ---------------------------------------------------------------------------
// Export (the webview rasterizes/serializes; the host shows the save dialog)
// ---------------------------------------------------------------------------

// The picture never shows selection or hover state (saveSVG leaves it out): the selection stays.
async function exportSvg(): Promise<void> {
  try {
    const { svg } = await modeler.saveSVG();
    vscode.postMessage({ type: 'export', format: 'svg', data: svg });
  } catch (err) {
    vscode.postMessage({ type: 'error', message: `SVG export failed: ${(err as Error).message}` });
  }
}

async function exportPng(options: SvgToPngOptions = {}): Promise<void> {
  try {
    const { svg } = await modeler.saveSVG();
    const blob = await svgToPng(svg, options);
    vscode.postMessage({ type: 'export', format: 'png', data: await blobToBase64(blob) });
  } catch (err) {
    vscode.postMessage({ type: 'error', message: `PNG export failed: ${(err as Error).message}` });
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

vscode.postMessage({ type: 'ready' });
