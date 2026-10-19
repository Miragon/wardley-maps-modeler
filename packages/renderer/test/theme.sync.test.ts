import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHROME_VARS, DARK_MAP_AXIS_TEXT, DARK_MAP_VARS, MIRAGON } from '../src/theme/palette.js';
import { ATTITUDE_COLORS, COLORS, FONT, NOTE_COLORS } from '../src/draw/styles.js';

/**
 * Drift guard: `assets/wardley.css` hand-mirrors the `--wardley-*` chrome tokens declared once in
 * `theme/palette.ts`. This test fails the moment the CSS and the TS source of truth diverge, so the
 * "keep these in sync" contract is enforced instead of hoped for. See the Miragon design system
 * (the `miragon-brand:modeler-tool-design` skill; CLAUDE.md § "Design system").
 */
const css = readFileSync(
  fileURLToPath(new URL('../src/assets/wardley.css', import.meta.url)),
  'utf8',
);

/**
 * Pull `--name: value;` declarations out of the first CSS rule whose selector list contains
 * `selector` (tolerates combined lists like `a, b { … }`; assumes flat, un-nested token blocks).
 */
function readVars(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escaped}[^{}]*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`selector not found in wardley.css: ${selector}`);
  const vars: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]!] = norm(m[2]!);
  }
  return vars;
}

/**
 * Compare colours by meaning, not bytes: ignore hex case and `rgba(…)` whitespace (Prettier
 *  reformats the CSS, so a byte-exact match would be brittle). Real value drift still fails.
 */
function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

describe('theme.sync — wardley.css mirrors theme/palette.ts', () => {
  it(':root declares every chrome token with the source-of-truth value', () => {
    const root = readVars(':root');
    for (const [name, value] of Object.entries(CHROME_VARS)) {
      expect(root[name], `${name} in :root`).toBe(norm(value));
    }
  });

  it('the `style dark` map directive declares its tokens with the source-of-truth value', () => {
    /* The per-document `style dark` directive is the only dark surface (no app-level dark mode). */
    const dark = readVars(`.wardley-container.wardley-dark`);
    for (const [name, value] of Object.entries(DARK_MAP_VARS)) {
      expect(dark[name], `${name} in .wardley-dark`).toBe(norm(value));
    }
  });
});

const vendoredTokens = readFileSync(
  fileURLToPath(new URL('../src/theme/cd-tokens.generated.css', import.meta.url)),
  'utf8',
);
const vendoredCanvas = readFileSync(
  fileURLToPath(new URL('../src/theme/cd-canvas.css', import.meta.url)),
  'utf8',
);
const vendoredJsonText = readFileSync(
  fileURLToPath(new URL('../src/theme/cd-tokens.generated.json', import.meta.url)),
  'utf8',
);

interface VendoredTokens {
  $description: string;
  hell: Record<string, string>;
  dunkel: Record<string, string>;
  hochkontrast: { hell: Record<string, string>; dunkel: Record<string, string> };
  fest: Record<string, string>;
  shell: Record<string, string>;
}
const vendoredJson = JSON.parse(vendoredJsonText) as VendoredTokens;

/** The CSS without comments: what the browser parses. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** `--name: value;` of the rule whose selector list ends with `selector` in a vendored file. */
function vendoredVars(source: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  if (!block) throw new Error(`selector not found: ${selector}`);
  const vars: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]!] = norm(m[2]!);
  return vars;
}

function normalized(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, norm(value)]));
}

describe('theme.sync — the vendored files are complete, unchanged copies (design system 1.13.0)', () => {
  it('every file starts with the generated banner of the design system', () => {
    for (const source of [vendoredTokens, vendoredCanvas]) {
      expect(source).toMatch(/^\/\* AUTOMATISCH GENERIERT aus brand\/tokens\.json\./);
    }
    expect(vendoredJsonText.startsWith('{\n  "$description": "AUTOMATISCH GENERIERT')).toBe(true);
    expect(Object.keys(vendoredJson)).toEqual([
      '$description',
      'hell',
      'dunkel',
      'hochkontrast',
      'fest',
      'shell',
    ]);
  });

  it('the JSON `hell` roles equal the light roles of the CSS', () => {
    const root = vendoredVars(vendoredTokens, ':root');
    const light = vendoredVars(
      vendoredTokens,
      '[data-cd-theme="light"],\n[data-cd-theme="system"]',
    );
    expect(Object.keys(vendoredJson.hell).length).toBeGreaterThan(20);
    for (const [name, value] of Object.entries(vendoredJson.hell)) {
      expect(root[name], `${name} on :root`).toBe(norm(value));
    }
    expect(light).toEqual(normalized(vendoredJson.hell));
  });

  it('the JSON `dunkel` roles equal the dark roles of the CSS', () => {
    expect(vendoredVars(vendoredTokens, '[data-cd-theme="dark"]')).toEqual(
      normalized(vendoredJson.dunkel),
    );
  });

  it('the JSON `fest` and `shell` tokens equal the fixed tokens on :root', () => {
    const root = vendoredVars(vendoredTokens, ':root');
    for (const [name, value] of Object.entries({ ...vendoredJson.fest, ...vendoredJson.shell })) {
      expect(root[name], `${name} on :root`).toBe(norm(value));
    }
  });

  it('cd-canvas.css maps the diagram-js variables onto the roles', () => {
    expect(withoutComments(vendoredCanvas)).toMatch(
      /--bio-surface:\s*var\(--cd-ui-flaeche-hoch\);/,
    );
    expect(withoutComments(vendoredCanvas)).toMatch(/--lasso-fill-color:\s*transparent;/);
  });
});

