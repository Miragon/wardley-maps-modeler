// Geist (Miragon corporate typeface — Vercel, SIL OFL), self-hosted variable font (all weights in one
// file), no Google Fonts CDN (offline & GDPR). Geist Mono for the export/code textarea.
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import '@miragon/wardley-renderer/assets/wardley.css';
import './style.css';
import {
  Modeler,
  iconMarkup,
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
} from '@miragon/wardley-renderer';
import {
  createEmptyMap,
  EVOLUTION_PRESETS,
  DEFAULT_EVOLUTION_LABELS,
} from '@miragon/wardley-schema-model';
import { readHashMap, writeHashMap, shareUrl } from './share.js';
import { openFile, svgToPng, downloadBlob, downloadText } from './io.js';
import { showToast } from './toast.js';

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
Kettle -> Power`;

const container = document.getElementById('canvas');
if (!container) throw new Error('#canvas fehlt');

const viewer = new Modeler({ container });
Object.assign(globalThis as Record<string, unknown>, {
  __wardleyViewer: viewer,
  __wardleyIo: { openFile, svgToPng },
});

// --- Default viewport after import/reload ---
// Fit the map, but leave room at the top for the floating chrome (palette center, menu left, share
// right) and some margin on the sides/bottom -> nothing overlaps.
const VIEW_INSET = { top: 92, side: 32, bottom: 32 };
function fitView(): void {
  if (!container) return;
  const canvas = viewer.get('canvas') as {
    viewbox(box?: { x: number; y: number; width: number; height: number }): void;
  };
  const grid = viewer.get('evolutionGrid') as {
    outerBounds(): { x: number; y: number; width: number; height: number };
  };
  const rect = container.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  if (!W || !H) return;
  const p = grid.outerBounds();
  const availW = Math.max(W - 2 * VIEW_INSET.side, 50);
  const availH = Math.max(H - VIEW_INSET.top - VIEW_INSET.bottom, 50);
  const s = Math.min(availW / p.width, availH / p.height);
  canvas.viewbox({
    x: p.x + p.width / 2 - W / 2 / s,
    y: p.y - VIEW_INSET.top / s, // top edge below the chrome
    width: W / s,
    height: H / s,
  });
}
viewer.on('import.done', fitView);

// --- Button / menu icons ---
function setLabel(id: string, icon: string, label: string): void {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `${iconMarkup(icon, 16)}<span>${label}</span>`;
}
setLabel('btn-menu', ICON_MENU, 'Menu');
setLabel('btn-share', ICON_SHARE, 'Share');
setLabel('m-open', ICON_FOLDER_OPEN, 'Open…');
setLabel('m-example', ICON_VISIBILITY, 'Show example');
setLabel('m-new', ICON_NEW, 'New / clear');
setLabel('m-undo', ICON_UNDO, 'Undo');
setLabel('m-redo', ICON_REDO, 'Redo');
setLabel('m-json', ICON_DATA_OBJECT, 'Export · JSON');
setLabel('m-dsl', ICON_CODE, 'Export · OWM-DSL');
setLabel('m-svg', ICON_DOWNLOAD, 'Export · SVG');
setLabel('m-png', ICON_IMAGE, 'Export · PNG (2×)');
setLabel('m-png-transparent', ICON_IMAGE, 'Export · PNG (4×, transparent)');
setLabel('m-axis', ICON_EDIT, 'X-axis labels…');
const sizeField = document.querySelector('.menu-field span');
if (sizeField) sizeField.innerHTML = `${iconMarkup(ICON_ASPECT_RATIO, 16)}<span>Map size</span>`;

// Keep the legal copyright year current without a yearly manual edit.
const legalYear = document.getElementById('legal-year');
if (legalYear) legalYear.textContent = String(new Date().getFullYear());

// --- Hamburger menu (Excalidraw style): open/close ---
const menuBtn = document.getElementById('btn-menu');
const dropdown = document.getElementById('menu-dropdown');
function setMenuOpen(open: boolean): void {
  if (!dropdown || !menuBtn) return;
  dropdown.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
}
menuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  setMenuOpen(dropdown?.hidden === true);
});
document.addEventListener('click', (e) => {
  if (!(e.target as Element | null)?.closest('.app-menu')) setMenuOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenuOpen(false);
});
function onMenu(id: string, action: () => void): void {
  document.getElementById(id)?.addEventListener('click', () => {
    setMenuOpen(false);
    action();
  });
}

/*
 * Landing / empty state + URL sync (central: what happens when the model changes).
 * The "landing" is the start screen (empty map, user hasn't started yet): it shows only the start
 * card and hides the working chrome (palette, menu, share, zoom). Picking "New diagram" or "Show
 * example" — or loading any map — leaves it for good this session.
 */
const emptyState = document.getElementById('empty-state');
const appEl = document.getElementById('app');
let hasStarted = false;
function updateLanding(): void {
  const landing = !hasStarted && isEmptyMap();
  if (emptyState) emptyState.hidden = !landing;
  appEl?.classList.toggle('app--landing', landing);
}
function isEmptyMap(): boolean {
  const map = viewer.exportMap();
  return map.elements.length === 0 && map.edges.length === 0;
}
/** Like `isEmptyMap`, but also counts a customized axis config as "worth keeping" (persistence). */
function isBlankMap(): boolean {
  const map = viewer.exportMap();
  return isEmptyMap() && !map.config.evolutionLabels && !map.config.yAxisLabel;
}
let urlTimer: ReturnType<typeof setTimeout> | undefined;
function syncUrlNow(): void {
  clearTimeout(urlTimer);
  urlTimer = undefined;
  // Empty map without custom config -> drop the hash (clean URL, an empty start stays shareable).
  if (isBlankMap()) history.replaceState(null, '', location.pathname + location.search);
  else void writeHashMap(viewer.exportDSL());
}
/**
 * Toggle the empty state + sync the URL. Discrete edit actions (draw, connect, move, delete) are
 * persisted IMMEDIATELY — otherwise a change just made (e.g. a freshly drawn arrow) is lost on a
 * very fast reload. Only axis live-typing (`wardley.config.changed`, one event per keystroke) is
 * debounced.
 */
function onModelChanged(debounce = false): void {
  updateLanding();
  clearTimeout(urlTimer);
  if (debounce) urlTimer = setTimeout(syncUrlNow, 350);
  else syncUrlNow();
}
viewer.on('commandStack.changed', () => onModelChanged());
viewer.on('import.done', () => onModelChanged());
viewer.on('wardley.config.changed', () => onModelChanged(true));
// Belt-and-suspenders: flush a pending (debounced) axis sync before leaving the page.
const flushUrl = (): void => {
  if (urlTimer !== undefined) syncUrlNow();
};
window.addEventListener('beforeunload', flushUrl);
window.addEventListener('pagehide', flushUrl);

/**
 * Surface parser/import findings: console detail + a single non-blocking info toast (import
 *  proceeds regardless). Silent-until-now warnings become visible without a modal.
 */
function logWarnings(warnings: ReadonlyArray<{ message: string }>): void {
  for (const w of warnings) console.warn(`[wardley-import] ${w.message}`);
  if (warnings.length) {
    showToast(`Imported with ${warnings.length} warning(s) — see console`, 'info');
  }
}

// --- Actions ---
function showExample(): void {
  void viewer.importDSL(TEA_SHOP).then(({ warnings }) => logWarnings(warnings));
}
function clearCanvas(): void {
  void viewer.importMap(createEmptyMap('New map'));
}
function deselect(): void {
  (viewer.get('selection') as { select: (e: unknown) => void }).select(null);
}

const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
function pickFile(): void {
  fileInput?.click();
}
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void load(file);
  fileInput.value = '';
});
async function load(file: File): Promise<void> {
  // Opening a file replaces the current map — ask first (same protection as "New / clear").
  if (!isEmptyMap() && !confirm(`Replace the current map with "${file.name}"?`)) return;
  try {
    logWarnings(await openFile(file, viewer));
  } catch (err) {
    showToast(`Could not open file: ${(err as Error).message}`, 'error');
  }
}

// --- JSON/DSL export panel ---
const overlay = document.getElementById('output');
const outTitle = document.getElementById('output-title');
const outText = document.getElementById('output-text') as HTMLTextAreaElement | null;
function openOutput(title: string, text: string): void {
  if (!overlay || !outTitle || !outText) return;
  outTitle.textContent = title;
  outText.value = text;
  overlay.hidden = false;
  outText.focus();
  outText.select();
}
function exportSvg(): void {
  deselect();
  void viewer.saveSVG().then(({ svg }) => {
    downloadText(svg, 'wardley-map.svg', 'image/svg+xml');
  });
}
function exportPng(options: { scale?: number; transparent?: boolean } = {}): void {
  deselect();
  void viewer.saveSVG().then(async ({ svg }) => {
    downloadBlob(await svgToPng(svg, options), 'wardley-map.png');
  });
}

// --- Wire up menu items ---
onMenu('m-open', pickFile);
onMenu('m-example', showExample);
onMenu('m-new', () => {
  if (isEmptyMap() || confirm('Discard the current map and start an empty one?')) clearCanvas();
});
onMenu('m-undo', () => viewer.undo());
onMenu('m-redo', () => viewer.redo());
onMenu('m-json', () => openOutput('Export · JSON', JSON.stringify(viewer.exportMap(), null, 2)));
onMenu('m-dsl', () => openOutput('Export · OWM-DSL', viewer.exportDSL()));
onMenu('m-svg', exportSvg);
onMenu('m-png', () => exportPng());
onMenu('m-png-transparent', () => exportPng({ scale: 4, transparent: true }));
document.getElementById('map-size')?.addEventListener('change', (e) => {
  const [w, h] = (e.target as HTMLSelectElement).value.split('x').map(Number);
  if (w && h) void viewer.setMapSize(w, h);
  setMenuOpen(false);
});

// --- X-axis labels (pick a preset OR label individual stages freely) ---
const CUSTOM_PRESET = 'custom';
const axisOverlay = document.getElementById('axis-overlay');
const axisPreset = document.getElementById('axis-preset') as HTMLSelectElement | null;
const axisInputs = [0, 1, 2, 3].map(
  (i) => document.getElementById(`axis-s${i}`) as HTMLInputElement | null,
);

// Preset options from the single source of truth (@miragon/wardley-schema-model) + a free "Custom" choice.
if (axisPreset) {
  for (const p of EVOLUTION_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.labels.join(' · ')}`;
    axisPreset.append(opt);
  }
  const custom = document.createElement('option');
  custom.value = CUSTOM_PRESET;
  custom.textContent = 'Custom…';
  axisPreset.append(custom);
}

