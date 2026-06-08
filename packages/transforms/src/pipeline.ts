import type { WardleyMap } from '@miragon/wardley-schema-model';
import { updateElement } from './util.js';

/** Invariant: end > start, both in [0,1]. */
export function setPipelineRange(
  map: WardleyMap,
  pipelineId: string,
  start: number,
  end: number,
): WardleyMap {
  if (start < 0 || end > 1 || end <= start) {
    throw new Error(`Invalid pipeline range [${start}, ${end}].`);
  }
  return updateElement(map, pipelineId, (el) => {
    if (el.elementType !== 'pipeline') {
      throw new Error(
        `setPipelineRange only applies to pipelines; "${pipelineId}" is ${el.elementType}.`,
      );
    }
    return { ...el, evolutionStart: start, evolutionEnd: end };
  });
}
