import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import { isComponent, isPipeline, type WardleyShape } from '../model/di-types.js';

interface Point {
  x: number;
  y: number;
}

export function centerOf(shape: WardleyShape): Point {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

export function pipelineContains(pipeline: WardleyShape, point: Point): boolean {
  return (
    point.x >= pipeline.x &&
    point.x <= pipeline.x + pipeline.width &&
    point.y >= pipeline.y &&
    point.y <= pipeline.y + pipeline.height
  );
}

export function allPipelines(registry: ElementRegistry): WardleyShape[] {
  return registry.filter((el) => isPipeline(el)) as WardleyShape[];
}

export function membersOf(registry: ElementRegistry, pipeline: WardleyShape): WardleyShape[] {
  return registry.filter(
    (el) => isComponent(el) && el.pipelineId === pipeline.id,
  ) as WardleyShape[];
}

/** The OWM anchor: the standalone component written under the pipeline's name. */
export function anchorComponentOf(
  registry: ElementRegistry,
  pipeline: WardleyShape,
): WardleyShape | undefined {
  return registry.find(
    (el) =>
      isComponent(el) && el.wardleyLabel === pipeline.wardleyLabel && el.pipelineId !== pipeline.id,
  ) as WardleyShape | undefined;
}

/** The pipeline a component anchors (same name, not one of its members). */
export function pipelineAnchoredBy(
  registry: ElementRegistry,
  component: WardleyShape,
): WardleyShape | undefined {
  if (!isComponent(component)) return undefined;
  return allPipelines(registry).find(
    (pipeline) =>
      pipeline.wardleyLabel === component.wardleyLabel && component.pipelineId !== pipeline.id,
  );
}

/** Everything that moves together with a pipeline box: its members and its anchor component. */
export function pipelineFollowers(
  registry: ElementRegistry,
  pipeline: WardleyShape,
): WardleyShape[] {
  const anchor = anchorComponentOf(registry, pipeline);
  return [...membersOf(registry, pipeline), ...(anchor ? [anchor] : [])];
}

/**
 * The pipeline a component would join when its centre sits at `point`. The pipeline it anchors is
 * never a candidate, and its current pipeline wins over overlapping boxes.
 */
export function pipelineAt(
  registry: ElementRegistry,
  component: WardleyShape,
  point: Point,
  excluded: ReadonlySet<unknown> = new Set(),
): WardleyShape | undefined {
  const candidates = allPipelines(registry).filter(
    (pipeline) =>
      !excluded.has(pipeline) &&
      pipeline.wardleyLabel !== component.wardleyLabel &&
      pipelineContains(pipeline, point),
  );
  return candidates.find((pipeline) => pipeline.id === component.pipelineId) ?? candidates[0];
}
