import type Canvas from 'diagram-js/lib/core/Canvas';
import { PLOT } from '../draw/styles.js';

/**
 * Serialisiert den aktuellen Canvas in eigenstaendiges SVG (Snapshot/Export).
 * Setzt eine feste viewBox auf die aeussere Plotbegrenzung, damit das Ergebnis unabhaengig
 * vom aktuellen Zoom/Scroll ist.
 */
export function saveSVG(canvas: Canvas): { svg: string } {
  const container = canvas.getContainer();
  const source = container.querySelector('svg');
  if (!source) throw new Error('Kein SVG im Canvas-Container gefunden.');

  const clone = source.cloneNode(true) as SVGSVGElement;

  const width = PLOT.marginLeft + PLOT.width + PLOT.marginRight;
  const height = PLOT.marginTop + PLOT.height + PLOT.marginBottom;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  // diagram-js setzt eine viewbox-Transformation am aeussersten Layer; fuer den statischen
  // Export neutralisieren wir Pan/Zoom, indem wir die viewBox (oben) die Geometrie bestimmen lassen.
  const viewport = clone.querySelector<SVGGElement>('.viewport');
  if (viewport) viewport.removeAttribute('transform');

  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: '<?xml version="1.0" encoding="utf-8"?>\n' + svg };
}
