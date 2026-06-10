import type Canvas from 'diagram-js/lib/core/Canvas';
import { PLOT } from '../draw/styles.js';

export interface SvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Serializes the current canvas into standalone SVG (snapshot/export).
 * `bounds` is the outer plot boundary (typically `EvolutionGrid.outerBounds()`), so that
 * maps enlarged via `config.size` are exported completely; if omitted, the default plot
 * area is used. Independent of the current zoom/scroll.
 */
export function saveSVG(canvas: Canvas, bounds?: SvgBounds): { svg: string } {
  const container = canvas.getContainer();
  const source = container.querySelector('svg');
  if (!source) throw new Error('No SVG found in the canvas container.');

  const clone = source.cloneNode(true) as SVGSVGElement;

  const box = bounds ?? {
    x: 0,
    y: 0,
    width: PLOT.marginLeft + PLOT.width + PLOT.marginRight,
    height: PLOT.marginTop + PLOT.height + PLOT.marginBottom,
  };
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  clone.setAttribute('width', String(box.width));
  clone.setAttribute('height', String(box.height));

  // diagram-js sets a viewbox transform on the outermost layer; for the static export we
  // neutralize pan/zoom by letting the viewBox (above) determine the geometry.
  const viewport = clone.querySelector<SVGGElement>('.viewport');
  if (viewport) viewport.removeAttribute('transform');

  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: '<?xml version="1.0" encoding="utf-8"?>\n' + svg };
}
