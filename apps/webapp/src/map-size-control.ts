/**
 * "Map size" in the menu: a preset select that always reflects the map (with a disabled
 * "Custom (W × H)" entry for other sizes), two whole-pixel inputs and "Reset to default". Every
 * change is one undoable setMapSize/resetMapSize step; the view is left where it is.
 */
import {
  MAP_SIZE_PRESETS,
  PLOT_MAX,
  PLOT_MIN,
  parsePlotLength,
  plotLengthMessage,
} from '@miragon/wardley-schema-model';
import type { Modeler } from '@miragon/wardley-renderer';
import { showToast } from './toast.js';

const CUSTOM_VALUE = 'custom';

export interface MapSizeControl {
  sync(): void;
}

interface MapSizeElements {
  select: HTMLSelectElement;
  width: HTMLInputElement;
  height: HTMLInputElement;
  reset: HTMLButtonElement;
}

export function setupMapSizeControl(elements: MapSizeElements, viewer: Modeler): MapSizeControl {
  const { select, width, height, reset } = elements;

  for (const preset of MAP_SIZE_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    option.title = `${preset.width} × ${preset.height}`;
    select.append(option);
  }
  const custom = document.createElement('option');
  custom.value = CUSTOM_VALUE;
  custom.disabled = true;
  select.append(custom);

  width.min = String(PLOT_MIN.width);
  width.max = String(PLOT_MAX.width);
  height.min = String(PLOT_MIN.height);
  height.max = String(PLOT_MAX.height);

  const sync = (): void => {
    const size = viewer.getMapSize();
    custom.textContent = `Custom (${size.width} × ${size.height})`;
    custom.hidden = !!size.presetId;
    select.value = size.presetId ?? CUSTOM_VALUE;
    if (document.activeElement !== width) width.value = String(size.width);
    if (document.activeElement !== height) height.value = String(size.height);
    reset.hidden = !size.isExplicit;
  };

  select.addEventListener('change', () => {
    const preset = MAP_SIZE_PRESETS.find((candidate) => candidate.id === select.value);
    if (preset) void viewer.setMapSize(preset.width, preset.height);
  });

  const commitLength = (input: HTMLInputElement, axis: 'width' | 'height'): void => {
    const size = viewer.getMapSize();
    const length = parsePlotLength(input.value, axis);
    if (length === undefined) {
      input.value = String(size[axis]);
      showToast(plotLengthMessage(axis), 'error');
      return;
    }
    if (length === size[axis]) return;
    const next = { width: size.width, height: size.height, [axis]: length };
    void viewer.setMapSize(next.width, next.height);
  };
  width.addEventListener('change', () => commitLength(width, 'width'));
  height.addEventListener('change', () => commitLength(height, 'height'));
  // `change` fires on Enter and when the field loses focus with an edited value.
  for (const input of [width, height]) input.addEventListener('blur', sync);

  reset.addEventListener('click', () => void viewer.resetMapSize());

  return { sync };
}
