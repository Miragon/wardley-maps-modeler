// Geist (Miragon corporate typeface — Vercel, SIL OFL), self-hosted variable font (all weights in one
// file), no Google Fonts CDN (offline & GDPR). Geist Mono for the text panel.
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import '@miragon/wardley-renderer/assets/wardley.css';
import './style.css';
import {
  Modeler,
  iconMarkup,
  svgToPng,
  ICON_MENU,
  ICON_FOLDER_OPEN,
  ICON_VISIBILITY,
  ICON_NEW,
  ICON_UNDO,
  ICON_REDO,
  ICON_DATA_OBJECT,
  ICON_CODE,
  ICON_DOWNLOAD,
  ICON_IMAGE,
  ICON_SHARE,
  ICON_ASPECT_RATIO,
  ICON_EDIT,
  type ImportWarning,
} from '@miragon/wardley-renderer';
import { createEmptyMap, serializeMap } from '@miragon/wardley-schema-model';
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';
import {
  encodeMapCompressed,
  readHashMap,
  readShareLink,
  shareUrlForPayload,
  writeHashMap,
  writeHashPayload,
  type HashMapResult,
} from './share.js';
import { openFile, downloadBlob, downloadText } from './io.js';
import { showToast } from './toast.js';
import { copyTextWhenReady } from './clipboard.js';
import { createMapReplacer } from './replace.js';
import { trackSourceText } from './source-text.js';
import { anyDialogOpen, setupDialog } from './dialog.js';
import { setupMenu } from './menu.js';
import { currentTitle, setupTitleField } from './title-field.js';
import { setupMapSizeControl } from './map-size-control.js';
import { setupAxisDialog } from './axis-dialog.js';
import { setupTextPanel } from './text-panel.js';
import { renderShortcuts, setupIssuesDialog } from './info-dialogs.js';
import { formatKeys, isApplePlatform, shortcutKeys } from './shortcuts.js';
import {
  downloadFileName,
  importErrorMessage,
  isDefaultTitle,
  lineOfSource,
  type DownloadKind,
} from './map-file.js';

const TEA_SHOP = `title Tea Shop
component Cup of Tea [0.79, 0.61]
component Cup [0.73, 0.78]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.8]
component Water [0.38, 0.82]
component Kettle [0.43, 0.35]
component Power [0.1, 0.71] (outsource)
anchor Business [0.95, 0.63]
anchor Public [0.95, 0.78]
evolve Kettle 0.62
Business -> Cup of Tea
Public -> Cup of Tea
Cup of Tea -> Cup
Cup of Tea -> Tea
Cup of Tea -> Hot Water
Hot Water -> Water
Hot Water -> Kettle
Kettle -> Power
`;

