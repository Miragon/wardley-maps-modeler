import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type { Injector } from 'didi';
import type PreviewSupport from 'diagram-js/lib/features/preview-support/PreviewSupport';
import type { Element, Shape } from 'diagram-js/lib/model/Types';
import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  remove as svgRemove,
} from 'tiny-svg';
import { translate } from 'diagram-js/lib/util/SvgTransformUtil';
import { isComponent, isPipeline, type WardleyShape } from '../model/di-types.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import {
  anchorComponentOf,
  centerOf,
  membersOf,
  pipelineAnchoredBy,
  pipelineAt,
  pipelineFollowers,
} from './pipelineMembership.js';

/** After diagram-js Move collected the selection (1500), before the preview is drawn (499). */
const COLLECT_FOLLOWERS_PRIORITY = 1400;
/** After diagram-js MovePreview built its drag group. */
const VERTICAL_PREVIEW_PRIORITY = 450;
/** After stage snapping (1500) and Move (500) settled the delta of this mouse move. */
const DROP_TARGET_PRIORITY = 400;
/** Before the constraint behavior clamps the delta of the extended closure (1000). */
const EXTEND_CLOSURE_PRIORITY = 1500;

const VERTICAL_PREVIEW_LAYER = 'wardley-pipeline-drag';
const VERTICAL_PREVIEW_LAYER_INDEX = 900;

export const DROP_TARGET_MARKER = 'wardley-drop-target';

interface MoveContext {
  shape?: unknown;
  shapes?: unknown[];
  pipelineVerticalPreview?: SVGElement;
  pipelineDropTarget?: WardleyShape;
}

interface RenameContext {
  element: WardleyShape;
  properties: Record<string, unknown>;
  renamedCounterpart?: WardleyShape;
}

interface MoveEvent {
  context: MoveContext;
  dx: number;
  dy: number;
}

interface MoveClosureLike {
  allShapes: Record<string, unknown>;
  topLevel: Record<string, unknown>;
  add(element: unknown, isTopLevel?: boolean): void;
}

/**
 * Makes a pipeline behave like a group (diagram-js AttachSupport pattern): dragging or nudging the
 * box carries its member components and its anchor component, dragging the anchor component shows
 * the box following vertically (the constraint behavior moves it on drop), and a dragged component
 * highlights the pipeline it would join.
 */
export default class PipelineGroupBehavior extends CommandInterceptor {
  static override $inject = ['eventBus', 'elementRegistry', 'canvas', 'injector'];

