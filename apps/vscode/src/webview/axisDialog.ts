import type { Modeler } from '@miragon/wardley-renderer';
import {
  DEFAULT_EVOLUTION_LABELS,
  EVOLUTION_PRESETS,
  normalizeEvolutionLabels,
  sameEvolutionLabels,
} from '@miragon/wardley-schema-model';

const CUSTOM_PRESET = 'custom';
const FOCUSABLE = 'a[href], button:not([disabled]), input, select';

function presetIdFor(labels: readonly string[]): string {
  return (
    EVOLUTION_PRESETS.find((p) => p.labels.every((v, i) => v === labels[i]))?.id ?? CUSTOM_PRESET
  );
}

/**
 * X-axis labels dialog: pick a preset or label the four stages freely. Typing previews live on the
 * axis without touching the document; closing commits ONE change, so the document gets one edit
 * and VS Code one undo step per dialog session.
 */
export class AxisDialog {
  private readonly overlay: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly preset: HTMLSelectElement;
  private readonly inputs: HTMLInputElement[];
  private labelsAtOpen: readonly string[] = DEFAULT_EVOLUTION_LABELS;
  private returnFocusTo: HTMLElement | null = null;

  constructor(
    private readonly modeler: Modeler,
    host: HTMLElement,
    private readonly fallbackFocus: () => HTMLElement,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.overlay.hidden = true;
    this.overlay.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="axis-title">
        <header class="panel-head">
          <span id="axis-title">X-axis labels</span>
          <button type="button" class="chip-btn" data-axis-close>Done</button>
        </header>
        <div class="panel-body">
          <label class="row"><span>Preset</span><select data-axis-preset></select></label>
          <p class="panel-hint">
            Label sets from
            <a href="https://learnwardleymapping.com/landscape/">Learn Wardley Mapping</a>.
            Pick a set, or edit each stage individually.
          </p>
          <div class="stages">
            ${[1, 2, 3, 4]
              .map(
                (n, i) =>
                  `<label class="stage"><span>Stage ${n}</span><input data-axis-input="${i}" type="text" autocomplete="off" spellcheck="false" /></label>`,
              )
              .join('')}
          </div>
          <div class="foot"><button type="button" class="chip-btn" data-axis-reset>Reset to default</button></div>
        </div>
      </div>`;
    host.append(this.overlay);

    this.panel = this.overlay.querySelector<HTMLElement>('.panel')!;
    this.preset = this.overlay.querySelector<HTMLSelectElement>('[data-axis-preset]')!;
    this.inputs = [...this.overlay.querySelectorAll<HTMLInputElement>('[data-axis-input]')];
    this.fillPresets();
    this.bind();
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(): void {
    const active = document.activeElement;
    this.returnFocusTo = active instanceof HTMLElement ? active : null;
    this.labelsAtOpen = this.currentLabels();
    this.fill(this.labelsAtOpen);
    this.overlay.hidden = false;
    this.inputs[0]?.focus();
    this.inputs[0]?.select();
  }

  /** Commits the previewed labels (if they changed) and hands focus back. */
  close(): void {
    if (!this.isOpen) return;
    this.overlay.hidden = true;
    const labels = this.labelsFromInputs();
    if (!sameEvolutionLabels(labels, normalizeEvolutionLabels(this.labelsAtOpen))) {
      this.modeler.setEvolutionLabels(labels);
    }
    const target =
      this.returnFocusTo?.isConnected && this.returnFocusTo.offsetParent !== null
        ? this.returnFocusTo
        : this.fallbackFocus();
    target.focus();
  }

  private currentLabels(): readonly string[] {
    return this.modeler.exportMap().config.evolutionLabels ?? DEFAULT_EVOLUTION_LABELS;
  }

  private fillPresets(): void {
    for (const p of EVOLUTION_PRESETS) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name;
      option.title = p.labels.join(' · ');
      this.preset.append(option);
    }
    const custom = document.createElement('option');
    custom.value = CUSTOM_PRESET;
    custom.textContent = 'Custom…';
    this.preset.append(custom);
  }

  private fill(labels: readonly string[]): void {
    this.inputs.forEach((input, i) => (input.value = labels[i] ?? ''));
    this.preset.value = presetIdFor(labels);
  }

  /** The labels to store (`undefined` = the default set), see `normalizeEvolutionLabels`. */
  private labelsFromInputs(): ReturnType<typeof normalizeEvolutionLabels> {
    return normalizeEvolutionLabels(this.inputs.map((input) => input.value));
  }

  private preview(): void {
    const labels = this.labelsFromInputs();
    this.modeler.setEvolutionLabels(labels, { transient: true });
    this.preset.value = presetIdFor(labels ?? DEFAULT_EVOLUTION_LABELS);
  }

  private bind(): void {
    this.preset.addEventListener('change', () => {
      const preset = EVOLUTION_PRESETS.find((p) => p.id === this.preset.value);
      if (!preset) return; // "Custom" keeps the fields as they are
      this.fill(preset.labels);
      this.preview();
    });
    for (const input of this.inputs) input.addEventListener('input', () => this.preview());
    this.overlay.querySelector('[data-axis-reset]')?.addEventListener('click', () => {
      this.fill(DEFAULT_EVOLUTION_LABELS);
      this.preview();
    });
    this.overlay.querySelector('[data-axis-close]')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.overlay.addEventListener('keydown', (e) => this.onKeydown(e));
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
