import ContextPad from 'diagram-js/lib/features/context-pad/ContextPad';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type { Element, ShapeLike } from 'diagram-js/lib/model/Types';
import { MOVEMENT_CLASS } from '../draw/index.js';

interface TargetBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** diagram-js internals this override relies on (not part of the published typings). */
interface ContextPadInternals {
  _canvas: Canvas;
  _current?: { html?: HTMLElement } | null;
  _getTargetBounds(target: Element | Element[]): TargetBounds;
}

/** Screen px between the target and the pad (diagram-js' CONTEXT_PAD_MARGIN at 100 %). */
const PAD_MARGIN = 8;
/** Pad width assumed before the pad is laid out: a component's pad (four 28px entries per row). */
const FALLBACK_PAD_WIDTH = 134;

/**
 * Anchors the pad to a node and its own label instead of the whole graphics group: an evolving
 * component's group also holds the evolve arrow, target circle and target name, which would push the
 * pad hundreds of pixels away from the node the user selected. When the evolve target lies where
 * the pad would open, the pad clears the whole movement instead — otherwise it would hide the target
 * circle, which is the evolve's drag handle.
 *
 * Overrides diagram-js's private `_getTargetBounds` (guarded by a browser test).
 */
export default class WardleyContextPad extends ContextPad {
  _getTargetBounds(target: Element | Element[]): TargetBounds {
    const elements = Array.isArray(target) ? target : [target];
    const nodeRects = elements.flatMap((element) => this.visualRects(element, 'node'));
    if (!nodeRects.length) {
      const base = ContextPad.prototype as unknown as ContextPadInternals;
      return base._getTargetBounds.call(this, target);
    }
    const nodeBounds = union(nodeRects);
    const padReach =
      nodeBounds.right + this.padWidth() + PAD_MARGIN * this.internals()._canvas.zoom();
    const movementRects = elements.flatMap((element) => this.visualRects(element, 'movement'));
    // Only the target circle and texts count: the evolve line itself starts inside the node.
    const movementUnderPad = elements
      .flatMap((element) => this.movementTargetRects(element))
      .some((rect) => rect.right > nodeBounds.right && rect.left < padReach);
    return movementUnderPad ? union([...nodeRects, ...movementRects]) : nodeBounds;
  }

  private internals(): ContextPadInternals {
    return this as unknown as ContextPadInternals;
  }

  private padWidth(): number {
    const width = this.internals()._current?.html?.getBoundingClientRect().width;
    return width || FALLBACK_PAD_WIDTH;
  }

  private movementTargetRects(element: Element): DOMRect[] {
    const graphics = this.internals()._canvas.getGraphics(element as unknown as ShapeLike);
    const targets = graphics?.querySelectorAll(
      `.djs-visual > .${MOVEMENT_CLASS} > :is(.wardley-evolve-handle, text)`,
    );
    return Array.from(targets ?? []).map((target) => target.getBoundingClientRect());
  }

  private visualRects(element: Element, part: 'node' | 'movement'): DOMRect[] {
    const graphics = this.internals()._canvas.getGraphics(element as unknown as ShapeLike);
    if (!graphics) return [];
    const children = Array.from(graphics.children).flatMap((child) =>
      child.classList.contains('djs-visual')
        ? Array.from(child.children).filter(
            (visual) => visual.classList.contains(MOVEMENT_CLASS) === (part === 'movement'),
          )
        : part === 'node'
          ? [child]
          : [],
    );
    return children
      .map((child) => child.getBoundingClientRect())
      .filter((rect) => rect.width > 0 || rect.height > 0);
  }
}

function union(rects: DOMRect[]): TargetBounds {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top };
}
