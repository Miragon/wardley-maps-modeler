/**
 * Miragon design tokens — the single source of truth for every colour the renderer draws.
 *
 * Values mirror the Miragon design system — the `miragon-brand:modeler-tool-design` skill in
 * `Miragon/corporate-identity`, whose files are vendored unchanged next to this module
 * (`cd-tokens.generated.css`, `cd-tokens.generated.json`, `cd-canvas.css`; design system 1.13.0).
 * Re-copy them from the skill to update; never fork the hex values by hand. The SVG drawing needs
 * literal values (exports carry presentation attributes, never `var()`), so `draw/styles.ts`
 * derives the public `COLORS`/`FONT`/… from `MIRAGON`; the in-canvas chrome in
 * `assets/wardley.css` reads the `--cd-ui-*` roles directly. The unit test
 * `test/theme.sync.test.ts` fails if a `MIRAGON` value drifts from its `--cd-*` counterpart or the
 * CSS declares a colour of its own.
 *
 * Pure data — no DOM, no imports — so it stays inside the P1 DOM-free discipline.
 *
 * The renderer draws light only (the modelers switch to dark together, guide §13.3). Brand rule:
 * blue leads (`blau` — surfaces, buttons, links), green accents (`gruen` — key visual, highlights;
 * never body text on white).
 */

/** Raw Miragon brand ramp — exact `brand/tokens.json` values. */
export const MIRAGON = {
  /** Primary: surfaces, buttons, links, backgrounds. */
  blau: '#335DE5',
  /** Deeper blue for links / accent text on white (WCAG AA, ~5.5:1). */
  blauLink: '#2B50D4',
  /** Lightened blue for links / accents on dark surfaces. */
  blauHell: '#6B8AFF',
  /** Accent: key visual, highlights, one emphasised word. Bright — a fill, never text on white. */
  gruen: '#00E676',
  /** Calm neutral surface (warm off-white). */
  grau: '#F9F7F7',
  /** Text on light, monochrome logo. Not pure black. */
  schwarz: '#1D1D1D',
  weiss: '#FFFFFF',
  /**
   * Status layer (guide §3.3): the brand colours plus amber and red. Fills, borders, icons and
   * dots; as text on white only `danger` and `info` reach AA.
   */
  success: '#00E676',
  warning: '#FFB000',
  danger: '#CD1839',
  info: '#335DE5',
  /** UI grey (`--cd-linie`) for hairlines, guides and decorative borders. The CI allows no other greys. */
  linie: '#E6E2E2',
  /** Structural strokes that must stay visible (≥ 3:1 on white): axes, dependency edges. */
  kontur: '#8F8A8A',
  /** Secondary text (≥ 4.5:1 on white and on paper). */
  textLeise: '#6B6666',
  /** Dark base — the CI hero / nav-glass colour (rgb 8,10,32). The canvas never draws it. */
  navy: '#080A20',
  /** Signature brand gradient — hero, large surfaces, brand moments. Use verbatim. */
  gradientBrand: 'linear-gradient(120deg, #335DE5 30%, #00E676)',
} as const;