function currentAxisLabels(): readonly string[] {
  return viewer.exportMap().config.evolutionLabels ?? DEFAULT_EVOLUTION_LABELS;
}
/** id of the preset whose labels exactly match `labels`, otherwise "custom". */
function presetIdFor(labels: readonly string[]): string {
  return (
    EVOLUTION_PRESETS.find((p) => p.labels.every((v, i) => v === labels[i]))?.id ?? CUSTOM_PRESET
  );
}
function fillAxisInputs(labels: readonly string[]): void {
  axisInputs.forEach((el, i) => {
    if (el) el.value = labels[i] ?? '';
  });
}
/**
 * Inputs -> map. Empty/whitespace stages fall back to the default for that position (an empty axis
 * label is neither meaningful nor representable in the `->`-separated DSL; this also covers clearing
 * a field mid-typing). A literal `->` would inject the DSL separator -> replace it with a real
 * arrow. This keeps the round-trip lossless. Default set => remove labels (clean DSL/URL).
 */
function applyAxisLabels(): void {
  const labels = axisInputs.map((el, i) => {
    const v = (el?.value ?? '').replace(/->/g, '→').trim();
    return v || DEFAULT_EVOLUTION_LABELS[i]!;
  }) as [string, string, string, string];
  const isDefault = DEFAULT_EVOLUTION_LABELS.every((v, i) => v === labels[i]);
  viewer.setEvolutionLabels(isDefault ? undefined : labels);
  if (axisPreset) axisPreset.value = presetIdFor(labels);
}
function closeAxisDialog(): void {
  if (axisOverlay) axisOverlay.hidden = true;
}

