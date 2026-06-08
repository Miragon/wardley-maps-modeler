import type { ComponentDecorators, Method, WardleyMap } from '@miragon/wardley-schema-model';
import { updateElement, compact } from './util.js';

/** Sets (or clears with `undefined`) the sourcing method build/buy/outsource. */
export function setMethod(
  map: WardleyMap,
  componentId: string,
  method: Method | undefined,
): WardleyMap {
  return updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') {
      throw new Error(
        `setMethod only applies to components; "${componentId}" is ${el.elementType}.`,
      );
    }
    const decorators = compact({ ...el.decorators, method }) as ComponentDecorators;
    return Object.keys(decorators).length > 0 ? { ...el, decorators } : stripDecorators(el);
  });
}

function stripDecorators<T extends { decorators?: ComponentDecorators }>(el: T): T {
  const { decorators: _drop, ...rest } = el;
  return rest as T;
}