const CORRUPT_LINK_MESSAGE =
  'This map link is incomplete or damaged. Ask the sender to share it again or to send the .wmap file.';

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} is missing`);
  return element as T;
}

const APPLE = isApplePlatform(navigator.platform || navigator.userAgent);
const container = byId('canvas');
const viewer = new Modeler({ container });
const currentDSL = trackSourceText(viewer);
Object.assign(globalThis as Record<string, unknown>, { __wardleyViewer: viewer });

// --- Default viewport after import/reload ---
// Fit the map, leaving room for the floating chrome (menu left, palette centre or on a second row
// on narrow screens, share right) and a margin on the sides/bottom, so nothing overlaps.
const VIEW_INSET = { top: 92, side: 32, bottom: 32, belowPalette: 20 };
function topInset(stageTop: number): number {
  const palette = document.querySelector('.djs-palette');
  const paletteBottom = palette ? palette.getBoundingClientRect().bottom - stageTop : 0;
  return Math.max(VIEW_INSET.top, paletteBottom + VIEW_INSET.belowPalette);
}
function fitView(): void {
  const canvas = viewer.get<{
    viewbox(box?: { x: number; y: number; width: number; height: number }): void;
  }>('canvas');
  const grid = viewer.get<{
    outerBounds(): { x: number; y: number; width: number; height: number };
  }>('evolutionGrid');
  const rect = container.getBoundingClientRect();
  const { width, height } = rect;
  if (!width || !height) return;
  const top = topInset(rect.top);
  const plot = grid.outerBounds();
  const availableWidth = Math.max(width - 2 * VIEW_INSET.side, 50);
  const availableHeight = Math.max(height - top - VIEW_INSET.bottom, 50);
  const scale = Math.min(availableWidth / plot.width, availableHeight / plot.height);
  canvas.viewbox({
    x: plot.x + plot.width / 2 - width / 2 / scale,
    y: plot.y - top / scale,
    width: width / scale,
    height: height / scale,
  });
}
viewer.on('import.done', fitView);

// --- Button / menu labels (icon + text + optional key hint from the shortcut list) ---
// Material "keyboard" glyph (Apache-2.0), same family as the renderer's chrome icons.
const ICON_KEYBOARD =
  'M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z';
function setLabel(id: string, icon: string, label: string, shortcutId?: string): void {
  const keys = shortcutId ? shortcutKeys(shortcutId, APPLE) : undefined;
  const hint = keys ? `<kbd class="menu-kbd">${keys}</kbd>` : '';
  byId(id).innerHTML = `${iconMarkup(icon, 16)}<span>${label}</span>${hint}`;
}
setLabel('btn-menu', ICON_MENU, 'Menu');
setLabel('btn-share', ICON_SHARE, 'Share');
setLabel('m-open', ICON_FOLDER_OPEN, 'Open…');
setLabel('m-save', ICON_DOWNLOAD, 'Download .wmap', 'download');
setLabel('m-save-json', ICON_DOWNLOAD, 'Download .json');
setLabel('m-example', ICON_VISIBILITY, 'Show example');
setLabel('m-new', ICON_NEW, 'New / clear');
setLabel('m-undo', ICON_UNDO, 'Undo', 'undo');
setLabel('m-redo', ICON_REDO, 'Redo', 'redo');
setLabel('m-dsl', ICON_CODE, 'View as OWM-DSL');
setLabel('m-json', ICON_DATA_OBJECT, 'View as JSON');
setLabel('m-svg', ICON_IMAGE, 'Export · SVG');
setLabel('m-png', ICON_IMAGE, 'Export · PNG (2×)');
setLabel('m-png-transparent', ICON_IMAGE, 'Export · PNG (4×, transparent)');
setLabel('m-axis', ICON_EDIT, 'X-axis labels…');
setLabel('m-shortcuts', ICON_KEYBOARD, 'Keyboard shortcuts', 'shortcuts');
byId('map-size-label').innerHTML = `${iconMarkup(ICON_ASPECT_RATIO, 16)}<span>Map size</span>`;

// Keep the legal copyright year current without a yearly manual edit.
byId('legal-year').textContent = String(new Date().getFullYear());

// --- Session state ---
const appEl = byId('app');
const emptyState = byId('empty-state');
const onboardingHint = byId('onboarding-hint');
const undoItem = byId<HTMLButtonElement>('m-undo');
const redoItem = byId<HTMLButtonElement>('m-redo');
/** Left the start screen (new, example, open, link, first edit) — it does not come back. */
let hasStarted = false;
/** The empty-map hint shows once, until the first element exists. */
let onboardingDone = false;
/** A damaged share link stays in the address bar (to copy or report) until the first real edit. */
let keepBrokenHash = false;
let wasLanding = false;

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
function isLanding(): boolean {
  return !hasStarted && isEmptyMap();
}

const titleInput = byId<HTMLInputElement>('map-title');
const titleField = setupTitleField(titleInput, viewer, isLanding);
const mapSizeControl = setupMapSizeControl(
  {
    select: byId<HTMLSelectElement>('map-size'),
    width: byId<HTMLInputElement>('map-width'),
    height: byId<HTMLInputElement>('map-height'),
    reset: byId<HTMLButtonElement>('map-size-reset'),
  },
  viewer,
);

function updateChrome(): void {
  const landing = isLanding();
  const empty = isEmptyMap();
  if (hasStarted && !empty) onboardingDone = true;
  emptyState.hidden = !landing;
  appEl.classList.toggle('app--landing', landing);
  onboardingHint.hidden = landing || !empty || onboardingDone;
  undoItem.disabled = !viewer.canUndo() && !mapReplacer.hasPendingUndo();
  redoItem.disabled = !viewer.canRedo();
  titleField.sync();
  mapSizeControl.sync();
  if (landing && !wasLanding) byId('btn-new').focus();
  wasLanding = landing;
}

// --- Replacing the map: undoable through a toast instead of a confirm() prompt ---
const mapReplacer = createMapReplacer({
  isBlank: isBlankMap,
  snapshot: () => currentDSL(),
  restore: async (snapshot) => {
    await viewer.importDSL(snapshot);
  },
  offerUndo: (undo) =>
    showToast('Map replaced', 'info', { action: { label: 'Undo', onClick: undo } }),
});

// --- URL sync: every discrete change is persisted in the hash right away ---
function syncUrl(): void {
  if (!isBlankMap()) {
    void writeHashMap(currentDSL());
  } else if (!keepBrokenHash) {
    // Empty map without custom config -> drop the hash (clean URL, an empty start stays shareable).
    history.replaceState(null, '', location.pathname + location.search);
  }
}
function onModelChanged(): void {
  updateChrome();
  syncUrl();
}
viewer.on<{ trigger?: string }>('commandStack.changed', (event) => {
  if (event.trigger !== 'clear') {
    hasStarted = true;
    keepBrokenHash = false;
    mapReplacer.withdrawUndo();
  }
  onModelChanged();
});
viewer.on('import.done', onModelChanged);
// Live previews (axis typing, plot-handle drags) are committed later as one change.
viewer.on<{ transient?: boolean }>('wardley.config.changed', (event) => {
  if (!event.transient) onModelChanged();
});
viewer.on<{ requested: string; applied: string }>('wardley.label.deduplicated', (event) => {
  showToast(`Name “${event.requested}” exists — renamed to “${event.applied}”`, 'info');
});

// --- Dialogs ---
const menuButton = byId('btn-menu');
const menu = setupMenu(menuButton, byId('menu-dropdown'));
const textPanel = setupTextPanel(
  {
    dialog: setupDialog(byId<HTMLDialogElement>('output')),
    title: byId('output-title'),
    hint: byId('output-hint'),
    text: byId<HTMLTextAreaElement>('output-text'),
    diagnostics: byId<HTMLUListElement>('output-diagnostics'),
    copy: byId<HTMLButtonElement>('output-copy'),
    download: byId<HTMLButtonElement>('output-download'),
    apply: byId<HTMLButtonElement>('output-apply'),
    close: byId<HTMLButtonElement>('output-close'),
  },
  {
    apply: (text) => importReplacing(async () => (await viewer.importDSL(text)).warnings),
    download: (text, mode) => downloadMapText(mode, text),
    applyKeys: formatKeys('Mod+Enter', APPLE),
    copyKeys: formatKeys('Mod+C', APPLE),
  },
);
const issuesDialog = setupIssuesDialog(
  setupDialog(byId<HTMLDialogElement>('issues-dialog')),
  byId<HTMLOListElement>('issues-list'),
  byId<HTMLButtonElement>('issues-close'),
  byId<HTMLButtonElement>('issues-edit'),
  (firstIssue) => {
    const text = currentDSL();
    const line =
      lineOfSource(text, firstIssue?.source) ?? parseDSLWithDiagnostics(text).diagnostics[0]?.line;
    textPanel.open('dsl', text, { returnFocusTo: menuButton, line });
  },
);
const shortcutsDialog = setupDialog(byId<HTMLDialogElement>('shortcuts-dialog'));
renderShortcuts(byId('shortcuts-body'), APPLE);
byId('shortcuts-close').addEventListener('click', () => shortcutsDialog.close());
const axisDialog = setupAxisDialog(
  {
    dialog: setupDialog(byId<HTMLDialogElement>('axis-dialog')),
    preset: byId<HTMLSelectElement>('axis-preset'),
    stages: [0, 1, 2, 3].map((index) => byId<HTMLInputElement>(`axis-s${index}`)),
    reset: byId<HTMLButtonElement>('axis-reset'),
    done: byId<HTMLButtonElement>('axis-done'),
    close: byId<HTMLButtonElement>('axis-close'),
  },
  viewer,
);

/**
 * Surface import findings: details in the console and one toast that opens the issue list. The
 * import itself always goes through (the lines are kept losslessly).
 */
function reportWarnings(warnings: readonly ImportWarning[]): void {
  for (const warning of warnings) console.warn(`[wardley-import] ${warning.message}`);
  if (!warnings.length) return;
  const count = warnings.length;
  showToast(`Imported with ${count} issue${count === 1 ? '' : 's'}`, 'warning', {
    action: { label: 'Show details', onClick: () => issuesDialog.open(warnings) },
  });
}

async function importReplacing(run: () => Promise<ImportWarning[]>): Promise<void> {
  const warnings = await mapReplacer.replace(run);
  hasStarted = true;
  keepBrokenHash = false;
  updateChrome();
  reportWarnings(warnings);
}
function showExample(): Promise<void> {
  return importReplacing(async () => (await viewer.importDSL(TEA_SHOP)).warnings);
}
function clearCanvas(): Promise<void> {
  return importReplacing(async () => (await viewer.importMap(createEmptyMap())).warnings);
}
async function load(file: File): Promise<void> {
  try {
    await importReplacing(() => openFile(file, viewer));
  } catch (error) {
    console.error('[wardley-import]', error);
    showToast(importErrorMessage(error, file.name), 'error');
  }
}
async function importLink(result: HashMapResult): Promise<void> {
  if (result.kind === 'corrupt') {
    keepBrokenHash = true;
    showToast(CORRUPT_LINK_MESSAGE, 'error');
  } else if (result.kind === 'ok' && result.dsl !== currentDSL()) {
    await importReplacing(async () => (await viewer.importDSL(result.dsl)).warnings);
  }
}

const fileInput = byId<HTMLInputElement>('file-input');
function pickFile(): void {
  fileInput.click();
}
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void load(file);
  fileInput.value = '';
});

// --- Downloads ---
function saveAs(kind: DownloadKind, save: (name: string) => void): void {
  const name = downloadFileName(currentTitle(viewer), kind);
  save(name);
  showToast(`Downloaded ${name}`, 'success');
}
function downloadMapText(mode: 'dsl' | 'json', text?: string): void {
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
    showToast('Could not export the picture. Try again or use the SVG export.', 'error');
  }
}

/** After a replacement the canvas history is empty; Undo then brings the replaced map back. */
function undo(): void {
  if (!viewer.canUndo() && mapReplacer.hasPendingUndo()) mapReplacer.undoPending();
  else viewer.undo();
}

// --- Menu items ---
menu.onItem('m-open', pickFile);
menu.onItem('m-save', () => downloadMapText('dsl'));
menu.onItem('m-save-json', () => downloadMapText('json'));
menu.onItem('m-example', () => void showExample());
menu.onItem('m-new', () => void clearCanvas());
menu.onItem('m-undo', undo);
menu.onItem('m-redo', () => viewer.redo());
menu.onItem('m-dsl', () => textPanel.open('dsl', currentDSL(), { returnFocusTo: menuButton }));
menu.onItem('m-json', () =>
  textPanel.open('json', serializeMap(viewer.exportMap()), { returnFocusTo: menuButton }),
);
menu.onItem('m-svg', () => void exportPicture('svg'));
menu.onItem('m-png', () => void exportPicture('png'));
menu.onItem('m-png-transparent', () => void exportPicture('png-transparent'));
menu.onItem('m-axis', () => axisDialog.open(menuButton));
menu.onItem('m-shortcuts', () => shortcutsDialog.open({ returnFocusTo: menuButton }));

// --- Landing (start-screen) buttons ---
/**
 * The start card disappears under the focused button. Keyboard users continue on the canvas
 * (with its focus ring); after a pointer click focus just drops to the page, where canvas
 * shortcuts work too, without a ring around the whole canvas.
 */
function moveFocusOffLanding(event: MouseEvent): void {
  const activatedByKeyboard = event.detail === 0;
  if (activatedByKeyboard) container.querySelector<SVGElement>('svg')?.focus();
  else (document.activeElement as HTMLElement | null)?.blur();
}
byId('btn-new').addEventListener('click', (event) => {
  // The canvas is already empty here — just leave the landing and reveal the working chrome.
  hasStarted = true;
  updateChrome();
  moveFocusOffLanding(event);
});
byId('btn-example').addEventListener('click', (event) => {
  void showExample().then(() => moveFocusOffLanding(event));
});

// --- Share: copy the link inside the click (Safari), show it when copying is refused ---
const shareButton = byId('btn-share');
shareButton.addEventListener('click', () => {
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
      showToast('Could not create the share link. Try again.', 'error');
      return;
    }
    if (await copied) showToast('Share link copied to clipboard', 'success');
    else textPanel.open('share', link, { returnFocusTo: shareButton });
  })();
});

// --- Zoom controls (bottom right) ---
const zoomScroll = viewer.get<{ stepZoom(delta: number): void }>('zoomScroll');
const canvasService = viewer.get<{ zoom(): number }>('canvas');
const zoomLevelButton = byId('z-level');
byId('z-in').title = `Zoom in (${formatKeys('Mod+Plus', APPLE)})`;
byId('z-out').title = `Zoom out (${formatKeys('Mod+Minus', APPLE)})`;
zoomLevelButton.title = `Fit map (${formatKeys('Mod+0', APPLE)})`;
function updateZoomLevel(): void {
  const percent = Math.round(canvasService.zoom() * 100);
  zoomLevelButton.textContent = `${percent}%`;
  zoomLevelButton.setAttribute('aria-label', `Fit map (zoom ${percent}%)`);
}
viewer.on('canvas.viewbox.changed', updateZoomLevel);
// A pointer click on the floating chrome must not take keyboard focus off the map: Delete and the
// arrow keys only act on the map while no host button is focused. Keyboard activation still works.
for (const id of ['z-in', 'z-out', 'z-level', 'btn-share']) {
  byId(id).addEventListener('mousedown', (event) => event.preventDefault());
}
byId('z-in').addEventListener('click', () => zoomScroll.stepZoom(1));
byId('z-out').addEventListener('click', () => zoomScroll.stepZoom(-1));
zoomLevelButton.addEventListener('click', fitView);

// --- App keyboard shortcuts (the canvas ones live in the renderer) ---
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable]'))
  );
}
// Capture phase: runs before the renderer's own Cmd/Ctrl+Z, which has nothing left to undo here.
window.addEventListener(
  'keydown',
  (event) => {
    const isUndo =
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === 'z';
    if (!isUndo || viewer.canUndo() || !mapReplacer.hasPendingUndo()) return;
    if (anyDialogOpen() || isEditableTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    mapReplacer.undoPending();
  },
  true,
);
window.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && key === 's' && !event.altKey) {
    // Also inside the text panel, so the browser's "Save page as" never opens.
    event.preventDefault();
    // A title or name being typed belongs in the file (and its name): commit it first. The
    // shortcut does not take focus off the inline editor the way a menu click does.
    if (document.activeElement === titleInput) titleInput.blur();
    viewer.commitPendingEdits();
    const open = textPanel.openDocument();
    downloadMapText(open?.mode ?? 'dsl', open?.text);
    return;
  }
  if (event.defaultPrevented || anyDialogOpen() || isEditableTarget(event.target)) return;
  if (mod && (key === '+' || key === '=')) {
    event.preventDefault();
    zoomScroll.stepZoom(1);
  } else if (mod && key === '-') {
    event.preventDefault();
    zoomScroll.stepZoom(-1);
  } else if (mod && key === '0') {
    event.preventDefault();
    fitView();
  } else if (event.key === '?' && !mod && !event.altKey) {
    event.preventDefault();
    menu.close();
    shortcutsDialog.open();
  }
});

// --- Paste OWM text or a share link onto the canvas ---
document.addEventListener('paste', (event) => {
  if (event.defaultPrevented || anyDialogOpen() || isEditableTarget(event.target)) return;
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (!text.trim()) return;
  if (/#mz?=/.test(text)) {
    event.preventDefault();
    void readShareLink(text).then(importLink);
    return;
  }
  if (parseDSLWithDiagnostics(text).map.elements.length === 0) return;
  event.preventDefault();
  void importReplacing(async () => (await viewer.importDSL(text)).warnings);
});

// --- Drag & drop anywhere in the window (also over the chrome, so the browser never navigates) ---
const stage = document.querySelector('.app-stage');
let dragDepth = 0;
const carriesFiles = (event: DragEvent): boolean => !!event.dataTransfer?.types.includes('Files');
window.addEventListener('dragenter', (event) => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  dragDepth++;
  if (!anyDialogOpen()) stage?.classList.add('drag-over');
});
window.addEventListener('dragover', (event) => {
  if (carriesFiles(event)) event.preventDefault();
});
window.addEventListener('dragleave', (event) => {
  if (!carriesFiles(event)) return;
  if (--dragDepth <= 0) {
    dragDepth = 0;
    stage?.classList.remove('drag-over');
  }
});
window.addEventListener('drop', (event) => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  stage?.classList.remove('drag-over');
  if (anyDialogOpen()) return;
  const files = event.dataTransfer?.files;
  const file = files?.[0];
  if (!file) return;
  void load(file).then(() => {
    if ((files?.length ?? 0) > 1) {
      showToast(`Opened “${file.name}”. Drop one map at a time.`, 'info');
    }
  });
});

// --- Startup: the map from the URL hash, otherwise an EMPTY canvas (no auto-example) ---
const initial = await readHashMap();
if (initial.kind === 'ok') {
  hasStarted = true;
  reportWarnings((await viewer.importDSL(initial.dsl)).warnings);
} else {
  keepBrokenHash = initial.kind === 'corrupt';
  await viewer.importMap(createEmptyMap());
  if (keepBrokenHash) showToast(CORRUPT_LINK_MESSAGE, 'error');
}

// A link pasted into the address bar of an open tab: adopt it (undoable like any replacement).
// writeHashMap uses history.replaceState and fires NO hashchange -> no loop.
window.addEventListener('hashchange', () => {
  void readHashMap().then(importLink);
});
