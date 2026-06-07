/**
 * Kleine, zeilenorientierte Helfer fuer die OWM-DSL (Konzept §7.4).
 * Die DSL ist zeilenbasiert; ein vollwertiger Tokenizer/Generator ist nicht noetig.
 */

import type { Method } from '@wardley/schema-model';

export interface ParsedCoords {
  readonly a: number;
  readonly b: number;
}

const COORDS_RE = /\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/;

/** Extrahiert das erste `[a, b]`-Tupel einer Zeile (oder null). Reihenfolge bleibt roh (a,b). */
export function parseCoords(line: string): ParsedCoords | null {
  const m = COORDS_RE.exec(line);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { a, b };
}

/** Entfernt das erste `[...]`-Tupel aus der Zeile. */
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
 * Liest Inline-Decorators einer Komponentenzeile:
 * - geklammert: `(market)`, `(ecosystem)`, `(build|buy|outsource)`, kombiniert `(market, outsource)`
 * - trailing keyword: `inertia`
 * Gibt die gefundenen Decorators und die um sie bereinigte Zeile zurueck.
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

  // trailing keyword `inertia` (ungeklammert)
  rest = rest.replace(/\binertia\b/i, () => {
    dec.inertia = true;
    return ' ';
  });

  return { decorators: dec, rest };
}

// Notiz-Farbe als (OWM-rückwärtskompatible) Erweiterung: `(color #rrggbb)` ODER `(color green)`.
// Bewusst nach den Koordinaten platziert -> der OWM-Parser ignoriert den Rest, statt ihn in den
// Notiztext zu ziehen. Akzeptiert Hex oder CSS-Farbnamen.
const COLOR_RE = /\(\s*color\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z][\w-]*)\s*\)/i;

/** Liest ein optionales `(color …)` und gibt die Farbe + um sie bereinigte Zeile zurueck. */
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

/** Liest ein optionales `label [dx, dy]` (Pixel-Offset) und gibt es + bereinigte Zeile zurueck. */
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

/** Erstes Wort (Keyword) einer Zeile in Kleinbuchstaben. */
export function keywordOf(line: string): string {
  const m = /^\s*([A-Za-z][\w-]*)/.exec(line);
  return m ? m[1]!.toLowerCase() : '';
}

/** Slugifiziert ein Label zu einem ID-Fragment. */
export function slug(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'x'
  );
}
