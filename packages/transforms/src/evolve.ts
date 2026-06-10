import type { Method, Movement, WardleyMap } from '@miragon/wardley-schema-model';
import { updateElement, compact } from './util.js';

export interface EvolveOptions {
  readonly newLabel?: string;
  readonly method?: Method;
}

/** Pure function — no undo stack (concept doc §4.3 / P3). */
export function evolveComponent(
  map: WardleyMap,
  componentId: string,
  targetEvolution: number,
  options: EvolveOptions = {},
): WardleyMap {
  if (targetEvolution < 0 || targetEvolution > 1) {
    throw new Error(`targetEvolution must be in [0,1], was ${targetEvolution}.`);
  }
  return updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') {
      throw new Error(`evolve only applies to components; "${componentId}" is ${el.elementType}.`);
    }
    // Evolution bewegt sich nur vorwaerts (Kanon): Ziel muss rechts der aktuellen Position liegen.
    if (targetEvolution <= el.position.evolution) {
      throw new Error(
        `targetEvolution (${targetEvolution}) muss rechts der aktuellen Evolution ` +
          `(${el.position.evolution}) liegen.`,
      );
    }
    const movement = compact({
      targetEvolution,
      newLabel: options.newLabel,
      method: options.method,
    }) as Movement;
    return { ...el, movement };
  });
}

export function clearMovement(map: WardleyMap, componentId: string): WardleyMap {
  return updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') return el;
    const { movement: _drop, ...rest } = el;
    return rest;
  });
}
