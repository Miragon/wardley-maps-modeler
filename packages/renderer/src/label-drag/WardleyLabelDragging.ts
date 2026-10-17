import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { LabelOffset, MapElement, Movement } from '@miragon/wardley-schema-model';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';
import type WardleyModeling from '../modeling/WardleyModeling.js';
import { isWardleyShape, type WardleyShape } from '../model/di-types.js';
import { focusCanvasWithoutRing } from '../a11y/index.js';
import {
  LABEL_HANDLE_CLASS,
  LABEL_ROLE_ATTRIBUTE,
  componentLabelPlacement,
  componentLabelSlot,
  movementDeltaX,
  movementLabelPlacement,
  movementLabelSlot,
  normalizeLabelOffset,
  type LabelPlacement,
} from '../draw/index.js';

/** Which offset a label writes: the node's own `label [dx, dy]` or its evolve line's. */
export type LabelRole = 'name' | 'movement';

/** Screen px the pointer must travel before a press on a label becomes a drag. */
const DRAG_THRESHOLD = 3;
/** A label dropped this close to its default slot snaps back and clears the offset. */
const SNAP_HOME_DISTANCE = 4;
const ARMED_CLASS = 'wardley-labels-draggable';
const DRAGGING_CLASS = 'wardley-label-dragging';

interface LabelDrag {
  shape: WardleyShape;
  role: LabelRole;
  startClient: { x: number; y: number };
  startOffset: LabelOffset;
  homeOffset: LabelOffset;
  originalOffset: LabelOffset | undefined;
  originalMovement: Movement | undefined;
  zoom: number;
  latest?: LabelOffset;
  dragging: boolean;
}

/**
 * OWM-style draggable labels: drag a component/anchor name or an evolve target name to store an
 * OWM `label [dx, dy]` offset (integers, clamped to ±200px) as ONE undoable command. A press without
 * movement selects the owner; double-click still edits the name.
 *
 * Reset paths: Alt+double-click on a label, dropping it back onto its default slot, or
 * `resetLabelOffset(shape, role)`.
 */
export default class WardleyLabelDragging {
  static $inject = [
    'eventBus',
    'canvas',
    'elementRegistry',
    'wardleyModeling',
    'selection',
    'evolutionGrid',
  ];

