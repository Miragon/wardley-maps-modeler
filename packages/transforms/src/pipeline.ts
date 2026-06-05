import type { WardleyMap } from '@wardley/schema-model';
import { updateElement } from './util.js';

/** Setzt die Evolution-Range einer Pipeline. Invariante: end > start, beide in [0,1]. */
export function setPipelineRange(
  map: WardleyMap,
  pipelineId: string,
  start: number,
  end: number,
): WardleyMap {
  if (start < 0 || end > 1 || end <= start) {
    throw new Error(`Ungueltige Pipeline-Range [${start}, ${end}].`);
  }
  return updateElement(map, pipelineId, (el) => {
    if (el.elementType !== 'pipeline') {
      throw new Error(
        `setPipelineRange nur fuer Pipelines, "${pipelineId}" ist ${el.elementType}.`,
      );
    }
    return { ...el, evolutionStart: start, evolutionEnd: end };
  });
}
