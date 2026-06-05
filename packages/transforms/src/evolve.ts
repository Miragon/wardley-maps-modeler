import type { Method, Movement, WardleyMap } from '@wardley/schema-model';
import { updateElement, compact } from './util.js';

export interface EvolveOptions {
  readonly newLabel?: string;
  readonly method?: Method;
}

/**
 * Setzt/aktualisiert eine geplante Evolution (evolve) auf einer Komponente.
 * Reine Funktion — kein Undo-Stack (Konzept §4.3 / P3).
 */
export function evolveComponent(
  map: WardleyMap,
  componentId: string,
  targetEvolution: number,
  options: EvolveOptions = {},
): WardleyMap {
  if (targetEvolution < 0 || targetEvolution > 1) {
    throw new Error(`targetEvolution muss in [0,1] liegen, war ${targetEvolution}.`);
  }
  return updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') {
      throw new Error(`evolve nur fuer Komponenten, "${componentId}" ist ${el.elementType}.`);
    }
    const movement = compact({
      targetEvolution,
      newLabel: options.newLabel,
      method: options.method,
    }) as Movement;
    return { ...el, movement };
  });
}

/** Entfernt eine geplante Evolution. */
export function clearMovement(map: WardleyMap, componentId: string): WardleyMap {
  return updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') return el;
    const { movement: _drop, ...rest } = el;
    return rest;
  });
}
