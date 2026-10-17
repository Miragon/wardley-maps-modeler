import {
  MAP_SIZE_PRESETS,
  PLOT_MAX,
  PLOT_MIN,
  iconMarkup,
  ICON_ASPECT_RATIO,
  type Modeler,
} from '@miragon/wardley-renderer';
import { parsePlotLength, plotLengthMessage } from '@miragon/wardley-schema-model';

const CUSTOM_VALUE = 'custom';

function numberInput(label: string, min: number, max: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.min = String(min);
  input.max = String(max);
  input.step = '10';
  input.className = 'size-input';
  input.setAttribute('aria-label', label);
  return input;
}

/**
 * "Map size" menu control: presets, a custom width × height and a reset to the default size. It
 * mirrors `getMapSize()` (after imports, undo/redo and plot-handle drags) instead of remembering
 * the last choice, so a map with `size [1440, 900]` shows "Large" and a hand-written size shows
 * "Custom (W × H)".
 */
export class MapSizeControl {
  readonly element: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly customOption: HTMLOptionElement;
  private readonly widthInput: HTMLInputElement;
  private readonly heightInput: HTMLInputElement;
  private readonly resetButton: HTMLButtonElement;

  /**
   * @param reportInvalid shows why a typed width or height was refused (a typo must not silently
   *        change the document by clamping).
   */
  constructor(
    private readonly modeler: Modeler,
    private readonly reportInvalid: (message: string) => void = () => {},
  ) {
    this.element = document.createElement('div');
    this.element.className = 'menu-size';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Map size');

    this.select = document.createElement('select');
    this.select.className = 'menu-select';
    this.select.title = 'More room between elements; text size stays the same';
    this.select.setAttribute('aria-label', 'Map size preset');
    for (const preset of MAP_SIZE_PRESETS) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      option.title = `${preset.width} × ${preset.height}`;
      this.select.append(option);
    }
    this.customOption = document.createElement('option');
    this.customOption.value = CUSTOM_VALUE;
    this.select.append(this.customOption);

    const heading = document.createElement('label');
    heading.className = 'menu-field';
    heading.innerHTML = `<span>${iconMarkup(ICON_ASPECT_RATIO, 16)}<span>Map size</span></span>`;
    heading.append(this.select);

    this.widthInput = numberInput('Width', PLOT_MIN.width, PLOT_MAX.width);
    this.heightInput = numberInput('Height', PLOT_MIN.height, PLOT_MAX.height);
    this.resetButton = document.createElement('button');
    this.resetButton.type = 'button';
    this.resetButton.className = 'chip-btn';
    this.resetButton.textContent = 'Reset';
    this.resetButton.title = 'Back to the default size (removes the size line)';

    const custom = document.createElement('div');
    custom.className = 'size-custom';
    const times = document.createElement('span');
    times.className = 'size-times';
    times.textContent = '×';
    times.setAttribute('aria-hidden', 'true');
    custom.append(this.widthInput, times, this.heightInput, this.resetButton);

    const hint = document.createElement('p');
    hint.className = 'menu-hint';
    hint.textContent = 'Or drag the plot’s right or bottom edge.';

    this.element.append(heading, custom, hint);
    this.bind();
  }

  /** Shows the size the map is drawn at (never clobbers a field the user is typing in). */
  sync(): void {
    const size = this.modeler.getMapSize();
    const isPreset = size.presetId !== undefined;
    this.customOption.textContent = isPreset
      ? 'Custom…'
      : `Custom (${size.width} × ${size.height})`;
    this.select.value = size.presetId ?? CUSTOM_VALUE;
    if (document.activeElement !== this.widthInput) this.widthInput.value = String(size.width);
    if (document.activeElement !== this.heightInput) this.heightInput.value = String(size.height);
    this.resetButton.disabled = !size.isExplicit;
  }

  private bind(): void {
    this.select.addEventListener('change', () => {
      const preset = MAP_SIZE_PRESETS.find((p) => p.id === this.select.value);
      if (preset) void this.modeler.setMapSize(preset.width, preset.height);
      else this.widthInput.focus();
    });
    const applyCustom = (input: HTMLInputElement, axis: 'width' | 'height') => {
      const size = this.modeler.getMapSize();
      const length = parsePlotLength(input.value, axis);
      if (length === undefined) {
        input.value = String(size[axis]);
        this.reportInvalid(plotLengthMessage(axis));
        return;
      }
      if (length === size[axis]) return;
      const next = { width: size.width, height: size.height, [axis]: length };
      void this.modeler.setMapSize(next.width, next.height).finally(() => this.sync());
    };
    this.widthInput.addEventListener('change', () => applyCustom(this.widthInput, 'width'));
    this.heightInput.addEventListener('change', () => applyCustom(this.heightInput, 'height'));
    for (const input of [this.widthInput, this.heightInput]) {
      input.addEventListener('blur', () => this.sync());
    }
    this.resetButton.addEventListener('click', () => {
      // Reset disables itself, which would drop focus to the body and out of the menu's keys.
      this.select.focus();
      void this.modeler.resetMapSize();
    });
  }
}