  private active: LabelDrag | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    private readonly modeling: WardleyModeling,
    private readonly selection: Selection,
    private readonly grid: EvolutionGrid,
  ) {
    const container = canvas.getContainer();
    this.outerContainer().classList.add(ARMED_CLASS);
    // Capture phase: diagram-js must neither start a move/lasso/pan nor open the label editor.
    container.addEventListener('mousedown', this.onMouseDown, true);
    container.addEventListener('dblclick', this.onDoubleClick, true);
    // Deleting the owner mid-drag (Delete/Backspace, an external import) ends the gesture, or the
    // release would put an invisible offset change on the undo stack.
    eventBus.on('shape.remove', ({ element }: { element: unknown }) => {
      if (this.active?.shape === element) this.cancel();
    });
    eventBus.on('diagram.destroy', () => {
      this.cancel();
      container.removeEventListener('mousedown', this.onMouseDown, true);
      container.removeEventListener('dblclick', this.onDoubleClick, true);
    });
  }

  /** Puts a label back into its default slot (undoable). */
  resetLabelOffset(shape: WardleyShape, role: LabelRole = 'name'): void {
    if (role === 'movement') {
      if (shape.movement?.labelOffset) this.commitMovementOffset(shape, undefined);
      return;
    }
    if (shape.labelOffset) this.commitNameOffset(shape, undefined);
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || this.outerContainer().classList.contains('wardley-draw-mode')) return;
    const target = this.labelTarget(event);
    if (!target) return;
    event.stopPropagation();
    event.preventDefault();
    // preventDefault keeps focus where it is; commit an open inline edit like any other click would,
    // and take focus to the canvas so Delete/Undo act on the map, not on a focused host input.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this.outerContainer().contains(focused)) focused.blur();
    focusCanvasWithoutRing(this.canvas);

    const { shape, role, handle } = target;
    const startOffset = this.renderedOffset(shape, role, handle);
    this.active = {
      shape,
      role,
      startClient: { x: event.clientX, y: event.clientY },
      startOffset,
      homeOffset: this.defaultOffset(shape, role, handle),
      originalOffset: shape.labelOffset,
      originalMovement: shape.movement,
      zoom: this.canvas.zoom(),
      dragging: false,
    };
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('keydown', this.onKeyDown, true);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const drag = this.active;
    if (!drag) return;
    const deltaX = event.clientX - drag.startClient.x;
    const deltaY = event.clientY - drag.startClient.y;
    if (!drag.dragging) {
      if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
      drag.dragging = true;
      this.outerContainer().classList.add(DRAGGING_CLASS);
    }
    drag.latest = {
      dx: Math.round(drag.startOffset.dx + deltaX / drag.zoom),
      dy: Math.round(drag.startOffset.dy + deltaY / drag.zoom),
    };
    this.preview(drag, drag.latest);
  };

  private readonly onMouseUp = (): void => {
    const drag = this.active;
    if (!drag) return;
    this.finish();
    // A plain press falls through to diagram-js's own click selection (incl. Shift to add).
    if (!drag.dragging || !drag.latest) return;
    if (this.elementRegistry.get(drag.shape.id) !== drag.shape) return;
    const next = this.snapHome(drag.latest, drag.homeOffset);
    const previous =
      drag.role === 'name' ? drag.originalOffset : drag.originalMovement?.labelOffset;
    if (!sameOffset(next, previous)) {
      if (drag.role === 'name') this.commitNameOffset(drag.shape, next);
      else this.commitMovementOffset(drag.shape, next);
    }
    this.suppressNextClick();
    this.selection.select(drag.shape);
  };

  /** The click that ends a drag would toggle the owner's selection off again. */
  private suppressNextClick(): void {
    const container = this.canvas.getContainer();
    const swallow = (event: MouseEvent) => event.stopPropagation();
    container.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => container.removeEventListener('click', swallow, true), 0);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.active) return;
    event.stopPropagation();
    this.cancel();
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (!event.altKey) return;
    const target = this.labelTarget(event);
    if (!target) return;
    event.stopPropagation();
    event.preventDefault();
    this.resetLabelOffset(target.shape, target.role);
  };

  private cancel(): void {
    if (this.active) this.finish();
  }

  /** Ends the gesture and restores the pre-drag state (commits run through the command stack). */
  private finish(): void {
    const drag = this.active;
    if (!drag) return;
    this.active = null;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.outerContainer().classList.remove(DRAGGING_CLASS);
    if (drag.dragging) {
      if (drag.originalOffset) drag.shape.labelOffset = drag.originalOffset;
      else delete drag.shape.labelOffset;
      if (drag.originalMovement) drag.shape.movement = drag.originalMovement;
      this.eventBus.fire('element.changed', { element: drag.shape });
    }
  }

  private preview(drag: LabelDrag, offset: LabelOffset): void {
    if (drag.role === 'name') drag.shape.labelOffset = offset;
    else if (drag.originalMovement) {
      drag.shape.movement = { ...drag.originalMovement, labelOffset: offset };
    }
    this.eventBus.fire('element.changed', { element: drag.shape });
  }

  private snapHome(offset: LabelOffset, home: LabelOffset): LabelOffset | undefined {
    const nearHome =
      Math.abs(offset.dx - home.dx) <= SNAP_HOME_DISTANCE &&
      Math.abs(offset.dy - home.dy) <= SNAP_HOME_DISTANCE;
    return nearHome ? undefined : normalizeLabelOffset(offset.dx, offset.dy);
  }

  private commitNameOffset(shape: WardleyShape, offset: LabelOffset | undefined): void {
    const properties: Record<string, unknown> = { labelOffset: offset };
    // The exporter falls back to the imported element's offset; clear it there too, or a reset
    // would come back on the next export.
    const imported = shape.businessObject as
      (MapElement & { labelOffset?: LabelOffset }) | undefined;
    if (!offset && imported?.labelOffset) {
      const { labelOffset: _clearedOffset, ...rest } = imported;
      properties['businessObject'] = rest;
    }
    this.modeling.updateProperties(shape, properties);
  }

  private commitMovementOffset(shape: WardleyShape, offset: LabelOffset | undefined): void {
    const movement = shape.movement;
    if (!movement) return;
    const { labelOffset: _previousOffset, ...rest } = movement;
    this.modeling.updateProperties(shape, {
      movement: offset ? { ...rest, labelOffset: offset } : rest,
    });
  }

  /**
   * The offset that reproduces the label exactly where it is drawn now, in the OWM frame (relative to
   * the canonical slot). Automatic placements (left of the circle, inertia shift) are converted so
   * the first drag doesn't make the label jump.
   */
  private renderedOffset(
    shape: WardleyShape,
    role: LabelRole,
    handle: SVGTextElement,
  ): LabelOffset {
    if (role === 'movement' && shape.movement?.labelOffset) return shape.movement.labelOffset;
    if (role === 'name' && shape.labelOffset) return shape.labelOffset;
    return this.defaultOffset(shape, role, handle);
  }

  /** The offset (OWM frame) of the label's automatic, offset-free position. */
  private defaultOffset(shape: WardleyShape, role: LabelRole, handle: SVGTextElement): LabelOffset {
    if (shape.wardleyType === 'anchor') return { dx: 0, dy: 0 };
    const deltaX = movementDeltaX(shape, this.grid);
    if (role === 'movement') {
      if (deltaX === undefined) return { dx: 0, dy: 0 };
      const placement = movementLabelPlacement(undefined, deltaX);
      return offsetFromPlacement(placement, movementLabelSlot(deltaX), handle, shape);
    }
    const withoutOffset = { ...shape, labelOffset: undefined } as unknown as WardleyShape;
    const placement = componentLabelPlacement(withoutOffset, deltaX);
    return offsetFromPlacement(placement, componentLabelSlot(), handle, shape);
  }

  private labelTarget(
    event: MouseEvent,
  ): { shape: WardleyShape; role: LabelRole; handle: SVGTextElement } | null {
    const handle = (event.target as Element | null)?.closest?.(`.${LABEL_HANDLE_CLASS}`);
    if (!(handle instanceof SVGTextElement)) return null;
    const id = handle.closest('[data-element-id]')?.getAttribute('data-element-id');
    const shape = id ? this.elementRegistry.get(id) : undefined;
    if (!isWardleyShape(shape)) return null;
    const role: LabelRole =
      handle.getAttribute(LABEL_ROLE_ATTRIBUTE) === 'movement' ? 'movement' : 'name';
    if (role === 'movement' && !shape.movement) return null;
    if (role === 'name' && shape.wardleyType !== 'component' && shape.wardleyType !== 'anchor') {
      return null;
    }
    return { shape, role, handle };
  }

  /** The `.wardley-container` the viewer mounts into (diagram-js renders into a child of it). */
  private outerContainer(): HTMLElement {
    const container = this.canvas.getContainer();
    return (container.closest('.wardley-container') as HTMLElement | null) ?? container;
  }
}

/**
 * Explicit offsets render start-anchored at `slot + offset`, so an end-anchored automatic label is
 * converted via its measured left edge (only possible in the browser, hence not in the renderer).
 */
function offsetFromPlacement(
  placement: LabelPlacement,
  slot: { x: number; y: number },
  handle: SVGTextElement,
  shape: WardleyShape,
): LabelOffset {
  const centerX = shape.width / 2;
  const left = placement.anchor === 'end' ? handle.getBBox().x - centerX : placement.x;
  return { dx: Math.round(left - slot.x), dy: Math.round(placement.y - slot.y) };
}

function sameOffset(a: LabelOffset | undefined, b: LabelOffset | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.dx === b.dx && a.dy === b.dy;
}
