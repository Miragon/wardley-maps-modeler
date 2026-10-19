import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIRAGON } from '../src/theme/palette.js';
import { ATTITUDE_COLORS, COLORS, FONT, NOTE_COLORS } from '../src/draw/styles.js';

/**
 * Drift guard: `assets/wardley.css` reads the design-system roles only, and `MIRAGON` mirrors the
 * design-system tokens vendored in `theme/`. This test fails the moment the CSS declares a colour
 * of its own, the TS source of truth drifts or a partial re-copy of the vendored files diverges.
 * See the Miragon design system (the `miragon-brand:modeler-tool-design` skill; CLAUDE.md
 * § "Design system").
 */
const css = readFileSync(
  fileURLToPath(new URL('../src/assets/wardley.css', import.meta.url)),
  'utf8',
);

/**
 * Compare colours by meaning, not bytes: ignore hex case and `rgba(…)` whitespace (Prettier
 *  reformats the CSS, so a byte-exact match would be brittle). Real value drift still fails.
 */
function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every selector of every rule (the text in front of a `{`, split at the commas). */
function ruleSelectors(source: string): string[] {
  return [...withoutComments(source).matchAll(/([^{};]+)\{/g)].flatMap((match) =>
    match[1]!.split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')),
  );
}

/** The declarations of the first rule whose selector list ends with `selector`. */
function ruleBody(selector: string): string {
  const rule = new RegExp(`${escapeForRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(
    withoutComments(css),
  );
  return rule?.[1] ?? '';
}

describe('theme.sync — wardley.css takes every colour from the roles', () => {
  it('declares no colour literal: no hex, rgb() or hsl() value', () => {
    expect(withoutComments(css)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('reads only roles and mode-independent tokens; fixed colours only on the primary button', () => {
    // Guide §8: the primary button's fill is blue with white text in both modes.
    const PRIMARY_BUTTON_COLOURS = new Set(['--cd-blau', '--cd-blau-link', '--cd-weiss']);
    const rules = [...withoutComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    let tokenCount = 0;
    for (const [, selectors, body] of rules) {
      for (const [, token] of body!.matchAll(/var\((--[\w-]+)/g)) {
        tokenCount += 1;
        if (PRIMARY_BUTTON_COLOURS.has(token!)) {
          expect(selectors!.trim()).toMatch(/^\.wardley-button\[data-variant='primary'\]/);
          continue;
        }
        expect(token).toMatch(
          /^--cd-(ui-[\w-]+|shell-[\w-]+|radius-\w+|shadow-\d|ease(-out)?|motion-\w+)$/,
        );
      }
    }
    expect(tokenCount).toBeGreaterThan(20);
  });

  it('never renders the DSL `style` directive (guide §10.7: no navy surround)', () => {
    expect(
      ruleSelectors(css).filter((selector) => /wardley-(dark|colour|handwritten)/.test(selector)),
    ).toEqual([]);
    expect(withoutComments(css)).not.toMatch(/--wardley-/);
  });

  it('draws the dot grid in --cd-ui-linie at 1px (guide §10.1)', () => {
    expect(ruleBody('.wardley-container')).toMatch(
      /background-image:\s*radial-gradient\(var\(--cd-ui-linie\) 1px, transparent 1px\);/,
    );
    expect(ruleBody('.wardley-container')).toMatch(/background-color:\s*var\(--cd-ui-grund\);/);
  });

  it('marks hover and selection by the outline only, never by a filter (guide §10.4)', () => {
    expect(withoutComments(css)).not.toMatch(/brightness\(/);
    expect(ruleSelectors(css)).toContain('.wardley-container .djs-shape.hover > .djs-outline');
  });

  it('keeps its persistent canvas overlays at the editor layer, below the palette (guide §5.13)', () => {
    const zIndexOf = (selector: string) => Number(/z-index:\s*(\d+)/.exec(ruleBody(selector))?.[1]);
    expect(zIndexOf(".djs-palette.wardley-palette:where(:not([data-chrome='palette']))")).toBe(110);
    for (const overlay of [
      '.wardley-container .wardley-label-input',
      '.wardley-container .wardley-label-caption',
      '.wardley-container .wardley-map-resize-badge',
    ]) {
      expect(zIndexOf(overlay), overlay).toBeLessThanOrEqual(100);
    }
  });

  it('scopes every rule of its own palette away from the shell skin', () => {
    const paletteSelectors = ruleSelectors(css).filter((selector) =>
      /\.djs-palette(?![\w-])/.test(selector),
    );
    expect(paletteSelectors.length).toBeGreaterThan(5);
    for (const selector of paletteSelectors) {
      expect(selector).toMatch(
        /^\.djs-palette(\.wardley-palette)?:where\(:not\(\[data-chrome='palette'\]\)\)/,
      );
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
  });

  it('text colours reach 4.5:1 and structural strokes 3:1 on the plot and the paper', () => {
    for (const background of [MIRAGON.weiss, MIRAGON.grau]) {
      expect(contrast(COLORS.axisText, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(COLORS.noteText, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(COLORS.accelerator, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(COLORS.dependency, background)).toBeGreaterThanOrEqual(3);
      expect(contrast(COLORS.axis, background)).toBeGreaterThanOrEqual(3);
    }
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
