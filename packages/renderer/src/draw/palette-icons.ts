/*! @miragon/wardley-renderer icon geometry: square-dashed-mouse-pointer, and spline drawn with a
 * straight segment. Lucide (lucide-static 1.59.0) @license ISC
 * Copyright (c) 2026 Lucide Icons and Contributors
 * Full notice: README.md of @miragon/wardley-renderer */
import { COLORS, ATTITUDE_COLORS, FONT } from './styles.js';
import { ICON_FAST_FORWARD, ICON_FAST_REWIND, ICON_PERSON } from './icons.js';

/**
 * Palette icons: the creating entries are a mini preview of the ACTUAL canvas rendering
 * (WYSIWYG) — same colors and shapes as the WardleyRenderer, so the palette shows what will be
 * created.
 */

const wrap = (inner: string): string =>
  `<svg width="24" height="24" viewBox="0 0 24 24" class="wardley-palette-svg">${inner}</svg>`;

/**
 * A Lucide outline icon (lucide-static 1.59.0, ISC, © Lucide Icons and Contributors) at the palette
 * tool size of guide §5.5 (20px, stroke 2): it draws in `currentColor`, so the chrome around the
 * entry decides the colour (hover, pressed tool, read-only).
 */
const toolIcon = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="wardley-palette-svg">${inner}</svg>`;

const LUCIDE_SQUARE_DASHED_MOUSE_POINTER =
  '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/>' +
  '<path d="M5 3a2 2 0 0 0-2 2"/>' +
  '<path d="M19 3a2 2 0 0 1 2 2"/>' +
  '<path d="M5 21a2 2 0 0 1-2-2"/>' +
  '<path d="M9 3h1"/>' +
  '<path d="M9 21h2"/>' +
  '<path d="M14 3h1"/>' +
  '<path d="M3 9v1"/>' +
  '<path d="M21 9v2"/>' +
  '<path d="M3 14v1"/>';

// Lucide's spline with a straight segment between its end points (guide §5.14, line-segment): the
// curve read as a telephone receiver at 20px.
const LINE_SEGMENT =
  '<circle cx="19" cy="5" r="2"/>' +
  '<circle cx="5" cy="19" r="2"/>' +
  '<path d="M6.5 17.5 17.5 6.5"/>';

const eventCircle = (extra = ''): string =>
  `<circle cx="12" cy="12" r="7" fill="${COLORS.componentFill}" stroke="${COLORS.stroke}" stroke-width="2"/>${extra}`;

const text = (content: string, attrs: string): string =>
  `<text x="12" text-anchor="middle" font-family="${FONT.family}" ${attrs}>${content}</text>`;

export const PALETTE_ICONS: Record<string, string> = {
  // The tools use the common Lucide icons of the Miragon modelers; the create glyphs keep the
  // notation colours because they preview the element.
  draw: toolIcon(LINE_SEGMENT),
  lasso: toolIcon(LUCIDE_SQUARE_DASHED_MOUSE_POINTER),
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
  // Sticky note with a folded corner (distinct from the hamburger menu glyph).
  note: wrap(
    `<g fill="none" stroke="${COLORS.noteText}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M5 4h14v11l-5 5H5z" fill="${COLORS.componentFill}"/><path d="M14 20v-5h5"/>` +
      `<line x1="8" y1="8.5" x2="16" y2="8.5"/><line x1="8" y1="12" x2="13" y2="12"/></g>`,
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

const ATTITUDE_INITIALS: Record<string, string> = {
  pioneers: 'P',
  settlers: 'S',
  townplanners: 'T',
};

/** Region glyph; the initial letter tells the three kinds apart without relying on colour. */
export function attitudeIcon(kind: string): string {
  const c = ATTITUDE_COLORS[kind] ?? { fill: COLORS.band, stroke: COLORS.dependency };
  const initial = ATTITUDE_INITIALS[kind] ?? '';
  return wrap(
    `<rect x="2" y="6" width="20" height="12" rx="3" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5" stroke-dasharray="3 2"/>` +
      text(initial, `y="15.3" font-size="9" font-weight="700" fill="${COLORS.ink}"`),
  );
}
