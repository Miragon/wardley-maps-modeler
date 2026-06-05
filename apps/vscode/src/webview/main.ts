// Self-hosted Font (DSGVO-konform, offline) — die Leinwand-Schrift des Renderers.
import '@fontsource-variable/spline-sans/index.css';
// Bringt die Renderer-CSS (inkl. diagram-js.css) ins Bundle.
import {
  Modeler,
  iconMarkup,
  ICON_MENU,
  ICON_ASPECT_RATIO,
  ICON_DOWNLOAD,
  ICON_IMAGE,
  ICON_EDIT,
} from '@wardley/renderer';
import { EVOLUTION_PRESETS, DEFAULT_EVOLUTION_LABELS } from '@wardley/schema-model';
import './style.css';
import { embedSvg, svgToEmbeddedPng, blobToBase64 } from './io.js';
import type { HostToWebview, WebviewToHost } from '../protocol.js';

interface VsCodeApi {
  postMessage(msg: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare const acquireVsCodeApi: () => VsCodeApi;
const vscode = acquireVsCodeApi();

const container = document.getElementById('canvas');
const toolbar = document.getElementById('toolbar');
if (!container || !toolbar) throw new Error('Webview-Layout unvollständig (#canvas/#toolbar).');

const modeler = new Modeler({ container });
// Debug-Handle (analog zur Webapp). Harmlos in der sandboxed Webview, hilfreich für Diagnose/Tests.
(globalThis as Record<string, unknown>).__wardleyModeler = modeler;

// ---------------------------------------------------------------------------
// Zwei-Wege-Sync mit dem Dokument
// ---------------------------------------------------------------------------

let lastText = ''; // zuletzt mit dem Host abgeglichener Text
let importing = false; // unterdrückt Edit-Echo während des Imports
let importFailed = false; // letzter Import (z.B. extern getippter Text) war unparsbar
let initialized = false; // erstes init erfolgt -> ab dann Zoom/Ausschnitt erhalten

/** Vergleicht zwei DSL-Texte modulo Zeilenenden/Trailing-Whitespace (= Save-Transforms). */
function sameMapText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
}

/**
 * Lädt `text` in den Modeler. `fit=true` (Erst-Laden) passt die Map ein; `fit=false` (externe oder
 * echo-verfehlte Änderung) ERHÄLT den aktuellen Zoom/Ausschnitt — sonst würde jede vom Host
 * zurückgespiegelte Änderung (z.B. das beim Speichern angehängte `insertFinalNewline`) den Zoom auf
 * Standard zurücksetzen. Beschreibt das eingehende `update` dieselbe Map wie der aktuelle Stand (nur
 * Whitespace/EOL-Differenz), wird gar nicht neu importiert (kein Flicker, keine Zoom-/Selektionsverluste).
 */
async function importText(text: string, fit: boolean): Promise<void> {
  if (!fit && initialized && sameMapText(text, modeler.exportDSL())) {
    lastText = text;
    return;
  }
  importing = true;
  const prevView = fit ? undefined : currentViewbox();
  try {
    await modeler.importDSL(text);
    lastText = text;
    importFailed = false;
    if (fit) fitView();
    else if (prevView) restoreViewbox(prevView);
  } catch (err) {
    // Parse-Fehler: die Leinwand zeigt weiter die letzte gute Map. pushEdit blockieren, damit
    // eine grafische Aktion nicht den (gerade extern getippten) unparsbaren Text überschreibt —
    // bis ein erfolgreicher Re-Import (gültiges 'update') wieder einen bekannten Stand herstellt.
    importFailed = true;
    vscode.postMessage({
      type: 'error',
      message: `Could not parse this Wardley map: ${(err as Error).message}`,
    });
  } finally {
    importing = false;
    initialized = true;
  }
}

/** Grafische Änderung -> DSL serialisieren und (nur bei echter Differenz) an den Host melden. */
function pushEdit(): void {
  if (importing || importFailed) return;
  const dsl = modeler.exportDSL();
  if (dsl === lastText) return;
  lastText = dsl;
  vscode.postMessage({ type: 'edit', text: dsl });
}

modeler.on('commandStack.changed', pushEdit);
// fitView NICHT global an import.done hängen — sonst setzt jedes zurückgespiegelte 'update' den
// Zoom zurück. Eingepasst wird gezielt: beim Erst-Laden (importText fit=true) und bei Größenänderung.

window.addEventListener('message', (event: MessageEvent<HostToWebview>) => {
  const msg = event.data;
  if (msg.type === 'init') void importText(msg.text, true);
  else if (msg.type === 'update') void importText(msg.text, false);
});

// ---------------------------------------------------------------------------
// Viewport: Map einpassen, oben Platz für die schwebende Toolbar lassen
// ---------------------------------------------------------------------------

const VIEW_INSET = { top: 72, side: 28, bottom: 28 };
function fitView(): void {
  const canvas = modeler.get<{
    viewbox(box?: { x: number; y: number; width: number; height: number }): void;
  }>('canvas');
  const grid = modeler.get<{
    outerBounds(): { x: number; y: number; width: number; height: number };
  }>('evolutionGrid');
  const rect = container!.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  if (!W || !H) return;
  const p = grid.outerBounds();
  const availW = Math.max(W - 2 * VIEW_INSET.side, 50);
  const availH = Math.max(H - VIEW_INSET.top - VIEW_INSET.bottom, 50);
  const s = Math.min(availW / p.width, availH / p.height);
  canvas.viewbox({
    x: p.x + p.width / 2 - W / 2 / s,
    y: p.y - VIEW_INSET.top / s,
    width: W / s,
    height: H / s,
  });
}

type ViewBox = { x: number; y: number; width: number; height: number };

/** Aktuellen Zoom/Ausschnitt auslesen (oder undefined, falls noch kein Canvas). */
function currentViewbox(): ViewBox | undefined {
  try {
    const vb = modeler.get<{ viewbox(): ViewBox }>('canvas').viewbox();
    return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  } catch {
    return undefined;
  }
}

/** Zoom/Ausschnitt wiederherstellen (nach einem erhaltenden Re-Import). */
function restoreViewbox(box: ViewBox): void {
  try {
    modeler.get<{ viewbox(box: ViewBox): void }>('canvas').viewbox(box);
  } catch {
    /* noch kein Canvas -> ignorieren */
  }
}

function deselect(): void {
  modeler.get<{ select: (e: unknown) => void }>('selection').select(null);
}

// ---------------------------------------------------------------------------
// Menü (eingeklappter Hamburger oben rechts, Excalidraw-Stil; Chrome im VS-Code-Theme, Leinwand
// bleibt „Strategic Blueprint"). KEIN Undo/Redo — das erledigt VS Code via Ctrl/Cmd+Z out-of-the-box
// (der Modeler-Keyboard-Service ist im Webview-Canvas gebunden).
// ---------------------------------------------------------------------------

function setMenuOpen(open: boolean): void {
  dropdown.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
}

function menuItem(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'menu-item';
  item.setAttribute('role', 'menuitem');
  item.innerHTML = `${iconMarkup(icon, 16)}<span>${label}</span>`;
  item.addEventListener('click', () => {
    setMenuOpen(false);
    onClick();
  });
  return item;
}

function menuSep(): HTMLDivElement {
  const sep = document.createElement('div');
  sep.className = 'menu-sep';
  sep.setAttribute('role', 'separator');
  return sep;
}

const menuBtn = document.createElement('button');
menuBtn.type = 'button';
menuBtn.className = 'menu-btn';
menuBtn.title = 'Menu';
menuBtn.setAttribute('aria-label', 'Menu');
menuBtn.setAttribute('aria-haspopup', 'true');
menuBtn.setAttribute('aria-expanded', 'false');
menuBtn.innerHTML = iconMarkup(ICON_MENU, 18);

const dropdown = document.createElement('div');
dropdown.className = 'menu-dropdown';
dropdown.setAttribute('role', 'menu');
dropdown.hidden = true;

// Map-Größe als Menü-Feld (Label + Select).
const sizeSelect = document.createElement('select');
sizeSelect.className = 'menu-select';
sizeSelect.title = 'Map size';
for (const [label, value] of [
  ['Compact', '720x460'],
  ['Standard', '1080x680'],
  ['Large', '1440x900'],
  ['Wide', '1760x720'],
] as const) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  if (value === '1080x680') opt.selected = true;
  sizeSelect.append(opt);
}
sizeSelect.addEventListener('change', () => {
  const [w, h] = sizeSelect.value.split('x').map(Number);
  // setMapSize re-importiert intern (feuert import.done, NICHT commandStack.changed) -> pushEdit
  // selbst anstoßen, sonst geht die Größenänderung beim Speichern verloren. Erst nach Auflösung
  // der Promise (dann spiegelt exportDSL die neue Größe).
  if (w && h)
    void modeler.setMapSize(w, h).then(() => {
      fitView(); // Plotfläche hat sich geändert -> neu einpassen
      pushEdit();
    });
  setMenuOpen(false);
});
const sizeField = document.createElement('label');
sizeField.className = 'menu-field';
const sizeFieldLabel = document.createElement('span');
sizeFieldLabel.textContent = 'Map size';
sizeField.append(sizeFieldLabel, sizeSelect);

