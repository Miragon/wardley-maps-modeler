import type Canvas from 'diagram-js/lib/core/Canvas';
import { canvasSvg } from './canvasFocus.js';

/** Names the focusable canvas for assistive technology (it is otherwise an anonymous svg). */
export default function describeCanvas(canvas: Canvas): void {
  const svg = canvasSvg(canvas);
  if (!svg) return;
  svg.setAttribute('role', 'application');
  svg.setAttribute('aria-roledescription', 'Wardley map');
  svg.setAttribute('aria-label', 'Map canvas');
}
describeCanvas.$inject = ['canvas'];
