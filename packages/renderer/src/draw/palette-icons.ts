import { COLORS, ATTITUDE_COLORS, FONT } from './styles.js';
import { ICON_PERSON } from './icons.js';

/**
 * Palette-Icons als Mini-Vorschau der TATSAECHLICHEN Canvas-Darstellung (WYSIWYG) — gleiche Farben
 * und Formen wie der WardleyRenderer, damit man in der Palette sieht, was erzeugt wird.
 */

const wrap = (inner: string): string =>
  `<svg width="24" height="24" viewBox="0 0 24 24" class="wardley-palette-svg">${inner}</svg>`;

const eventCircle = (extra = ''): string =>
  `<circle cx="12" cy="12" r="7" fill="${COLORS.componentFill}" stroke="${COLORS.stroke}" stroke-width="2"/>${extra}`;

const text = (content: string, attrs: string): string =>
  `<text x="12" text-anchor="middle" font-family="${FONT.family}" ${attrs}>${content}</text>`;

export const PALETTE_ICONS: Record<string, string> = {
  // Komponente = BPMN-Event-Kreis (weiss, 2px Tinte)
  component: wrap(eventCircle()),
  // Market = Event-Kreis + gefuellter Innenpunkt
  market: wrap(eventCircle(`<circle cx="12" cy="12" r="2.6" fill="${COLORS.stroke}"/>`)),
  // Ecosystem = Event-Kreis + innerer Ring
  ecosystem: wrap(
    eventCircle(
      `<circle cx="12" cy="12" r="4" fill="none" stroke="${COLORS.stroke}" stroke-width="1.5"/>`,
    ),
  ),
  // Anchor/User = Material-Person (wie drawAnchor)
  anchor: wrap(`<path d="${ICON_PERSON}" fill="${COLORS.ink}"/>`),
  // Pipeline = gestrichelte Teal-Band-Box (wie drawPipeline)
  pipeline: wrap(
    `<rect x="2" y="8" width="20" height="8" rx="3" fill="${COLORS.accentSoft}" stroke="${COLORS.pipeline}" stroke-width="1.5" stroke-dasharray="3 2"/>`,
  ),
  // Notiz = kursiver Text (wie drawNote) -> als Textzeilen angedeutet
  note: wrap(
    `<g stroke="${COLORS.noteText}" stroke-width="1.5" stroke-linecap="round"><line x1="5" y1="8" x2="19" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="16" x2="13" y2="16"/></g>`,
  ),
  // Annotation = nummerierter Marker (wie drawAnnotation)
  annotation: wrap(
    `<circle cx="12" cy="12" r="8" fill="#fff8e6" stroke="${COLORS.stroke}" stroke-width="1.25"/>` +
      text('1', `y="16" font-size="11" font-weight="700" fill="${COLORS.stroke}"`),
  ),
  // Accelerator / Deaccelerator = Chevrons (wie drawAccelerator)
  accelerator: wrap(text('»', `y="17.5" font-size="19" font-weight="700" fill="${COLORS.flow}"`)),
  deaccelerator: wrap(
    text('«', `y="17.5" font-size="19" font-weight="700" fill="${COLORS.movement}"`),
  ),
  // Submap = abgerundetes Quadrat mit innerem Quadrat (wie drawSubmap)
  submap: wrap(
    `<rect x="4" y="4" width="16" height="16" rx="3" fill="${COLORS.componentFill}" stroke="${COLORS.stroke}" stroke-width="2"/>` +
      `<rect x="7.5" y="7.5" width="9" height="9" rx="1.5" fill="none" stroke="${COLORS.stroke}" stroke-width="1"/>`,
  ),
};

/** Attitude-Band in der Farbe der jeweiligen Art (wie drawAttitude). */
export function attitudeIcon(kind: string): string {
  const c = ATTITUDE_COLORS[kind] ?? { fill: 'rgba(0,0,0,0.05)', stroke: '#666666' };
  return wrap(
    `<rect x="2" y="6" width="20" height="12" rx="3" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5" stroke-dasharray="3 2"/>`,
  );
}