dropdown.append(
  menuItem(ICON_ASPECT_RATIO, 'Fit to view', fitView),
  menuSep(),
  sizeField,
  menuItem(ICON_EDIT, 'X-axis labels…', openAxisDialog),
  menuSep(),
  menuItem(ICON_DOWNLOAD, 'Export · SVG', exportSvg),
  menuItem(ICON_IMAGE, 'Export · PNG', exportPng),
);

toolbar.append(menuBtn, dropdown);

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setMenuOpen(dropdown.hidden === true); // toggeln: ist es eingeklappt -> aufklappen
});
// Klick außerhalb des Menüs schließt es.
document.addEventListener('click', (e) => {
  if (!(e.target as Element | null)?.closest('#toolbar')) setMenuOpen(false);
});

// ---------------------------------------------------------------------------
// Export (Webview rastert/serialisiert; der Host zeigt den Save-Dialog)
// ---------------------------------------------------------------------------

async function exportSvg(): Promise<void> {
  deselect();
  try {
    const { svg } = await modeler.saveSVG();
    vscode.postMessage({ type: 'export', format: 'svg', data: embedSvg(svg, modeler.exportDSL()) });
  } catch (err) {
    vscode.postMessage({ type: 'error', message: `SVG export failed: ${(err as Error).message}` });
  }
}

