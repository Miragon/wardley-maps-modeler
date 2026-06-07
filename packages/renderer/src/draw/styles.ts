/** Zentrale Rendering-Konstanten (Geometrie, Farben, Typografie) — Aesthetik "Strategic Blueprint". */

/** Default-Plotflaeche in diagram-px (Innenraum ohne Achsenraender). Zur Laufzeit via config.size aenderbar. */
export const PLOT = {
  width: 1080,
  height: 680,
  marginLeft: 66,
  marginTop: 38,
  marginRight: 44,
  marginBottom: 58,
} as const;

/** Minimal-/Default-Plotgroesse fuer "Map vergroessern/verkleinern". */
export const PLOT_MIN = { width: 480, height: 320 } as const;

/** Bounding-Box-Kantenlaenge eines Komponenten-/Anchor-Knotens (px) — BPMN-Event-Maße. */
export const NODE_SIZE = 34;
/** Komponenten-Kreis im BPMN-Event-Stil (sauberer Kreis, duenner Rand). */
export const COMPONENT_RADIUS = 15;
/** Innerer Ring fuer "evolving" (Intermediate-Event-Look). */
export const COMPONENT_INNER_RADIUS = 12;
/** Anchor wird als User-Icon gezeichnet; Icongroesse. */
export const ANCHOR_ICON_SIZE = 26;
export const PIPELINE_HEIGHT = 30;

/** Zeilenhoehe einer (mehrzeiligen) Notiz in px. */
export const NOTE_LINE_HEIGHT = 17;
const NOTE_PAD_X = 8;
const NOTE_PAD_Y = 6;
// Grobe, bewusst etwas grosszuegige Zeichenbreite (13px Spline Sans) — die Hitbox soll den Text
// sicher abdecken (lieber etwas zu breit als zu schmal). Keine DOM-Messung -> deterministisch
// (gilt auch fuer Import/Export/Headless).
const NOTE_CHAR_W = 7.5;

/**
 * Box-Masse einer Notiz aus ihrem (ggf. mehrzeiligen) Text. Die Notiz-Shape wird damit so gross
 * wie ihr Text -> die Move-/Klick-Hitbox waechst mit (statt fixer 34px). Mindestmass = NODE_SIZE.
 */
export function noteMetrics(label: string): { lines: string[]; width: number; height: number } {
  const lines = (label && label.length ? label : 'note').split('\n');
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  return {
    lines,
    width: Math.max(NODE_SIZE, Math.round(maxLen * NOTE_CHAR_W) + NOTE_PAD_X * 2),
    height: Math.max(NODE_SIZE, lines.length * NOTE_LINE_HEIGHT + NOTE_PAD_Y * 2),
  };
}

export const COLORS = {
  paper: '#fbfaf7',
  ink: '#1b1b1a',
  inkSoft: '#3a3a37',
  axis: '#cdc7bb',
  axisText: '#8c8475',
  grid: '#ebe7de',
  band: 'rgba(27,27,26,0.022)',
  stroke: '#1b1b1a',
  componentFill: '#ffffff',
  anchorFill: '#1b1b1a',
  dependency: '#a9a296',
  accent: '#0e7c74',
  accentSoft: 'rgba(14,124,116,0.12)',
  flow: '#0e7c74',
  movement: '#bf2f2a',
  inertia: '#1b1b1a',
  noteText: '#4a4640',
  pipeline: '#1b1b1a',
} as const;

/**
 * Notiz-Farbpalette (bpmn.io-artiger Mini-Picker; bewusst KEIN Full-Color-Picker). Werte sind
 * Hex und werden 1:1 als CSS-Farbe gerendert bzw. in der DSL als `(color …)` serialisiert.
 * Konvention (auch im Wardley-Mapping-Skill genutzt): grün = gut, rot = Problem/Risiko,
 * amber = beobachten, blau = Info, lila = Idee, slate = neutral.
 */
export const NOTE_COLORS = [
  { id: 'green', name: 'Green · good', value: '#15803d' },
  { id: 'amber', name: 'Amber · watch', value: '#b45309' },
  { id: 'red', name: 'Red · problem', value: '#b91c1c' },
  { id: 'blue', name: 'Blue · info', value: '#1d4ed8' },
  { id: 'teal', name: 'Teal', value: '#0e7c74' },
  { id: 'purple', name: 'Purple · idea', value: '#7e22ce' },
  { id: 'pink', name: 'Pink', value: '#be185d' },
  { id: 'slate', name: 'Slate · neutral', value: '#475569' },
] as const;

/** Farben der Attitude-Regionen je Art (geteilt von Renderer + Palette-Icons). */
export const ATTITUDE_COLORS: Record<string, { fill: string; stroke: string }> = {
  pioneers: { fill: 'rgba(14,124,116,0.07)', stroke: '#0e7c74' },
  settlers: { fill: 'rgba(180,131,30,0.08)', stroke: '#b4831e' },
  townplanners: { fill: 'rgba(120,53,170,0.07)', stroke: '#7835aa' },
};

export const FONT = {
  /**
   * Wird als `font-family`-Attribut DIREKT auf allen SVG-Text-Elementen gesetzt (Canvas-Labels,
   * Achsen-/Stage-Text und folglich auch im SVG-Export) – nicht von einem CSS-Container vererbt.
   * Greift in JEDEM Kontext auf die self-hostete 'Spline Sans Variable', sofern der Konsument sie
   * bereitstellt; andernfalls (z. B. standalone geoeffnetes Export-SVG) fallback-sicher auf System-Sans.
   * Die Library liefert die Schrift NICHT mit – Konsumenten müssen sie selbst einbinden
   * (z. B. via @fontsource-variable/spline-sans), siehe README.
   */
  family:
    "'Spline Sans Variable', 'Spline Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  label: 13,
  axis: 12,
  stage: 12,
} as const;
