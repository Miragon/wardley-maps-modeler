import type { LabelOffset } from '@miragon/wardley-schema-model';
import { ANCHOR_ICON_SIZE, COMPONENT_RADIUS } from './styles.js';
import type { WardleyShape } from '../model/di-types.js';
import type EvolutionGrid from '../evolution-grid/EvolutionGrid.js';

/**
 * Where the renderer puts component, anchor and evolve-target labels. Shared by the renderer and the
 * label-drag interaction so a dragged label lands exactly where the stored offset renders it.
 *
 * All positions are relative to the owning node's centre. An explicit OWM `label [dx, dy]` offset is
 * always relative to the canonical OWM slot (right of the circle, or centred above an anchor) — the
 * automatic placements below only apply while no offset is set, so imported OWM maps keep their look.
 */

export const LABEL_GAP = 7;
/** Rough average advance of a 13px/500 label glyph; the renderer never measures text (jsdom). */
export const LABEL_CHAR_WIDTH = 7.5;
/** Keeps the default label clear of the inertia bar (drawn right next to the circle). */
export const INERTIA_LABEL_SHIFT = 6;
export const LABEL_BASELINE_SHIFT = -4;
/** Second line (sourcing method) below a name label. */
export const LABEL_METHOD_LINE_SHIFT = 15;
export const LABEL_OFFSET_LIMIT = 200;

export type TextAnchor = 'start' | 'middle' | 'end';

export interface LabelPlacement {
  x: number;
  y: number;
  anchor: TextAnchor;
}

/** px from a component to its evolve target along the evolution axis (undefined without evolve). */
export function movementDeltaX(
  shape: WardleyShape,
  grid: Pick<EvolutionGrid, 'toCanvas'>,
): number | undefined {
  const movement = shape.movement;
  if (!movement) return undefined;
  const here = grid.toCanvas({ visibility: shape.visibility, evolution: shape.evolution });
  const there = grid.toCanvas({
    visibility: shape.visibility,
    evolution: movement.targetEvolution,
  });
  return there.x - here.x;
}

export function estimatedLabelWidth(text: string): number {
  return (text ?? '').length * LABEL_CHAR_WIDTH;
}

/** The canonical OWM slot of a component name — the origin of its `label [dx, dy]`. */
export function componentLabelSlot(): { x: number; y: number } {
  return { x: COMPONENT_RADIUS + LABEL_GAP, y: LABEL_BASELINE_SHIFT };
}

/**
 * A short rightward evolve would run the arrow, the target circle and the red target name into the
 * source name, so the source name moves to the left of its circle.
 */
export function isShortRightwardMovement(shape: WardleyShape, movementDeltaX: number): boolean {
  return (
    movementDeltaX > 0 &&
    movementDeltaX < estimatedLabelWidth(shape.wardleyLabel) + 2 * COMPONENT_RADIUS + 2 * LABEL_GAP
  );
}

/**
 * @param movementDeltaX px from the component to its evolve target (undefined without an evolve).
 */
export function componentLabelPlacement(
  shape: WardleyShape,
  movementDeltaX: number | undefined,
): LabelPlacement {
  const slot = componentLabelSlot();
  if (shape.labelOffset) {
    return {
      x: slot.x + shape.labelOffset.dx,
      y: slot.y + shape.labelOffset.dy,
      anchor: 'start',
    };
  }
  if (movementDeltaX !== undefined && isShortRightwardMovement(shape, movementDeltaX)) {
    return { x: -slot.x, y: slot.y, anchor: 'end' };
  }
  const inertiaShift = shape.decorators?.inertia ? INERTIA_LABEL_SHIFT : 0;
  return { x: slot.x + inertiaShift, y: slot.y, anchor: 'start' };
}

/** The canonical OWM slot of the evolve target name — the origin of the evolve's `label [dx, dy]`. */
export function movementLabelSlot(movementDeltaX: number): { x: number; y: number } {
  return { x: movementDeltaX + COMPONENT_RADIUS + LABEL_GAP, y: LABEL_BASELINE_SHIFT };
}

/** A leftward evolve puts the target name on the far side, away from the arrow. */
export function movementLabelPlacement(
  labelOffset: LabelOffset | undefined,
  movementDeltaX: number,
): LabelPlacement {
  const slot = movementLabelSlot(movementDeltaX);
  if (labelOffset) {
    return { x: slot.x + labelOffset.dx, y: slot.y + labelOffset.dy, anchor: 'start' };
  }
  if (movementDeltaX < 0) {
    return { x: movementDeltaX - COMPONENT_RADIUS - LABEL_GAP, y: slot.y, anchor: 'end' };
  }
  return { x: slot.x, y: slot.y, anchor: 'start' };
}

/** The canonical slot of an anchor name: centred above the person icon. */
export function anchorLabelSlot(): { x: number; y: number } {
  return { x: 0, y: -ANCHOR_ICON_SIZE / 2 + LABEL_BASELINE_SHIFT };
}

export function anchorLabelPlacement(shape: WardleyShape): LabelPlacement {
  const slot = anchorLabelSlot();
  return {
    x: slot.x + (shape.labelOffset?.dx ?? 0),
    y: slot.y + (shape.labelOffset?.dy ?? 0),
    anchor: 'middle',
  };
}

/** Integer px, clamped to ±LABEL_OFFSET_LIMIT; `undefined` when the label is back in its slot. */
export function normalizeLabelOffset(dx: number, dy: number): LabelOffset | undefined {
  const clamp = (value: number) =>
    Math.max(-LABEL_OFFSET_LIMIT, Math.min(LABEL_OFFSET_LIMIT, Math.round(value)));
  const offset = { dx: clamp(dx) || 0, dy: clamp(dy) || 0 };
  return offset.dx === 0 && offset.dy === 0 ? undefined : offset;
}
