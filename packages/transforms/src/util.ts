import type { MapElement, WardleyMap } from '@wardley/schema-model';

/** Ersetzt genau ein Element (per id) durch das Ergebnis von `updater`. Immutabel. */
export function updateElement(
  map: WardleyMap,
  id: string,
  updater: (el: MapElement) => MapElement,
): WardleyMap {
  let found = false;
  const elements = map.elements.map((el) => {
    if (el.id !== id) return el;
    found = true;
    return updater(el);
  });
  if (!found) throw new Error(`Element "${id}" nicht gefunden.`);
  return { ...map, elements };
}

/** Liefert ein Element per id oder `undefined`. */
export function findElement(map: WardleyMap, id: string): MapElement | undefined {
  return map.elements.find((el) => el.id === id);
}

/** Entfernt `undefined`-Werte, damit exactOptionalPropertyTypes nicht verletzt wird. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
