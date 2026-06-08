import type { ComponentDecorators, WardleyMap } from '@miragon/wardley-schema-model';
import { updateElement, compact } from './util.js';

export function toggleInertia(map: WardleyMap, componentId: string): WardleyMap {
  return setInertia(map, componentId);
}

/** Sets the inertia flag explicitly (or toggles it when `value` is omitted). */
export function setInertia(map: WardleyMap, componentId: string, value?: boolean): WardleyMap {
  return updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') {
      throw new Error(`inertia only applies to components; "${componentId}" is ${el.elementType}.`);
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