async function exportPng(): Promise<void> {
  deselect();
  try {
    const { svg } = await modeler.saveSVG();
    const blob = await svgToEmbeddedPng(svg, modeler.exportDSL());
    vscode.postMessage({ type: 'export', format: 'png', data: await blobToBase64(blob) });
  } catch (err) {
    vscode.postMessage({ type: 'error', message: `PNG export failed: ${(err as Error).message}` });
  }
}

// ---------------------------------------------------------------------------
// X-Achsen-Beschriftung (Preset wählen ODER Stages frei beschriften) — wie in der Webapp
// ---------------------------------------------------------------------------

const CUSTOM_PRESET = 'custom';
let axisOverlay: HTMLElement | undefined;
let axisPreset: HTMLSelectElement | undefined;
let axisInputs: HTMLInputElement[] = [];

function currentAxisLabels(): readonly string[] {
  return modeler.exportMap().config.evolutionLabels ?? DEFAULT_EVOLUTION_LABELS;
}
function presetIdFor(labels: readonly string[]): string {
  return (
    EVOLUTION_PRESETS.find((p) => p.labels.every((v, i) => v === labels[i]))?.id ?? CUSTOM_PRESET
  );
}
function fillAxisInputs(labels: readonly string[]): void {
  axisInputs.forEach((el, i) => (el.value = labels[i] ?? ''));
}
function applyAxisLabels(persist = true): void {
  const labels = axisInputs.map((el, i) => {
    const v = el.value.replace(/->/g, '→').trim();
    return v || DEFAULT_EVOLUTION_LABELS[i]!;
  }) as [string, string, string, string];
  const isDefault = DEFAULT_EVOLUTION_LABELS.every((v, i) => v === labels[i]);
  modeler.setEvolutionLabels(isDefault ? undefined : labels); // Live-Update des Rasters (sofort)
  if (axisPreset) axisPreset.value = presetIdFor(labels);
  // Achsen-Änderung feuert kein commandStack.changed -> selbst synchronisieren.
  if (persist) pushEdit();
}

