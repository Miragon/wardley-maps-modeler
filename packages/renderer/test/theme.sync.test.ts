import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHROME_VARS, DARK_MAP_VARS } from '../src/theme/palette.js';

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
