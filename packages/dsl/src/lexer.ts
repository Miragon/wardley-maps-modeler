/**
 * Small, line-oriented helpers for the OWM DSL (concept doc §7.4).
 * The DSL is line-based; a full tokenizer/generator is not needed.
 */

import type { Method } from '@miragon/wardley-schema-model';

export interface ParsedCoords {
  readonly a: number;
  readonly b: number;
}

const COORDS_RE = /\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/;

/** Order stays raw (a, b). */
export function parseCoords(line: string): ParsedCoords | null {
  const m = COORDS_RE.exec(line);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { a, b };
}

export function stripCoords(line: string): string {
  return line.replace(COORDS_RE, ' ');
}

export interface InlineDecorators {
  readonly market?: boolean;
  readonly ecosystem?: boolean;
  readonly inertia?: boolean;
  readonly method?: Method;
}

const PAREN_RE = /\(([^)]*)\)/g;
const METHODS: ReadonlySet<string> = new Set(['build', 'buy', 'outsource']);

/**
 * Reads the inline decorators of a component line:
 * - parenthesized: `(market)`, `(ecosystem)`, `(build|buy|outsource)`, combined `(market, outsource)`
 * - trailing keyword: `inertia`
 * Returns the decorators found and the line stripped of them.
 */
export function parseDecorators(line: string): { decorators: InlineDecorators; rest: string } {
  const dec: {
    market?: boolean;
    ecosystem?: boolean;
    inertia?: boolean;
    method?: Method;
  } = {};
  let rest = line;

  rest = rest.replace(PAREN_RE, (_full, group: string) => {
    for (const rawToken of group.split(',')) {
      const token = rawToken.trim().toLowerCase();
      if (token === 'market') dec.market = true;
      else if (token === 'ecosystem') dec.ecosystem = true;
      else if (token === 'inertia') dec.inertia = true;
      else if (METHODS.has(token)) dec.method = token as Method;
    }
    return ' ';
  });

  // trailing keyword `inertia` (unparenthesized)
  rest = rest.replace(/\binertia\b/i, () => {
    dec.inertia = true;
    return ' ';
  });

  return { decorators: dec, rest };
}

// Note color as an (OWM-backwards-compatible) extension: `(color #rrggbb)` OR `(color green)`.
// Deliberately placed after the coordinates -> the OWM parser ignores the rest instead of pulling
// it into the note text. Accepts hex or CSS color names.
const COLOR_RE = /\(\s*color\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z][\w-]*)\s*\)/i;

export function parseColor(line: string): { color?: string; rest: string } {
  const m = COLOR_RE.exec(line);
  if (!m || !m[1]) return { rest: line };
  return { color: m[1], rest: line.replace(COLOR_RE, ' ') };
}

export interface LabelOffsetToken {
  readonly dx: number;
  readonly dy: number;
}

const LABEL_OFFSET_RE = /\blabel\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/i;

/** Reads an optional `label [dx, dy]` (pixel offset) and returns it plus the stripped line. */
export function parseLabelOffset(line: string): {
  labelOffset: LabelOffsetToken | null;
  rest: string;
} {
  const m = LABEL_OFFSET_RE.exec(line);
  if (!m) return { labelOffset: null, rest: line };
  const dx = Number(m[1]);
  const dy = Number(m[2]);
  const rest = line.replace(LABEL_OFFSET_RE, ' ');
  if (Number.isNaN(dx) || Number.isNaN(dy)) return { labelOffset: null, rest };
  return { labelOffset: { dx, dy }, rest };
}

/** First word (keyword) of a line, lowercased. */
export function keywordOf(line: string): string {
  const m = /^\s*([A-Za-z][\w-]*)/.exec(line);
  return m ? m[1]!.toLowerCase() : '';
}

export function slug(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'x'
  );
}
