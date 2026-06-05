import type { ComponentDecorators, Method, WardleyMap } from '@wardley/schema-model';
import { updateElement, compact } from './util.js';

/** Setzt (oder entfernt mit `undefined`) die Beschaffungsmethode build/buy/outsource. */
export function setMethod(
  map: WardleyMap,
  componentId: string,
  method: Method | undefined,
): WardleyMap {
  return updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') {
      throw new Error(`setMethod nur fuer Komponenten, "${componentId}" ist ${el.elementType}.`);
    }
    const decorators = compact({ ...el.decorators, method }) as ComponentDecorators;
    return Object.keys(decorators).length > 0 ? { ...el, decorators } : stripDecorators(el);
  });
}

function stripDecorators<T extends { decorators?: ComponentDecorators }>(el: T): T {
  const { decorators: _drop, ...rest } = el;
  return rest as T;
}
