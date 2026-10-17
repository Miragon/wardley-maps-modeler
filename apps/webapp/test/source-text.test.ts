import { describe, expect, it } from 'vitest';
import type { MapElement, WardleyMap } from '@miragon/wardley-schema-model';
import { parseDSL, serializeDSL } from '@miragon/wardley-dsl';
import { trackSourceText } from '../src/source-text.js';

const SOURCE = `title Platform
// --- Users ---
anchor Developer [0.95, 0.5]

component Portal [0.8, 0.55] // self-service entry point
component Kubernetes [0.3, 0.75]
Developer -> Portal
Portal -> Kubernetes
`;

/** A modeler stand-in: imports keep the ids of the parse, like the real one. */
function fakeViewer() {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  let map: WardleyMap = parseDSL('');
  const fire = (name: string, event: unknown = {}) =>
    listeners.get(name)?.forEach((listener) => listener(event));
  return {
    on<T>(name: string, callback: (event: T) => void): void {
      listeners.set(name, [...(listeners.get(name) ?? []), callback as (event: unknown) => void]);
    },
    exportMap: () => map,
    exportDSL: () => serializeDSL(map),
    importDSL(text: string) {
      fire('import.parse.start', { text });
      map = parseDSL(text);
      fire('import.done');
    },
    importMap(next: WardleyMap) {
      map = next;
      fire('import.done');
    },
    rename(label: string, newLabel: string) {
      map = {
        ...map,
        elements: map.elements.map((el) =>
          'label' in el && el.label === label ? ({ ...el, label: newLabel } as MapElement) : el,
        ),
      };
    },
  };
}

describe('trackSourceText', () => {
  it('returns the imported text unchanged and patches only edited lines', () => {
    const viewer = fakeViewer();
    const currentText = trackSourceText(viewer);
    viewer.importDSL(SOURCE);
    expect(currentText()).toBe(SOURCE);

    viewer.rename('Portal', 'Portl');
    expect(currentText()).toBe(SOURCE.replaceAll('Portal', 'Portl'));
    viewer.rename('Portl', 'Portal');
    expect(currentText()).toBe(SOURCE);
  });

  it('writes canonically for a map that did not come from text', () => {
    const viewer = fakeViewer();
    const currentText = trackSourceText(viewer);
    viewer.importDSL(SOURCE);
    const json = parseDSL('title From JSON\ncomponent A [0.5, 0.5]');
    viewer.importMap(json);
    expect(currentText()).toBe(serializeDSL(json));
  });
});
