/**
 * Miragon design tokens — the single source of truth for every colour in the renderer.
 *
 * Values mirror the Miragon design system — the `miragon-brand:modeler-tool-design` skill in
 * `Miragon/corporate-identity` (its vendored `cd-tokens.generated.css` defines the `--cd-*`
 * variables, generated from `brand/tokens.json`). Re-copy from the skill to update; never fork the
 * hex values by hand. WHY this file exists: colours used to live in three
 * hand-duplicated places (the SVG `COLORS` object, the `--wardley-*` CSS variables, and the webapp's
 * own `:root`). Here they are declared once. `draw/styles.ts` derives the public `COLORS`/`FONT`/…
 * from `MIRAGON`; `assets/wardley.css` mirrors the `CHROME_VARS` / `DARK_MAP_VARS` maps (a unit test,
 * `test/theme.sync.test.ts`, fails if the CSS drifts).
 *
 * Pure data — no DOM, no imports — so it stays inside the P1 DOM-free discipline.
 *
 * There is one theme (the CI defines no dark theme). Brand rule: blue leads (`blau` — surfaces,
 * buttons, links), green accents (`gruen` — key visual, highlights; never body text on white).
 */

/** Raw Miragon brand ramp — exact `brand/tokens.json` values. */
export const MIRAGON = {
  /** Primary: surfaces, buttons, links, backgrounds. */
  blau: '#335DE5',
  /** Deeper blue for links / accent text on white (WCAG AA, ~5.5:1). */
  blauLink: '#2B50D4',
  /** Lightened blue for links / accents on dark surfaces (the opt-in "dark map"). */
  blauHell: '#6B8AFF',
  /** Accent: key visual, highlights, one emphasised word. Bright — a fill, never text on white. */
  gruen: '#00E676',
  /** Calm neutral surface (warm off-white). */
  grau: '#F9F7F7',
  /** Text on light, monochrome logo. Not pure black. */
  schwarz: '#1D1D1D',
  weiss: '#FFFFFF',
  /** Functional / status layer (own layer beside the brand palette; AA as text on white). */
  success: '#0B7A55',
  warning: '#92610A',
  danger: '#C92A2A',
  info: '#2B50D4',
  /** Dark base — the CI hero / nav-glass colour (rgb 8,10,32). Used only by the opt-in "dark map". */
  navy: '#080A20',
  /** Signature brand gradient — hero, large surfaces, brand moments. Use verbatim. */
  gradientBrand: 'linear-gradient(120deg, #335DE5 30%, #00E676)',
} as const;

/**
 * Chrome CSS variables (`--wardley-*`) authored in `assets/wardley.css`. The drift test keeps them in
 * sync. WHY a separate map from `COLORS`: chrome needs surface/brand/danger/shadow that the plot does
 * not, and only a subset of the canvas colours.
 */
export const CHROME_VARS: Record<string, string> = {
  '--wardley-paper': MIRAGON.grau,
  '--wardley-ink': MIRAGON.schwarz,
  '--wardley-ink-soft': '#5B5B5B',
  '--wardley-surface': MIRAGON.weiss,
  '--wardley-border': '#E6E2E2',
  '--wardley-accent': MIRAGON.blau,
  '--wardley-accent-soft': 'rgba(51, 93, 229, 0.12)',
  '--wardley-brand': MIRAGON.gruen,
  '--wardley-danger': MIRAGON.danger,
  '--wardley-shadow': 'rgba(29, 29, 29, 0.1)',
};

/**
 * The per-document `style dark` map directive (`.wardley-container.wardley-dark`) overrides only the
 * surround. This is the ONLY dark surface — there is no app-level dark mode. The plot stays "paper",
 * so exports stay stable.
 */
export const DARK_MAP_VARS: Record<string, string> = {
  '--wardley-paper': MIRAGON.navy,
};
