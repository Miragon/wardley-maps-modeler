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

/**
 * Splits a line at the first `[a, b]` tuple: name before, suffix after.
 * Decorators/label offsets may then only be looked up in the suffix — parentheses or
 * words like "inertia" inside the name stay untouched.
 */
export function splitAtCoords(
  line: string,
): { name: string; coords: ParsedCoords; suffix: string } | null {
  const m = COORDS_RE.exec(line);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return {
    name: line.slice(0, m.index).trim(),
    coords: { a, b },
    suffix: line.slice(m.index + m[0].length),
  };
}

const COORDS4_RE = /\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/;

export interface ParsedCoords4 {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

/** Extracts an `[a, b, c, d]` tuple (OWM attitude form) — or null. */
export function parseCoords4(line: string): ParsedCoords4 | null {
  const m = COORDS4_RE.exec(line);
  if (!m) return null;
  const vals = [m[1], m[2], m[3], m[4]].map(Number);
  if (vals.some(Number.isNaN)) return null;
  return { a: vals[0]!, b: vals[1]!, c: vals[2]!, d: vals[3]! };
}

// `[^[\]]` (tuples cannot contain '[') + bounded whitespace keep the scan linear (ReDoS-safe).
const MULTI_COORDS_RE = /\[\s{0,8}(\[[^[\]]*\](?:\s{0,8},\s{0,8}\[[^[\]]*\])+)\s{0,8}\]/;

/** Extracts a tuple list `[[a,b],[c,d],…]` (OWM multi-position annotation) — or null. */
export function parseMultiCoords(line: string): { tuples: ParsedCoords[]; rest: string } | null {
  const m = MULTI_COORDS_RE.exec(line);
  if (!m) return null;
  const tuples: ParsedCoords[] = [];
  const inner = /\[\s{0,8}([-\d.]+)\s{0,8},\s{0,8}([-\d.]+)\s{0,8}\]/g;
  let t: RegExpExecArray | null;
  while ((t = inner.exec(m[1]!))) {
    const a = Number(t[1]);
    const b = Number(t[2]);
    if (!Number.isNaN(a) && !Number.isNaN(b)) tuples.push({ a, b });
  }
  if (!tuples.length) return null;
  return { tuples, rest: line.replace(MULTI_COORDS_RE, ' ') };
}

/**
 * Splits off a `//` line comment. Quote-aware (`+'http://x'>` stays untouched) and
 * URL-aware: `//` directly after `:` is a scheme separator (`url(https://…)`), not a comment.
 */
export function splitLineComment(line: string): { code: string; comment: string | null } {
  let inQuote = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (ch === "'") inQuote = !inQuote;
    else if (!inQuote && ch === '/' && line[i + 1] === '/' && line[i - 1] !== ':') {
      return { code: line.slice(0, i), comment: line.slice(i) };
    }
  }
  return { code: line, comment: null };
}

/** First occurrence of `needle` outside `'…'` quotes — or -1. */
export function indexOfOutsideQuotes(line: string, needle: string): number {
  let inQuote = false;
  for (let i = 0; i + needle.length <= line.length; i++) {
    const ch = line[i];
    if (ch === "'") {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && line.startsWith(needle, i)) return i;
  }
  return -1;
}

export interface InlineDecorators {
  readonly market?: boolean;
  readonly ecosystem?: boolean;
  readonly inertia?: boolean;
  readonly method?: Method;
}

const PAREN_RE = /\(([^()]*)\)/g;
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

const URL_REF_RE = /\burl\s{0,8}\(([^()]*)\)/i;

/**
 * Reads an optional `url(Name)` reference (OWM) and returns it plus the stripped line.
 *  MUST run before parseDecorators — otherwise the word "url" would remain as junk in the suffix.
 */
export function parseUrlRef(line: string): { urlRef: string | null; rest: string } {
  const m = URL_REF_RE.exec(line);
  if (!m) return { urlRef: null, rest: line };
  return { urlRef: m[1]!.trim() || null, rest: line.replace(URL_REF_RE, ' ') };
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
      .replace(/^_/, '')
      .replace(/_$/, '') || 'x'
  );
}
