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
  ICON_EDIT,
} from '@wardley/renderer';
import { createEmptyMap, EVOLUTION_PRESETS, DEFAULT_EVOLUTION_LABELS } from '@wardley/schema-model';
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
setLabel('m-axis', ICON_EDIT, 'X-axis labels…');
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
/** Wie `isEmptyMap`, aber zählt auch eine angepasste Achsen-Config als „zu erhalten“ (Persistenz). */
function isBlankMap(): boolean {
  const map = viewer.exportMap();
  return isEmptyMap() && !map.config.evolutionLabels && !map.config.yAxisLabel;
}
let urlTimer: ReturnType<typeof setTimeout> | undefined;
/** Schreibt den aktuellen Stand SOFORT in den Hash (bzw. räumt ihn bei leerer Map auf). */
function syncUrlNow(): void {
  clearTimeout(urlTimer);
  urlTimer = undefined;
  // Leere Map ohne Custom-Config -> Hash entfernen (saubere URL, leerer Start bleibt teilbar).
  if (isBlankMap()) history.replaceState(null, '', location.pathname + location.search);
  else writeHashMap(viewer.exportDSL());
}
/**
 * Empty-State umschalten + URL synchronisieren. Diskrete Editieraktionen (Zeichnen, Verbinden,
 * Verschieben, Löschen) werden SOFORT persistiert — sonst geht eine gerade gemachte Änderung
 * (z.B. ein frisch gezeichneter Pfeil) bei sehr schnellem Neuladen verloren. Nur das Achsen-
 * Live-Tippen (`wardley.config.changed`, ein Event pro Tastendruck) wird entprellt.
 */
function onModelChanged(debounce = false): void {
  const empty = isEmptyMap();
  if (emptyState) emptyState.hidden = !empty;
  clearTimeout(urlTimer);
  if (debounce) urlTimer = setTimeout(syncUrlNow, 350);
  else syncUrlNow();
}
viewer.on('commandStack.changed', () => onModelChanged());
viewer.on('import.done', () => onModelChanged());
viewer.on('wardley.config.changed', () => onModelChanged(true));
// Belt-and-suspenders: ausstehenden (entprellten) Achsen-Sync vor dem Verlassen noch schreiben.
const flushUrl = (): void => {
  if (urlTimer !== undefined) syncUrlNow();
};
window.addEventListener('beforeunload', flushUrl);
window.addEventListener('pagehide', flushUrl);

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

// --- X-Achsen-Beschriftung (Preset wählen ODER einzelne Stages frei beschriften) ---
const CUSTOM_PRESET = 'custom';
const axisOverlay = document.getElementById('axis-overlay');
const axisPreset = document.getElementById('axis-preset') as HTMLSelectElement | null;
const axisInputs = [0, 1, 2, 3].map(
  (i) => document.getElementById(`axis-s${i}`) as HTMLInputElement | null,
);

// Preset-Optionen aus der Single-Source-of-Truth (@wardley/schema-model) + freie „Custom“-Wahl.
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
/** id des Presets, dessen Labels exakt `labels` entsprechen, sonst „custom“. */
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
 * Inputs -> Map. Leere/Whitespace-Stages fallen auf den Default dieser Position zurück (ein leeres
 * Achsen-Label ist weder sinnvoll noch im `->`-getrennten DSL darstellbar; deckt auch das
 * mid-typing-Leeren ab). `->` würde den DSL-Trenner einschleusen -> durch einen echten Pfeil
 * ersetzen. So bleibt der Round-Trip verlustfrei. Default-Set => Labels entfernen (saubere DSL/URL).
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
  if (!preset) return; // „Custom“ -> Eingaben unverändert lassen
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
