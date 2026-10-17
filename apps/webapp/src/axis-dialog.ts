/**
 * X-axis labels dialog: pick a preset or label each stage freely. Typing previews live on the
 * canvas without touching the undo history; closing the dialog commits ONE undoable step, and only
 * if the labels actually changed.
 */
import {
  DEFAULT_EVOLUTION_LABELS,
  EVOLUTION_PRESETS,
  normalizeEvolutionLabels,
} from '@miragon/wardley-schema-model';
import type { Modeler } from '@miragon/wardley-renderer';
import type { AppDialog } from './dialog.js';

const CUSTOM_PRESET = 'custom';

function presetIdFor(labels: readonly string[]): string {
  return (
    EVOLUTION_PRESETS.find((preset) => preset.labels.every((value, i) => value === labels[i]))
      ?.id ?? CUSTOM_PRESET
  );
}

interface AxisDialogElements {
  dialog: AppDialog;
  preset: HTMLSelectElement;
  stages: HTMLInputElement[];
  reset: HTMLButtonElement;
  done: HTMLButtonElement;
  close: HTMLButtonElement;
}

export function setupAxisDialog(
  elements: AxisDialogElements,
  viewer: Modeler,
): { open(returnFocusTo: HTMLElement | null): void } {
  const { dialog, preset, stages } = elements;
  let previewed = false;

  for (const candidate of EVOLUTION_PRESETS) {
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = candidate.name;
    option.title = candidate.labels.join(' · ');
    preset.append(option);
  }
  const custom = document.createElement('option');
  custom.value = CUSTOM_PRESET;
  custom.textContent = 'Custom';
  preset.append(custom);

  const currentLabels = (): readonly string[] =>
    viewer.exportMap().config.evolutionLabels ?? DEFAULT_EVOLUTION_LABELS;

  const fill = (labels: readonly string[]): void => {
    stages.forEach((input, index) => (input.value = labels[index] ?? ''));
    preset.value = presetIdFor(labels);
  };

  const preview = (): void => {
    const labels = normalizeEvolutionLabels(stages.map((input) => input.value));
    viewer.setEvolutionLabels(labels, { transient: true });
    previewed = true;
    preset.value = presetIdFor(labels ?? DEFAULT_EVOLUTION_LABELS);
  };

  const commit = (): void => {
    if (!previewed) return;
    previewed = false;
    viewer.setEvolutionLabels(normalizeEvolutionLabels(stages.map((input) => input.value)));
  };

  preset.addEventListener('change', () => {
    const chosen = EVOLUTION_PRESETS.find((candidate) => candidate.id === preset.value);
    if (!chosen) return;
    fill(chosen.labels);
    preview();
  });
  for (const input of stages) input.addEventListener('input', preview);
  elements.reset.addEventListener('click', () => {
    fill(DEFAULT_EVOLUTION_LABELS);
    preview();
  });
  elements.done.addEventListener('click', () => dialog.close());
  elements.close.addEventListener('click', () => dialog.close());
  dialog.element.addEventListener('close', commit);

  return {
    open(returnFocusTo) {
      fill(currentLabels());
      previewed = false;
      dialog.open({ returnFocusTo, focus: preset });
    },
  };
}
