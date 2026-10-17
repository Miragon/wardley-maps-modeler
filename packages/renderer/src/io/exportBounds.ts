import type Canvas from 'diagram-js/lib/core/Canvas';
import type { SvgBounds } from './saveSvg.js';

/** Name of the diagram-js layer the evolution grid draws its axes into. */
const AXES_LAYER = 'wardley-axes';

/** Small enough that the default axes stay inside the plot margins: the axis text has no halo. */
const AXES_PADDING = 4;

/** Covers what getBBox ignores, chiefly the label halo stroke. */
export const EXPORT_CONTENT_PADDING = 12;

interface OuterBoundsSource {
  outerBounds(): SvgBounds;
}

/**
 * The area an image export must cover: the plot frame plus everything drawn on the element layer
 * and the axes. Labels of commodity components (evolution near 1) and notes run past the plot's
 * right edge, so exporting only the plot frame crops them.
 */
export function exportBounds(
  canvas: Canvas,
  grid: OuterBoundsSource,
  padding = EXPORT_CONTENT_PADDING,
): SvgBounds {
  const boxes = [grid.outerBounds()];
  const content = drawnContentBox(canvas);
  if (content) {
    boxes.push({
      x: content.x - padding,
      y: content.y - padding,
      width: content.width + 2 * padding,
      height: content.height + 2 * padding,
    });
  }
  const axes = axesBox(canvas);
  if (axes) {
    boxes.push({
      x: axes.x - AXES_PADDING,
      y: axes.y - AXES_PADDING,
      width: axes.width + 2 * AXES_PADDING,
      height: axes.height + 2 * AXES_PADDING,
    });
  }

  const left = Math.floor(Math.min(...boxes.map((box) => box.x)));
  const top = Math.floor(Math.min(...boxes.map((box) => box.y)));
  const right = Math.ceil(Math.max(...boxes.map((box) => box.x + box.width)));
  const bottom = Math.ceil(Math.max(...boxes.map((box) => box.y + box.height)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The axes layer drawn by the evolution grid. Custom `y-axis` end labels and long `evolution`
 * stage names run past the fixed plot margins. Looked up in the DOM rather than via
 * `canvas.getLayer`, which would create the layer if it were missing.
 */
function axesBox(canvas: Canvas): SvgBounds | undefined {
  try {
    const axes = canvas
      .getContainer()
      .querySelector<SVGGraphicsElement>(`.viewport > .layer-${AXES_LAYER}`);
    if (!axes) return undefined;
    const { x, y, width, height } = axes.getBBox();
    return width === 0 && height === 0 ? undefined : { x, y, width, height };
  } catch {
    return undefined;
  }
}

/**
 * Union of the `.djs-visual` boxes in layer (= diagram) coordinates. Measuring the whole layer
 * would also count the invisible hit areas and selection outlines, which follow the estimated
 * shape size rather than the rendered text and would pad the export with empty space.
 */
function drawnContentBox(canvas: Canvas): SvgBounds | undefined {
  // The typings declare a CanvasLayer record, but diagram-js returns the layer's <g> itself.
  const layer = canvas.getActiveLayer() as unknown as SVGGraphicsElement | null;
  if (!layer) return undefined;
  try {
    const layerToScreen = layer.getCTM();
    if (!layerToScreen) return undefined;
    const screenToLayer = layerToScreen.inverse();

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const visual of layer.querySelectorAll<SVGGraphicsElement>('.djs-visual')) {
      const local = visual.getBBox();
      const visualToScreen = visual.getCTM();
      if ((local.width === 0 && local.height === 0) || !visualToScreen) continue;
      const toLayer = screenToLayer.multiply(visualToScreen);
      for (const [x, y] of [
        [local.x, local.y],
        [local.x + local.width, local.y],
        [local.x, local.y + local.height],
        [local.x + local.width, local.y + local.height],
      ] as const) {
        const layerX = toLayer.a * x + toLayer.c * y + toLayer.e;
        const layerY = toLayer.b * x + toLayer.d * y + toLayer.f;
        left = Math.min(left, layerX);
        top = Math.min(top, layerY);
        right = Math.max(right, layerX);
        bottom = Math.max(bottom, layerY);
      }
    }
    if (![left, top, right, bottom].every(Number.isFinite)) return undefined;
    return { x: left, y: top, width: right - left, height: bottom - top };
  } catch {
    // getBBox/getCTM are unavailable outside a rendering engine (jsdom); the plot frame alone is
    // still a correct, if tighter, export.
    return undefined;
  }
}