onMenu('m-axis', () => {
  if (!axisOverlay) return;
  const labels = currentAxisLabels();
  fillAxisInputs(labels);
  if (axisPreset) axisPreset.value = presetIdFor(labels);
  axisOverlay.hidden = false;
  axisInputs[0]?.focus();
});
axisPreset?.addEventListener('change', () => {
  const preset = EVOLUTION_PRESETS.find((p) => p.id === axisPreset.value);
  if (!preset) return; // "Custom" -> leave the inputs unchanged
  fillAxisInputs(preset.labels);
  applyAxisLabels();
});
for (const el of axisInputs) el?.addEventListener('input', applyAxisLabels);
document.getElementById('axis-reset')?.addEventListener('click', () => {
  fillAxisInputs(DEFAULT_EVOLUTION_LABELS);
  applyAxisLabels();
});
document.getElementById('axis-close')?.addEventListener('click', closeAxisDialog);
axisOverlay?.addEventListener('click', (e) => {
  if (e.target === axisOverlay) closeAxisDialog();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && axisOverlay && !axisOverlay.hidden) closeAxisDialog();
});

// --- Landing (start-screen) buttons ---
document.getElementById('btn-new')?.addEventListener('click', () => {
  /* Canvas is already empty here — just leave the landing and reveal the working chrome. */
  hasStarted = true;
  updateLanding();
});
document.getElementById('btn-example')?.addEventListener('click', () => {
  hasStarted = true;
  showExample();
});

