import { describe, expect, it, vi } from 'vitest';
import { createEmptyMap, serializeMap } from '@miragon/wardley-schema-model';
import type { Modeler } from '@miragon/wardley-renderer';
import { openFile } from '../src/io.js';
import { MapFileError } from '../src/map-file.js';

const DSL = 'title Tea\ncomponent Kettle [0.4, 0.4]';

function fakeViewer() {
  const importDSL = vi.fn(async () => ({ warnings: [] }));
  const importMap = vi.fn(async () => ({ warnings: [] }));
  return { viewer: { importDSL, importMap } as unknown as Modeler, importDSL, importMap };
}

describe('openFile', () => {
  it('opens DSL saved with a .json extension as DSL', async () => {
    const { viewer, importDSL, importMap } = fakeViewer();
    await openFile(new File([DSL], 'map.json'), viewer);
    expect(importDSL).toHaveBeenCalledWith(DSL);
    expect(importMap).not.toHaveBeenCalled();
  });

  it('opens JSON saved with a .wmap extension as JSON', async () => {
    const { viewer, importDSL, importMap } = fakeViewer();
    await openFile(new File([serializeMap(createEmptyMap('Tea'))], 'map.wmap'), viewer);
    expect(importMap).toHaveBeenCalledTimes(1);
    expect(importDSL).not.toHaveBeenCalled();
  });

  it('explains that pictures hold no map source', async () => {
    const { viewer } = fakeViewer();
    await expect(openFile(new File(['<svg/>'], 'map.svg'), viewer)).rejects.toBeInstanceOf(
      MapFileError,
    );
  });

  it('rejects text that holds no map at all instead of clearing the canvas', async () => {
    const { viewer, importDSL } = fakeViewer();
    const notes = new File(['Shopping list\nmilk, eggs'], 'notes.txt');
    await expect(openFile(notes, viewer)).rejects.toThrow(/Could not open “notes.txt”/);
    expect(importDSL).not.toHaveBeenCalled();
  });

  it('passes JSON syntax errors on for the caller to log', async () => {
    const { viewer } = fakeViewer();
    await expect(openFile(new File(['{ broken'], 'map.json'), viewer)).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });
});
