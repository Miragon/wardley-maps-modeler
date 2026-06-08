import type Canvas from 'diagram-js/lib/core/Canvas';
import { PLOT } from '../draw/styles.js';

/**
 * Serializes the current canvas into standalone SVG (snapshot/export).
 * Sets a fixed viewBox to the outer plot bounds so the result is independent of the
 * current zoom/scroll.
 */
export function saveSVG(canvas: Canvas): { svg: string } {
  const container = canvas.getContainer();
  const source = container.querySelector('svg');
  if (!source) throw new Error('No SVG found in the canvas container.');

  const clone = source.cloneNode(true) as SVGSVGElement;

  const width = PLOT.marginLeft + PLOT.width + PLOT.marginRight;
  const height = PLOT.marginTop + PLOT.height + PLOT.marginBottom;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  // diagram-js sets a viewbox transform on the outermost layer; for the static export we
  // neutralize pan/zoom by letting the viewBox (above) determine the geometry.
  const viewport = clone.querySelector<SVGGElement>('.viewport');
  if (viewport) viewport.removeAttribute('transform');

  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: '<?xml version="1.0" encoding="utf-8"?>\n' + svg };
}