function buildAxisDialog(): void {
  axisOverlay = document.createElement('div');
  axisOverlay.className = 'overlay';
  axisOverlay.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <header class="panel-head">
      <span>X-axis labels</span>
      <button type="button" class="ghost" data-axis-close>Close</button>
    </header>
    <div class="panel-body">
      <label class="row"><span>Preset</span><select data-axis-preset></select></label>
      <div class="stages">
        ${[1, 2, 3, 4]
          .map(
            (n, i) =>
              `<label class="stage"><span>Stage ${n}</span><input data-axis-input="${i}" type="text" autocomplete="off" /></label>`,
          )
          .join('')}
      </div>
      <div class="foot"><button type="button" class="ghost" data-axis-reset>Reset to default</button></div>
    </div>`;
  axisOverlay.append(panel);
  document.getElementById('app')?.append(axisOverlay);

  axisPreset = panel.querySelector<HTMLSelectElement>('[data-axis-preset]') ?? undefined;
  axisInputs = [...panel.querySelectorAll<HTMLInputElement>('[data-axis-input]')];

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
    axisPreset.addEventListener('change', () => {
      const preset = EVOLUTION_PRESETS.find((p) => p.id === axisPreset!.value);
      if (!preset) return;
      fillAxisInputs(preset.labels);
      applyAxisLabels();
    });
  }
  // Live-Tippen: Raster sofort aktualisieren, aber die Persistenz (1 WorkspaceEdit = 1 Undo-Schritt)
  // entprellen — sonst ein Undo-Eintrag pro Tastendruck (wie die Webapp es bewusst vermeidet).
  let axisTimer: ReturnType<typeof setTimeout> | undefined;
  for (const el of axisInputs)
    el.addEventListener('input', () => {
      applyAxisLabels(false);
      clearTimeout(axisTimer);
      axisTimer = setTimeout(() => pushEdit(), 300);
    });
  panel.querySelector('[data-axis-reset]')?.addEventListener('click', () => {
    fillAxisInputs(DEFAULT_EVOLUTION_LABELS);
    applyAxisLabels();
  });
  panel.querySelector('[data-axis-close]')?.addEventListener('click', closeAxisDialog);
  axisOverlay.addEventListener('click', (e) => {
    if (e.target === axisOverlay) closeAxisDialog();
  });
}

function openAxisDialog(): void {
  if (!axisOverlay) buildAxisDialog();
  const labels = currentAxisLabels();
  fillAxisInputs(labels);
  if (axisPreset) axisPreset.value = presetIdFor(labels);
  if (axisOverlay) axisOverlay.hidden = false;
  axisInputs[0]?.focus();
}
function closeAxisDialog(): void {
  if (axisOverlay) axisOverlay.hidden = true;
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (axisOverlay && !axisOverlay.hidden) closeAxisDialog();
  else setMenuOpen(false);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

vscode.postMessage({ type: 'ready' });
