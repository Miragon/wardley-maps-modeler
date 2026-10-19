import {
  MAP_SIZE_PRESETS,
  PLOT_MAX,
  PLOT_MIN,
  parsePlotLength,
  plotLengthMessage,
} from '@miragon/wardley-schema-model';
import type { Modeler } from '../Modeler.js';
import type { MapSizeInfo } from '../WardleyBaseViewer.js';
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

/** The size the popover last drew; `undefined` = the default size without a `size` line. */
type Target = { width: number; height: number } | undefined;

function numberInput(min: number, max: number): HTMLInputElement {
  const input = element('input', '');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.min = String(min);
  input.max = String(max);
  input.step = '10';
  return input;
}

/**
 * "Map size…" (guide §5.4): presets, a custom width × height and a reset to the default size. Every
 * choice is drawn at once as a preview without an undo step; closing writes ONE edit (none when the
 * map ends at the size it had). An import while it is open closes it without writing, and so does
 * a canvas that turns read-only, after putting the previous size back.
 */
export function createMapSizePopover(chrome: PopoverChrome, modeler: Modeler): PopoverHandle {
  const preset = element('select', '');
  for (const choice of MAP_SIZE_PRESETS) {
    const option = element('option', '', `${choice.name} (${choice.width} × ${choice.height})`);
    option.value = choice.id;
    preset.append(option);
  }
  const custom = element('option', '', 'Custom');
  custom.value = CUSTOM;
  preset.append(custom);
  const width = numberInput(PLOT_MIN.width, PLOT_MAX.width);
  const height = numberInput(PLOT_MIN.height, PLOT_MAX.height);
  const reset = dialogButton('Reset to default', 'ghost');
  const sizeField = field('Size', preset);
  const widthField = field('Width', width);
  const heightField = field('Height', height);

  let atOpen: MapSizeInfo | undefined;
  let target: { size: Target } | undefined;

  const show = (size: MapSizeInfo) => {
    preset.value = size.presetId ?? CUSTOM;
    width.value = String(size.width);
    height.value = String(size.height);
    reset.disabled = !size.isExplicit;
    widthField.clearError();
    heightField.clearError();
  };

  const preview = (size: Target) => {
    target = { size };
    const applied = size
      ? modeler.setMapSize(size.width, size.height, { transient: true })
      : modeler.resetMapSize({ transient: true });
    void applied.then(() => show(modeler.getMapSize()));
  };

  const applyLength = (input: HTMLInputElement, axis: 'width' | 'height') => {
    const fieldOf = axis === 'width' ? widthField : heightField;
    const length = parsePlotLength(input.value, axis);
    if (length === undefined) {
      fieldOf.showError(plotLengthMessage(axis));
      return;
    }
    fieldOf.clearError();
    const current = modeler.getMapSize();
    if (length === current[axis]) return;
    preview({ width: current.width, height: current.height, [axis]: length });
  };

  const popover = createPopover(chrome, {
    className: 'wardley-map-size',
    title: 'Map size',
    build(body, footer, done) {
      const lengths = element('div', 'wardley-field-row');
      const times = element('span', 'wardley-field-times', '×');
      times.setAttribute('aria-hidden', 'true');
      lengths.append(widthField.wrapper, times, heightField.wrapper);
      const hint = element('p', 'wardley-popover-hint', 'Or drag the plot’s right or bottom edge.');
      body.append(sizeField.wrapper, lengths, hint);
      const doneButton = dialogButton('Done', 'secondary');
      doneButton.addEventListener('click', done);
      footer.append(reset, doneButton);

      preset.addEventListener('change', () => {
        const choice = MAP_SIZE_PRESETS.find((candidate) => candidate.id === preset.value);
        if (choice) preview({ width: choice.width, height: choice.height });
        else width.focus();
      });
      width.addEventListener('change', () => applyLength(width, 'width'));
      height.addEventListener('change', () => applyLength(height, 'height'));
      reset.addEventListener('click', () => {
        // Reset disables itself, which would drop the focus out of the popover.
        preset.focus();
        preview(undefined);
      });
    },
    opened() {
      atOpen = modeler.getMapSize();
      target = undefined;
      show(atOpen);
      return preset;
    },
    closed(end) {
      const previewed = target;
      target = undefined;
      // An import already dropped the preview together with the map it was drawn on.
      if (!previewed || end === 'import') return;
      // Committing the size at open puts it back without an undo step.
      const size = end === 'done' ? previewed.size : sizeOf(atOpen);
      void (size ? modeler.setMapSize(size.width, size.height) : modeler.resetMapSize());
    },
  });

  return withMapListeners(modeler, popover);
}

function sizeOf(info: MapSizeInfo | undefined): Target {
  return info?.isExplicit ? { width: info.width, height: info.height } : undefined;
}
