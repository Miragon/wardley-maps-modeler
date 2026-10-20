import {
  DEFAULT_EVOLUTION_LABELS,
  EVOLUTION_PRESETS,
  normalizeEvolutionLabels,
} from '@miragon/wardley-schema-model';
import type { Modeler } from '../Modeler.js';
import { element } from './dom.js';
import { dialogButton } from './dialog.js';
import {
  createPopover,
  field,
  withMapListeners,
  type PopoverChrome,
  type PopoverHandle,
} from './popover.js';

const CUSTOM = 'custom';

function presetIdFor(labels: readonly string[]): string {
  return (
    EVOLUTION_PRESETS.find((preset) => preset.labels.every((label, i) => label === labels[i]))
      ?.id ?? CUSTOM
  );
}

/**
 * "X-axis labels…" (guide §5.4): a preset or four free stage names. Typing previews on the axis
 * without touching the document; closing commits ONE edit, so the document gets one change and
 * an IDE one undo step per session. An import while it is open closes it without committing, and
 * so does a canvas that turns read-only, after putting the previous labels back.
 */
export function createAxisLabelsPopover(chrome: PopoverChrome, modeler: Modeler): PopoverHandle {
  const preset = element('select', '');
  for (const choice of EVOLUTION_PRESETS) {
    const option = element('option', '', choice.name);
    option.value = choice.id;
    option.title = choice.labels.join(' · ');
    preset.append(option);
  }
  const custom = element('option', '', 'Custom');
  custom.value = CUSTOM;
  preset.append(custom);
  const inputs = [1, 2, 3, 4].map(() => {
    const input = element('input', '');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    return input;
  });

  let labelsAtOpen: readonly string[] = DEFAULT_EVOLUTION_LABELS;
  let previewed = false;

  const fill = (labels: readonly string[]) => {
    inputs.forEach((input, index) => (input.value = labels[index] ?? ''));
    preset.value = presetIdFor(labels);
  };
  const typedLabels = () => normalizeEvolutionLabels(inputs.map((input) => input.value));
  const preview = () => {
    previewed = true;
    const labels = typedLabels();
    modeler.setEvolutionLabels(labels, { transient: true });
    preset.value = presetIdFor(labels ?? DEFAULT_EVOLUTION_LABELS);
  };

  const popover = createPopover(chrome, {
    className: 'wardley-axis-labels',
    title: 'X-axis labels',
    build(body, footer, done) {
      const hint = element('p', 'wardley-popover-hint');
      const source = element('a', 'wardley-popover-link', 'Learn Wardley Mapping');
      source.href = 'https://learnwardleymapping.com/landscape/';
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      hint.append('Label sets from ', source, '. Pick a set, or name each stage.');
      body.append(field('Preset', preset).wrapper, hint);
      inputs.forEach((input, index) => body.append(field(`Stage ${index + 1}`, input).wrapper));
      const reset = dialogButton('Reset to default', 'ghost');
      const doneButton = dialogButton('Done', 'secondary');
      footer.append(reset, doneButton);

      preset.addEventListener('change', () => {
        const choice = EVOLUTION_PRESETS.find((candidate) => candidate.id === preset.value);
        if (!choice) return; // "Custom" keeps the fields as they are
        fill(choice.labels);
        preview();
      });
      for (const input of inputs) {
        input.addEventListener('input', preview);
        input.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' || event.isComposing) return;
          event.preventDefault();
          done();
        });
      }
      reset.addEventListener('click', () => {
        fill(DEFAULT_EVOLUTION_LABELS);
        preview();
      });
      doneButton.addEventListener('click', done);
    },
    opened() {
      labelsAtOpen = modeler.exportMap().config.evolutionLabels ?? DEFAULT_EVOLUTION_LABELS;
      previewed = false;
      fill(labelsAtOpen);
      return inputs[0];
    },
    closed(end) {
      if (!previewed || end === 'import') return;
      previewed = false;
      // Committing the labels at open puts them back without an undo step.
      modeler.setEvolutionLabels(
        end === 'done' ? typedLabels() : normalizeEvolutionLabels(labelsAtOpen),
      );
    },
  });

  return withMapListeners(modeler, popover);
}
