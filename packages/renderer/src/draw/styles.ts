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
