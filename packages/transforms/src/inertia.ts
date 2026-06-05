import type { ComponentDecorators, WardleyMap } from '@wardley/schema-model';
import { updateElement, compact } from './util.js';

/** Schaltet das Inertia-Flag (Widerstand gegen Bewegung) einer Komponente um. */
export function toggleInertia(map: WardleyMap, componentId: string): WardleyMap {
  return setInertia(map, componentId);
}

/** Setzt das Inertia-Flag explizit (oder toggelt, wenn `value` fehlt). */
export function setInertia(map: WardleyMap, componentId: string, value?: boolean): WardleyMap {
  return updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') {
      throw new Error(`Inertia nur fuer Komponenten, "${componentId}" ist ${el.elementType}.`);
    }
    const next = value ?? !el.decorators?.inertia;
    const decorators = compact({
      ...el.decorators,
      inertia: next ? true : undefined,
    }) as ComponentDecorators;
    return Object.keys(decorators).length > 0 ? { ...el, decorators } : stripDecorators(el);
  });
}

function stripDecorators<T extends { decorators?: ComponentDecorators }>(el: T): T {
  const { decorators: _drop, ...rest } = el;
  return rest as T;
}
