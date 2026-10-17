// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Modeler } from '@miragon/wardley-renderer';
import { MapSizeControl } from '../src/webview/mapSize.js';

function fakeModeler() {
  const size = { width: 1080, height: 680, isExplicit: false, presetId: 'standard' as const };
  return {
    getMapSize: () => size,
    setMapSize: vi.fn(async () => {}),
    resetMapSize: vi.fn(async () => {}),
  };
}

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

describe('MapSizeControl (VS Code menu)', () => {
  it('refuses an out-of-range width with a message instead of clamping it', () => {
    const modeler = fakeModeler();
    const reportInvalid = vi.fn();
    const control = new MapSizeControl(modeler as unknown as Modeler, reportInvalid);
    control.sync();
    const [width] = control.element.querySelectorAll<HTMLInputElement>('input');

    for (const typo of ['100', '99999', '1000.5']) typeInto(width!, typo);

    expect(modeler.setMapSize).not.toHaveBeenCalled();
    expect(reportInvalid).toHaveBeenCalledWith('Width must be a whole number from 480 to 5000.');
    expect(width!.value).toBe('1080');
  });

  it('writes a valid height and keeps the width', () => {
    const modeler = fakeModeler();
    const control = new MapSizeControl(modeler as unknown as Modeler);
    control.sync();
    const [, height] = control.element.querySelectorAll<HTMLInputElement>('input');
    typeInto(height!, '900');
    expect(modeler.setMapSize).toHaveBeenCalledWith(1080, 900);
  });
});
