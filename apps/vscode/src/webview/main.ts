// Geist (Miragon typeface), self-hosted variable font (all weights in one file). esbuild inlines the
// woff2 as data-URLs; the webview has no code area, so Geist Mono is not needed here.
import '@fontsource-variable/geist/wght.css';
// Pulls the renderer CSS (incl. diagram-js.css) into the bundle.
import {
  Modeler,
  iconMarkup,
  ICON_MENU,
  ICON_ASPECT_RATIO,
  ICON_DOWNLOAD,
  ICON_IMAGE,
  ICON_EDIT,
} from '@miragon/wardley-renderer';
import { EVOLUTION_PRESETS, DEFAULT_EVOLUTION_LABELS } from '@miragon/wardley-schema-model';
import './style.css';
import { svgToPng, blobToBase64 } from './io.js';
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
if (!container || !toolbar) throw new Error('Webview layout incomplete (#canvas/#toolbar).');

const modeler = new Modeler({ container });
// Debug handle (like the webapp). Harmless in the sandboxed webview, helpful for diagnostics/tests.
(globalThis as Record<string, unknown>).__wardleyModeler = modeler;

// ---------------------------------------------------------------------------
// Two-way sync with the document
// ---------------------------------------------------------------------------

let lastText = ''; // text last reconciled with the host
let importing = false; // suppresses the edit echo during import
let importFailed = false; // the last import (e.g. externally typed text) was unparsable
let initialized = false; // first init done -> preserve zoom/viewport from then on

// Serialize imports STRICTLY: init/update arrive as (un-awaited) messages; without chaining, two
// quick updates (e.g. several undos) could import concurrently and finish in the wrong order. The
// PNG save (respondPng) also hooks onto this chain, so a half-imported state is never rasterized.
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
 * Loads `text` into the modeler. `fit=true` (first load) fits the map; `fit=false` (external or
 * echo-missed change) PRESERVES the current zoom/viewport — otherwise every change mirrored back by
 * the host (e.g. the `insertFinalNewline` appended on save) would reset the zoom to default. If the
 * incoming `update` describes the same map as the current state (only whitespace/EOL difference),
 * it is not re-imported at all (no flicker, no zoom/selection loss).
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
    // Parse error: the canvas keeps showing the last good map. Block pushEdit so a graphical action
    // doesn't overwrite the (just externally typed) unparsable text — until a successful re-import
    // (valid 'update') restores a known state.
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

/** Graphical change -> serialize DSL and (only on a real difference) report it to the host. */
function pushEdit(): void {
  if (importing || importFailed) return;
  const dsl = modeler.exportDSL();
  if (dsl === lastText) return;
  lastText = dsl;
  vscode.postMessage({ type: 'edit', text: dsl });
}

modeler.on('commandStack.changed', pushEdit);
// Do NOT hook fitView globally onto import.done — otherwise every mirrored-back 'update' resets the
// zoom. Fit happens deliberately: on first load (importText fit=true) and on resize.

window.addEventListener('message', (event: MessageEvent<HostToWebview>) => {
  const msg = event.data;
  if (msg.type === 'init') void enqueueImport(msg.text, true);
  else if (msg.type === 'update') void enqueueImport(msg.text, false);
});

// ---------------------------------------------------------------------------
// Viewport: fit the map, leaving room at the top for the floating toolbar
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

/** Read the current zoom/viewport (or undefined if there is no canvas yet). */
function currentViewbox(): ViewBox | undefined {
  try {
    const vb = modeler.get<{ viewbox(): ViewBox }>('canvas').viewbox();
    return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  } catch {
    return undefined;
  }
}

function restoreViewbox(box: ViewBox): void {
  try {
    modeler.get<{ viewbox(box: ViewBox): void }>('canvas').viewbox(box);
  } catch {
    /* no canvas yet -> ignore */
  }
}

function deselect(): void {
  modeler.get<{ select: (e: unknown) => void }>('selection').select(null);
}

// ---------------------------------------------------------------------------
// Menu (collapsed hamburger top right, Excalidraw style; chrome in the VS Code theme, canvas stays
// "Strategic Blueprint"). NO undo/redo — VS Code handles that via Ctrl/Cmd+Z out of the box
// (the modeler's keyboard service is bound within the webview canvas).
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
  // setMapSize re-imports internally (fires import.done, NOT commandStack.changed) -> trigger
  // pushEdit ourselves, otherwise the size change is lost on save. Only after the promise resolves
  // (then exportDSL reflects the new size).
  if (w && h)
    void modeler.setMapSize(w, h).then(() => {
      fitView(); // the plot area changed -> re-fit
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
  setMenuOpen(dropdown.hidden === true);
});
document.addEventListener('click', (e) => {
  if (!(e.target as Element | null)?.closest('#toolbar')) setMenuOpen(false);
});

// ---------------------------------------------------------------------------
// Export (the webview rasterizes/serializes; the host shows the save dialog)
// ---------------------------------------------------------------------------

async function exportSvg(): Promise<void> {
  deselect();
  try {
    const { svg } = await modeler.saveSVG();
    vscode.postMessage({ type: 'export', format: 'svg', data: svg });
  } catch (err) {
    vscode.postMessage({ type: 'error', message: `SVG export failed: ${(err as Error).message}` });
  }
}

async function exportPng(): Promise<void> {
  deselect();
  try {
    const { svg } = await modeler.saveSVG();
    const blob = await svgToPng(svg);
    vscode.postMessage({ type: 'export', format: 'png', data: await blobToBase64(blob) });
  } catch (err) {
    vscode.postMessage({ type: 'error', message: `PNG export failed: ${(err as Error).message}` });
  }
}

// ---------------------------------------------------------------------------
// X-axis labels (choose a preset OR label stages freely) — like the webapp
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
  modeler.setEvolutionLabels(isDefault ? undefined : labels); // live update of the grid (immediate)
  if (axisPreset) axisPreset.value = presetIdFor(labels);
  // An axis change fires no commandStack.changed -> synchronize ourselves.
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
  // Live typing: update the grid immediately, but debounce persistence (1 WorkspaceEdit = 1 undo
  // step) — otherwise one undo entry per keystroke (which the webapp deliberately avoids).
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