/** `blauLink` -> `--cd-blau-link`; `null` for app-specific keys the CI does not define. */
function tokenFor(key: string): string | null {
  const name = `--cd-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(vendoredTokens);
  return match ? norm(match[1]!) : null;
}

/** WCAG 2.x contrast ratio of two opaque hex colours. */
function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((index) => {
      const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

describe('theme.sync — MIRAGON mirrors the vendored design-system tokens', () => {
  it('wardley.css loads the tokens (layered), diagram-js and cd-canvas (unlayered), in this order', () => {
    const imports = [...withoutComments(css).matchAll(/@import\s+([^;]+);/g)].map((match) =>
      match[1]!.trim().replace(/\s+/g, ' '),
    );
    expect(imports).toEqual([
      "'../theme/cd-tokens.generated.css' layer(wardley-tokens)",
      "'diagram-js/assets/diagram-js.css'",
      "'../theme/cd-canvas.css'",
    ]);
  });

  it('the status colours are the 1.13.0 status layer', () => {
    expect(MIRAGON.success).toBe(vendoredJson.fest['--cd-success']);
    expect(MIRAGON.warning).toBe(vendoredJson.fest['--cd-warning']);
    expect(MIRAGON.danger).toBe(vendoredJson.fest['--cd-danger']);
    expect(MIRAGON.info).toBe(vendoredJson.fest['--cd-info']);
  });

  it('every MIRAGON value with a --cd-* counterpart equals it', () => {
    const compared = Object.entries(MIRAGON).filter(([key]) => tokenFor(key) !== null);
    expect(compared.map(([key]) => key)).toEqual(
      expect.arrayContaining(['blau', 'gruen', 'success', 'linie', 'kontur', 'textLeise']),
    );
    for (const [key, value] of compared) {
      expect(norm(value), `MIRAGON.${key}`).toBe(tokenFor(key));
    }
  });

  it('canvas colours use the design-system mapping (§3.6, §10) instead of invented greys', () => {
    expect(COLORS.dependency).toBe(MIRAGON.kontur);
    expect(COLORS.axis).toBe(MIRAGON.kontur);
    expect(COLORS.grid).toBe(MIRAGON.linie);
    expect(COLORS.axisText).toBe(MIRAGON.textLeise);
    expect(COLORS.inkSoft).toBe(MIRAGON.textLeise);
    expect(CHROME_VARS['--wardley-ink-soft']).toBe(MIRAGON.textLeise);
    expect(CHROME_VARS['--wardley-border']).toBe(MIRAGON.linie);
  });

  it('text colours reach 4.5:1 and structural strokes 3:1 on the plot and the paper', () => {
    for (const background of [MIRAGON.weiss, MIRAGON.grau]) {
      expect(contrast(COLORS.axisText, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(COLORS.noteText, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(COLORS.accelerator, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(COLORS.dependency, background)).toBeGreaterThanOrEqual(3);
      expect(contrast(COLORS.axis, background)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(DARK_MAP_AXIS_TEXT, MIRAGON.navy)).toBeGreaterThanOrEqual(4.5);
  });

  it('the `style dark` map lifts the margin axis texts with a scoped !important override', () => {
    const rule =
      /\.wardley-container\.wardley-dark\s+\.layer-wardley-axes\s+\.wardley-axis-text\s*\{([^}]*)\}/.exec(
        css,
      );
    expect(rule, 'dark axis-text override in wardley.css').not.toBeNull();
    expect(norm(rule![1]!)).toBe(`fill:${norm(DARK_MAP_AXIS_TEXT)}!important;`);
  });

  it('keeps the notation status colours that 1.13.0 brightened: saved maps and exports keep theirs', () => {
    expect(COLORS.accelerator).toBe('#0B7A55');
    expect(COLORS.deaccelerator).toBe('#C92A2A');
    expect(COLORS.movement).toBe('#C92A2A');
    expect(ATTITUDE_COLORS['settlers']?.stroke).toBe('#92610A');
    expect(ATTITUDE_COLORS['townplanners']?.stroke).toBe('#0B7A55');
  });

  it('keeps the serialized note palette hex values stable', () => {
    expect(NOTE_COLORS.map((color) => color.value)).toEqual([
      '#0B7A55',
      '#92610A',
      '#C92A2A',
      '#2B50D4',
      '#0E8181',
      '#6A3DB8',
      '#C2185B',
      '#4A4A4A',
    ]);
  });
});

describe('theme.sync — the Geist family name matches the self-hosted font', () => {
  // @fontsource-variable/geist registers the face as 'Geist Variable'; a bare 'Geist' never matches.
  it('FONT.family starts with the fontsource family name', () => {
    expect(FONT.family.startsWith("'Geist Variable', 'Geist',")).toBe(true);
  });

  it('the .wardley-container font stack starts with the fontsource family name', () => {
    const block = /\.wardley-container\s*\{([^}]*)\}/.exec(css);
    expect(block).not.toBeNull();
    expect(norm(block![1]!)).toContain(`font-family:'geistvariable','geist',`);
  });
});
