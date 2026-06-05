// Self-hosted Fonts (DSGVO-konform, offline-fähig) statt Google-Fonts-CDN.
// Fraunces 'standard' = opsz+wght-Achsen (optisches Sizing); Spline Sans = wght-Achse.
import '@fontsource-variable/fraunces/standard.css';
import '@fontsource-variable/spline-sans/index.css';
import '@wardley/renderer/assets/wardley.css';
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
} from '@wardley/renderer';
import { createEmptyMap } from '@wardley/schema-model';
import { readHashMap, writeHashMap, shareUrl } from './share.js';
import { openFile, embedSvg, svgToEmbeddedPng, downloadBlob, downloadText } from './io.js';

/** Beispiel: Tea Shop (wird erst über „Beispiel anzeigen“ geladen, nicht beim Start). */
const TEA_SHOP = `title Tea Shop
anchor Business [0.95, 0.63]
anchor Public [0.95, 0.78]
component Cup of Tea [0.79, 0.61]
component Cup [0.73, 0.78]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.80]
component Water [0.38, 0.82]
component Kettle [0.43, 0.35]
evolve Kettle 0.62
component Power [0.10, 0.71] (outsource)
pipeline Kettle [0.30, 0.65]
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
  __wardleyIo: { openFile, embedSvg, svgToEmbeddedPng },
});

// --- Standard-Ausschnitt nach Import/Reload ---
// Map einpassen, aber oben Platz für die Floating-Chrome (Palette mittig, Menü links, Teilen rechts)
// und etwas Rand an den Seiten/unten freilassen -> nichts überlappt.
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
    x: p.x + p.width / 2 - W / 2 / s, // horizontal zentriert
    y: p.y - VIEW_INSET.top / s, // Oberkante unter die Chrome
    width: W / s,
    height: H / s,
  });
}
viewer.on('import.done', fitView);

// --- Button-/Menü-Icons ---
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
setLabel('m-png', ICON_IMAGE, 'Export · PNG');
const sizeField = document.querySelector('.menu-field span');
if (sizeField) sizeField.innerHTML = `${iconMarkup(ICON_ASPECT_RATIO, 16)}<span>Map size</span>`;

// --- Hamburger-Menü (Excalidraw-Stil): öffnen/schließen ---
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
/** Verknüpft einen Menüpunkt mit einer Aktion und schließt danach das Menü. */
function onMenu(id: string, action: () => void): void {
  document.getElementById(id)?.addEventListener('click', () => {
    setMenuOpen(false);
    action();
  });
}

// --- Empty-State + URL-Sync (zentral: was passiert, wenn sich das Modell ändert) ---
const emptyState = document.getElementById('empty-state');
function isEmptyMap(): boolean {
  const map = viewer.exportMap();
  return map.elements.length === 0 && map.edges.length === 0;
}
let urlTimer: ReturnType<typeof setTimeout> | undefined;
function onModelChanged(): void {
  const empty = isEmptyMap();
  if (emptyState) emptyState.hidden = !empty;
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    // Leere Map -> Hash entfernen (saubere URL, leerer Start bleibt teilbar/refreshbar als „leer“).
    if (isEmptyMap()) history.replaceState(null, '', location.pathname + location.search);
    else writeHashMap(viewer.exportDSL());
  }, 350);
}
viewer.on('commandStack.changed', onModelChanged);
viewer.on('import.done', onModelChanged);

// --- Aktionen ---
function showExample(): void {
  void viewer.importDSL(TEA_SHOP);
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
  try {
    await openFile(file, viewer);
  } catch (err) {
    alert(`Could not open file: ${(err as Error).message}`);
  }
}

// --- JSON/DSL-Export-Panel ---
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
    downloadText(embedSvg(svg, viewer.exportDSL()), 'wardley-map.svg', 'image/svg+xml');
  });
}
function exportPng(): void {
  deselect();
  void viewer.saveSVG().then(async ({ svg }) => {
    downloadBlob(await svgToEmbeddedPng(svg, viewer.exportDSL()), 'wardley-map.png');
  });
}

// --- Menüpunkte verdrahten ---
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
onMenu('m-png', exportPng);
document.getElementById('map-size')?.addEventListener('change', (e) => {
  const [w, h] = (e.target as HTMLSelectElement).value.split('x').map(Number);
  if (w && h) void viewer.setMapSize(w, h);
  setMenuOpen(false);
});

// --- Empty-State-Button ---
document.getElementById('btn-example')?.addEventListener('click', showExample);

// --- Output-Panel schließen/kopieren ---
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
});

// --- Teilen ---
document.getElementById('btn-share')?.addEventListener('click', () => {
  const url = shareUrl(viewer.exportDSL());
  writeHashMap(viewer.exportDSL());
  void navigator.clipboard?.writeText(url).then(() => {
    setLabel('btn-share', ICON_SHARE, 'Link copied!');
    setTimeout(() => setLabel('btn-share', ICON_SHARE, 'Share'), 1600);
  });
});

// --- Drag&Drop (auf der gesamten Bühne, auch über dem Empty-State) ---
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

// --- Start: Map aus URL-Hash laden, sonst LEERE Leinwand (kein Auto-Beispiel) ---
const initial = readHashMap();
void (initial ? viewer.importDSL(initial) : viewer.importMap(createEmptyMap('New map')));

// Geteilten Link in bereits offenen Tab einfügen: Hash-Änderung übernehmen.
// (writeHashMap nutzt history.replaceState und feuert KEIN hashchange -> keine Schleife.)
window.addEventListener('hashchange', () => {
  const dsl = readHashMap();
  if (dsl && dsl !== viewer.exportDSL()) void viewer.importDSL(dsl);
});
