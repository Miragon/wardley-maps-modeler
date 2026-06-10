import type { WardleyMap } from '@miragon/wardley-schema-model';
import { updateElement, findElement } from './util.js';

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

/**
 * Assigns a component to a pipeline: sets `pipelineId`, adopts the pipeline's
 * visibility (children sit ON the pipeline) and maintains its `childIds`.
 */
export function assignToPipeline(
  map: WardleyMap,
  componentId: string,
  pipelineId: string,
): WardleyMap {
  const pipeline = findElement(map, pipelineId);
  if (pipeline?.elementType !== 'pipeline') {
    throw new Error(`"${pipelineId}" is not a pipeline.`);
  }
  let next = updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') {
      throw new Error(
        `assignToPipeline only applies to components; "${componentId}" is ${el.elementType}.`,
      );
    }
    return {
      ...el,
      pipelineId,
      position: { ...el.position, visibility: pipeline.position.visibility },
    };
  });
  next = updateElement(next, pipelineId, (el) =>
    el.elementType === 'pipeline' && !el.childIds.includes(componentId)
      ? { ...el, childIds: [...el.childIds, componentId] }
      : el,
  );
  return next;
}

/** Removes a component's pipeline membership (including childIds maintenance). */
export function removeFromPipeline(map: WardleyMap, componentId: string): WardleyMap {
  const component = findElement(map, componentId);
  if (component?.elementType !== 'component' || !component.pipelineId) return map;
  const pipelineId = component.pipelineId;
  let next = updateElement(map, componentId, (el) => {
    if (el.elementType !== 'component') return el;
    const { pipelineId: _drop, ...rest } = el;
    return rest;
  });
  next = updateElement(next, pipelineId, (el) =>
    el.elementType === 'pipeline'
      ? { ...el, childIds: el.childIds.filter((id) => id !== componentId) }
      : el,
  );
  return next;
}

/** Derives the pipeline range from the maturities of its children (OWM v2). */
export function recomputePipelineRange(map: WardleyMap, pipelineId: string): WardleyMap {
  return updateElement(map, pipelineId, (el) => {
    if (el.elementType !== 'pipeline') {
      throw new Error(`recomputePipelineRange only applies to pipelines.`);
    }
    const maturities = el.childIds
      .map((id) => findElement(map, id))
      .filter((c) => c?.elementType === 'component')
      .map((c) => c!.position.evolution);
    if (!maturities.length) return el;
    const start = Math.min(...maturities);
    const end = Math.max(...maturities);
    return {
      ...el,
      evolutionStart: start,
      evolutionEnd: end > start ? end : Math.min(1, start + 0.05),
      position: { ...el.position, evolution: (start + end) / 2 },
    };
  });
}