// --- Close/copy the output panel ---
document.getElementById('output-close')?.addEventListener('click', () => {
  if (overlay) overlay.hidden = true;
});
overlay?.addEventListener('click', (e) => {
  if (e.target === overlay) overlay.hidden = true;
});
document.getElementById('output-copy')?.addEventListener('click', () => {
  if (!outText) return;
  void navigator.clipboard?.writeText(outText.value);
  outText.select();
  showToast('Copied to clipboard', 'success');
});

// --- Share ---
document.getElementById('btn-share')?.addEventListener('click', () => {
  void (async () => {
    try {
      const dsl = viewer.exportDSL();
      const url = await shareUrl(dsl);
      await writeHashMap(dsl);
      await navigator.clipboard?.writeText(url);
      showToast('Share link copied to clipboard', 'success');
    } catch {
      showToast('Could not create the share link', 'error');
    }
  })();
});

// --- Zoom-Controls (unten rechts) + Shortcuts ---
const zoomScroll = viewer.get('zoomScroll') as { stepZoom(delta: number): void };
const canvasService = viewer.get('canvas') as { zoom(): number };
const zoomLevelBtn = document.getElementById('z-level');
function updateZoomLevel(): void {
  if (zoomLevelBtn) zoomLevelBtn.textContent = `${Math.round(canvasService.zoom() * 100)}%`;
}
viewer.on('canvas.viewbox.changed', updateZoomLevel);
document.getElementById('z-in')?.addEventListener('click', () => zoomScroll.stepZoom(1));
document.getElementById('z-out')?.addEventListener('click', () => zoomScroll.stepZoom(-1));
zoomLevelBtn?.addEventListener('click', fitView);
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return;
  if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    zoomScroll.stepZoom(1);
  } else if (e.key === '-') {
    e.preventDefault();
    zoomScroll.stepZoom(-1);
  } else if (e.key === '0') {
    e.preventDefault();
    fitView();
  }
});

// --- Drag & drop (over the whole stage, including over the empty state) ---
const stage = document.querySelector('.app-stage');
let dragDepth = 0;
stage?.addEventListener('dragenter', (e) => {
  if ((e as DragEvent).dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    dragDepth++;
    stage.classList.add('drag-over');
  }
});
stage?.addEventListener('dragover', (e) => {
  if ((e as DragEvent).dataTransfer?.types.includes('Files')) e.preventDefault();
});
stage?.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    stage.classList.remove('drag-over');
  }
});
stage?.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  stage.classList.remove('drag-over');
  const file = (e as DragEvent).dataTransfer?.files?.[0];
  if (file) void load(file);
});

// --- Startup: load the map from the URL hash, otherwise an EMPTY canvas (no auto-example) ---
const initial = await readHashMap();
if (initial) {
  const { warnings } = await viewer.importDSL(initial);
  logWarnings(warnings);
} else {
  await viewer.importMap(createEmptyMap('New map'));
}

// Pasting a shared link into an already-open tab: adopt the hash change.
// (writeHashMap uses history.replaceState and fires NO hashchange -> no loop.)
window.addEventListener('hashchange', () => {
  void (async () => {
    const dsl = await readHashMap();
    if (dsl && dsl !== viewer.exportDSL()) {
      const { warnings } = await viewer.importDSL(dsl);
      logWarnings(warnings);
    }
  })();
});