  constructor(
    eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
    private readonly canvas: Canvas,
    injector: Injector,
  ) {
    super(eventBus);
    const previewSupport = injector.get<PreviewSupport | null>('previewSupport', false);

    // A pipeline and its anchor component are one OWM pair, linked by their shared name: renaming
    // one renames the other in the same undo step, or the box silently stops following.
    this.preExecute('element.updateProperties', (event: { context: RenameContext }) => {
      const { context } = event;
      const element = context.element;
      const label = context.properties['wardleyLabel'];
      if (typeof label !== 'string' || label === element.wardleyLabel) return;
      const counterpart = isPipeline(element)
        ? anchorComponentOf(this.elementRegistry, element)
        : pipelineAnchoredBy(this.elementRegistry, element);
      if (counterpart) context.renamedCounterpart = counterpart;
    });
    this.postExecute('element.updateProperties', (event: { context: RenameContext }) => {
      const { context } = event;
      const counterpart = context.renamedCounterpart;
      const label = context.properties['wardleyLabel'];
      if (!counterpart || typeof label !== 'string' || counterpart.wardleyLabel === label) return;
      injector.get<WardleyModeling>('wardleyModeling').updateProperties(counterpart, {
        wardleyLabel: label,
      });
    });

    eventBus.on('shape.move.start', COLLECT_FOLLOWERS_PRIORITY, (event: MoveEvent) => {
      const { context } = event;
      context.shapes = this.withFollowers(context.shapes ?? []);
    });

    // Keyboard nudges and API moves never pass through shape.move.start.
    this.preExecuted(
      'elements.move',
      EXTEND_CLOSURE_PRIORITY,
      (event: { context: { closure?: MoveClosureLike } }) => {
        const closure = event.context.closure;
        if (!closure) return;
        for (const shape of Object.values(closure.allShapes)) {
          if (!isPipeline(shape)) continue;
          for (const follower of pipelineFollowers(this.elementRegistry, shape)) {
            if (!closure.allShapes[follower.id])
              closure.add(follower, !!closure.topLevel[shape.id]);
          }
        }
      },
    );

    if (previewSupport) {
      eventBus.on('shape.move.start', VERTICAL_PREVIEW_PRIORITY, (event: MoveEvent) => {
        const { context } = event;
        const carried = this.carriedVertically(context.shapes ?? []);
        if (!carried.length) return;
        const group = svgCreate('g');
        svgAttr(group, { class: 'djs-drag-group' });
        svgAppend(
          this.canvas.getLayer(VERTICAL_PREVIEW_LAYER, VERTICAL_PREVIEW_LAYER_INDEX),
          group,
        );
        for (const shape of carried) previewSupport.addDragger(shape as unknown as Element, group);
        context.pipelineVerticalPreview = group;
      });
    }

    eventBus.on('shape.move.move', DROP_TARGET_PRIORITY, (event: MoveEvent) => {
      const { context } = event;
      if (context.pipelineVerticalPreview) {
        translate(context.pipelineVerticalPreview, 0, event.dy);
      }
      this.markDropTarget(context, this.dropTargetFor(context, event.dx, event.dy));
    });

    eventBus.on('shape.move.cleanup', (event: MoveEvent) => {
      const { context } = event;
      if (context.pipelineVerticalPreview) {
        svgRemove(context.pipelineVerticalPreview);
        delete context.pipelineVerticalPreview;
      }
      this.markDropTarget(context, undefined);
    });
  }

  private withFollowers(shapes: unknown[]): unknown[] {
    const all = new Set<unknown>(shapes);
    for (const shape of shapes) {
      if (!isPipeline(shape)) continue;
      for (const follower of pipelineFollowers(this.elementRegistry, shape)) all.add(follower);
    }
    return [...all];
  }

  /** Pipelines (and their members) whose anchor component is dragged without them. */
  private carriedVertically(shapes: unknown[]): WardleyShape[] {
    const dragged = new Set(shapes);
    const carried: WardleyShape[] = [];
    for (const shape of shapes) {
      if (!isComponent(shape)) continue;
      const pipeline = pipelineAnchoredBy(this.elementRegistry, shape);
      if (!pipeline || dragged.has(pipeline)) continue;
      carried.push(
        pipeline,
        ...membersOf(this.elementRegistry, pipeline).filter((member) => !dragged.has(member)),
      );
    }
    return carried;
  }

  private dropTargetFor(context: MoveContext, dx: number, dy: number): WardleyShape | undefined {
    const shape = context.shape;
    if (!isComponent(shape) || pipelineAnchoredBy(this.elementRegistry, shape)) return undefined;
    const center = centerOf(shape);
    return pipelineAt(
      this.elementRegistry,
      shape,
      { x: center.x + dx, y: center.y + dy },
      new Set(context.shapes ?? []),
    );
  }

  private markDropTarget(context: MoveContext, target: WardleyShape | undefined): void {
    const previous = context.pipelineDropTarget;
    if (previous === target) return;
    if (previous) this.canvas.removeMarker(previous as unknown as Shape, DROP_TARGET_MARKER);
    if (target) this.canvas.addMarker(target as unknown as Shape, DROP_TARGET_MARKER);
    if (target) context.pipelineDropTarget = target;
    else delete context.pipelineDropTarget;
  }
}
