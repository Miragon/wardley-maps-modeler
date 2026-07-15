import { COLORS, ATTITUDE_COLORS, FONT } from './styles.js';
import { ICON_FAST_FORWARD, ICON_FAST_REWIND, ICON_PERSON } from './icons.js';

/**
 * Palette icons as a mini preview of the ACTUAL canvas rendering (WYSIWYG) — same colors
 * and shapes as the WardleyRenderer, so the palette shows what will be created.
 */

const wrap = (inner: string): string =>
  `<svg width="24" height="24" viewBox="0 0 24 24" class="wardley-palette-svg">${inner}</svg>`;

const eventCircle = (extra = ''): string =>
  `<circle cx="12" cy="12" r="7" fill="${COLORS.componentFill}" stroke="${COLORS.stroke}" stroke-width="2"/>${extra}`;

const text = (content: string, attrs: string): string =>
  `<text x="12" text-anchor="middle" font-family="${FONT.family}" ${attrs}>${content}</text>`;

export const PALETTE_ICONS: Record<string, string> = {
  // Draw tool: open zigzag polyline with the start point marked.
  draw: wrap(
    `<polyline points="3,18 8.5,7 14,14 21,4" fill="none" stroke="${COLORS.ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="3" cy="18" r="2.2" fill="${COLORS.componentFill}" stroke="${COLORS.ink}" stroke-width="1.4"/>`,
  ),
  // Selection tool: dashed lasso rectangle with a cursor arrow.
  lasso: wrap(
    `<rect x="3" y="3" width="13" height="13" rx="2" fill="none" stroke="${COLORS.ink}" stroke-width="1.5" stroke-dasharray="3 2.5"/>` +
      `<path d="M13.5 13.5l7 2.7-3 1.3-1.3 3z" fill="${COLORS.ink}"/>`,
  ),
  component: wrap(eventCircle()),
  // Canon: market = three dots in a triangle (like drawComponent).
  market: wrap(
    eventCircle(
      `<circle cx="12" cy="10" r="1.4" fill="${COLORS.stroke}"/>` +
        `<circle cx="10.2" cy="13.4" r="1.4" fill="${COLORS.stroke}"/>` +
        `<circle cx="13.8" cy="13.4" r="1.4" fill="${COLORS.stroke}"/>`,
    ),
  ),
  // Canon: ecosystem = dotted outer ring (like drawComponent).
  ecosystem: wrap(
    eventCircle(
      `<circle cx="12" cy="12" r="10" fill="none" stroke="${COLORS.stroke}" stroke-width="1.25" stroke-dasharray="1.5 3" stroke-linecap="round"/>`,
    ),
  ),
  anchor: wrap(`<path d="${ICON_PERSON}" fill="${COLORS.ink}"/>`),
  // Pipeline = ■ anchor on top, box with variant circles hanging below (Wardley notation).
  pipeline: wrap(
    `<rect x="9.5" y="2.5" width="5.5" height="5.5" fill="${COLORS.componentFill}" stroke="${COLORS.stroke}" stroke-width="1.5"/>` +
      `<rect x="2" y="10" width="20" height="9" rx="2" fill="none" stroke="${COLORS.pipeline}" stroke-width="1.25" stroke-dasharray="3 2"/>` +
      `<circle cx="7" cy="14.5" r="2.2" fill="${COLORS.componentFill}" stroke="${COLORS.stroke}" stroke-width="1.2"/>` +
      `<circle cx="17" cy="14.5" r="2.2" fill="${COLORS.componentFill}" stroke="${COLORS.stroke}" stroke-width="1.2"/>`,
  ),
  note: wrap(
    `<g stroke="${COLORS.noteText}" stroke-width="1.5" stroke-linecap="round"><line x1="5" y1="8" x2="19" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="16" x2="13" y2="16"/></g>`,
  ),
  annotation: wrap(
    `<circle cx="12" cy="12" r="8" fill="${COLORS.annotationFill}" stroke="${COLORS.stroke}" stroke-width="1.25"/>` +
      text('1', `y="16" font-size="11" font-weight="700" fill="${COLORS.stroke}"`),
  ),
  accelerator: wrap(`<path d="${ICON_FAST_FORWARD}" fill="${COLORS.accelerator}"/>`),
  deaccelerator: wrap(`<path d="${ICON_FAST_REWIND}" fill="${COLORS.deaccelerator}"/>`),
  submap: wrap(
    `<rect x="4" y="4" width="16" height="16" rx="3" fill="${COLORS.componentFill}" stroke="${COLORS.stroke}" stroke-width="2"/>` +
      `<rect x="7.5" y="7.5" width="9" height="9" rx="1.5" fill="none" stroke="${COLORS.stroke}" stroke-width="1"/>`,
  ),
};

export function attitudeIcon(kind: string): string {
  const c = ATTITUDE_COLORS[kind] ?? { fill: COLORS.band, stroke: COLORS.dependency };
  return wrap(
    `<rect x="2" y="6" width="20" height="12" rx="3" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5" stroke-dasharray="3 2"/>`,
  );
}
