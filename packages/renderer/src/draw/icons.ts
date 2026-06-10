import { append as svgAppend, attr as svgAttr, create as svgCreate } from 'tiny-svg';

/**
 * Embedded icon paths from Google Material Icons (Apache-2.0, © Google).
 * 24x24-viewBox paths. `drawIcon` renders them as SVG (renderer), `iconMarkup` as an HTML string
 * (palette/context pad/buttons) with `fill: currentColor` (color controllable via CSS).
 * Source: https://github.com/google/material-design-icons (Apache License 2.0).
 */

export const ICON_PERSON =
  'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z';
export const ICON_GROUP =
  'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z';

/** radio_button_unchecked — ring (component / event). */
export const ICON_CIRCLE =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z';
export const ICON_ARROW_FORWARD = 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z';
/** double_arrow — evolve. */
export const ICON_DOUBLE_ARROW = 'M15.5 5H11l5 7-5 7h4.5l5-7zM8.5 5H4l5 7-5 7h4.5l5-7z';
/** block — inertia (resistance to change). */
export const ICON_BLOCK =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z';
export const ICON_EDIT =
  'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
export const ICON_DELETE =
  'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';
/** close — remove evolve. */
export const ICON_CLOSE =
  'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
/** description — note. */
export const ICON_NOTE =
  'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z';
export const ICON_UNDO =
  'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z';
export const ICON_REDO =
  'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z';
/** data_object — JSON. */
export const ICON_DATA_OBJECT =
  'M4 7v2c0 .55-.45 1-1 1H2v2h1c.55 0 1 .45 1 1v2c0 1.65 1.35 3 3 3h1v-2H7c-.55 0-1-.45-1-1v-2c0-.84-.35-1.61-.92-2.18L4.85 12l.23-.82C5.65 10.61 6 9.84 6 9V7c0-.55.45-1 1-1h1V4H7C5.35 4 4 5.35 4 7zm16 3c-.55 0-1-.45-1-1V7c0-1.65-1.35-3-3-3h-1v2h1c.55 0 1 .45 1 1v2c0 .84.35 1.61.92 2.18l.23.82-.23.82c-.57.57-.92 1.34-.92 2.18v2c0 .55-.45 1-1 1h-1v2h1c1.65 0 3-1.35 3-3v-2c0-.55.45-1 1-1h1v-2h-1z';
/** code — DSL. */
export const ICON_CODE =
  'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z';
/** download — Export. */
export const ICON_DOWNLOAD = 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z';
/** share — share link. */
export const ICON_SHARE =
  'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z';
/** storefront — market decorator. */
export const ICON_STOREFRONT =
  'M21.9 8.89l-1.05-4.37c-.22-.9-1-1.52-1.91-1.52H5.05c-.9 0-1.69.63-1.9 1.52L2.1 8.89c-.24 1.02-.02 2.06.62 2.88.08.11.19.19.28.29V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6.94c.09-.09.2-.18.28-.28.64-.82.87-1.87.62-2.89zM13 5h1.96l.54 3.52c.09.62-.39 1.18-.99 1.18-.65 0-1.18-.55-1.18-1.18V5zm-5.5 0h1.5v3.52C9 9.32 8.45 10 7.7 10c-.62 0-1.13-.49-1.21-1.13L7.5 5zm-3 .49C5.42 5.36 5.53 5 5.89 5H7.5l-.5 3.69c-.08.6-.59 1.06-1.19 1.06-.66 0-1.18-.56-1.18-1.18l.07-.6L4.5 5.49zM19 19H5v-6.03c.08.01.15.03.23.03.85 0 1.62-.35 2.19-.91.58.57 1.36.91 2.24.91.85 0 1.61-.35 2.18-.89.58.55 1.36.89 2.24.89.81 0 1.59-.34 2.17-.9.58.56 1.35.9 2.2.9.08 0 .15-.02.23-.03V19z';
/** public — ecosystem decorator. */
export const ICON_PUBLIC =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z';
/** folder_open — open file. */
export const ICON_FOLDER_OPEN =
  'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z';
/** image — PNG/image. */
export const ICON_IMAGE =
  'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z';
/** note_add — new / clear. */
export const ICON_NEW =
  'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 14h-3v3h-2v-3H8v-2h3v-3h2v3h3v2zm-3-7V3.5L18.5 9H13z';
/** settings — gear (element settings / popup). */
export const ICON_SETTINGS =
  'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z';
/** palette — note color. */
export const ICON_PALETTE =
  'M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z';
/** place — annotation (marker). */
export const ICON_PLACE =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';
/** fast_forward — Accelerator. */
export const ICON_FAST_FORWARD = 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z';
/** fast_rewind — Deaccelerator. */
export const ICON_FAST_REWIND = 'M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z';
/** swap_horiz — toggle connection type (dependency <-> flow). */
export const ICON_SWAP_HORIZ =
  'M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z';
/** crop_landscape — attitude band (PST). */
export const ICON_CROP_LANDSCAPE =
  'M19 5H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 12H5V7h14v10z';
/** layers — submap (nested map). */
export const ICON_LAYERS =
  'M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z';
/** autorenew — cycle procurement method (build/buy/outsource). */
export const ICON_AUTORENEW =
  'M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z';
/** aspect_ratio — map size. */
export const ICON_ASPECT_RATIO =
  'M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z';
/** menu — hamburger (main menu). */
export const ICON_MENU = 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z';
/** add — append component. */
export const ICON_ADD = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z';
/** visibility — eye (show example). */
export const ICON_VISIBILITY =
  'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';

/** Draws a 24x24 icon as an SVG group centered on (cx, cy), scaled to `size`. */
export function drawIcon(
  path: string,
  cx: number,
  cy: number,
  size: number,
  fill: string,
): SVGElement {
  const g = svgCreate('g');
  const s = size / 24;
  svgAttr(g, {
    transform: `translate(${cx - size / 2}, ${cy - size / 2}) scale(${s})`,
    fill,
    stroke: 'none',
  });
  svgAppend(g, svgAttr(svgCreate('path'), { d: path }));
  return g;
}

/** Returns an icon as an HTML SVG string (for palette/context pad/buttons), color = currentColor. */
export function iconMarkup(path: string, size = 18): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
}
