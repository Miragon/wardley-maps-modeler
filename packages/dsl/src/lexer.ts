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

/** Splits a line at the first `[a, b]` tuple, readable or not; `coords` is null when it is not. */
export function splitAtTuple(
  line: string,
): { before: string; tuple: string; coords: ParsedCoords | null; after: string } | null {
  const m = COORDS_RE.exec(line);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return {
    before: line.slice(0, m.index).trim(),
    tuple: m[0],
    coords: Number.isNaN(a) || Number.isNaN(b) ? null : { a, b },
    after: line.slice(m.index + m[0].length),
  };
}

/**
 * Splits a line at the first `[a, b]` tuple: name before, suffix after.
 * Decorators/label offsets may then only be looked up in the suffix — parentheses or
 * words like "inertia" inside the name stay untouched.
 */
export function splitAtCoords(
  line: string,
): { name: string; coords: ParsedCoords; suffix: string } | null {
  const split = splitAtTuple(line);
  if (!split?.coords) return null;
  return { name: split.before, coords: split.coords, suffix: split.after };
}

const COORDS4_RE = /\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/;

export interface ParsedCoords4 {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

export function splitAtCoords4(
  line: string,
): { before: string; coords: ParsedCoords4; after: string } | null {
  const m = COORDS4_RE.exec(line);
  if (!m) return null;
  const vals = [m[1], m[2], m[3], m[4]].map(Number);
  if (vals.some(Number.isNaN)) return null;
  return {
    before: line.slice(0, m.index).trim(),
    coords: { a: vals[0]!, b: vals[1]!, c: vals[2]!, d: vals[3]! },
    after: line.slice(m.index + m[0].length),
  };
}

// `[^[\]]` (tuples cannot contain '[') + bounded whitespace keep the scan linear (ReDoS-safe).
const TUPLE_LIST_RE = /\[\s{0,8}(\[[^[\]]*\](?:\s{0,8},\s{0,8}\[[^[\]]*\])*)\s{0,8}\]/;
const LIST_ENTRY_RE = /\[[^[\]]*\]/g;
const WHOLE_COORDS_RE = /^\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]$/;

export interface PositionsOnLine {
  readonly tuples: ParsedCoords[];
  readonly unreadable: string[];
  readonly before: string;
  readonly after: string;
}

function readTupleList(line: string, list: RegExpExecArray): PositionsOnLine {
  const tuples: ParsedCoords[] = [];
  const unreadable: string[] = [];
  for (const [entry] of list[1]!.matchAll(LIST_ENTRY_RE)) {
    const coords = WHOLE_COORDS_RE.exec(entry);
    const a = Number(coords?.[1]);
    const b = Number(coords?.[2]);
    if (coords && !Number.isNaN(a) && !Number.isNaN(b)) tuples.push({ a, b });
    else unreadable.push(entry);
  }
  return {
    tuples,
    unreadable,
    before: line.slice(0, list.index).trim(),
    after: line.slice(list.index + list[0].length),
  };
}

/** Reads the first tuple list `[[a,b], [c,d], …]` (OWM multi-position form) on a line — or null. */
export function parseMultiCoords(line: string): PositionsOnLine | null {
  const list = TUPLE_LIST_RE.exec(line);
  return list ? readTupleList(line, list) : null;
}

const FIRST_CHILD_TUPLE_RE = /\[\s*([-\d.]+)\s*(?:,\s*([-\d.]+)\s*)?\]/;

/**
 * Splits a pipeline block line at its first `[maturity]` or `[visibility, maturity]` tuple, so a
 * name may hold other brackets (`Store [old] [0.4]`). `values` are the numbers as written.
 */
export function splitAtFirstChildTuple(
  line: string,
): { before: string; values: string[]; after: string } | null {
  const m = FIRST_CHILD_TUPLE_RE.exec(line);
  if (!m) return null;
  return {
    before: line.slice(0, m.index).trim(),
    values: m[2] === undefined ? [m[1]!] : [m[1]!, m[2]],
    after: line.slice(m.index + m[0].length),
  };
}

/** Reads the first position on a line: a single `[a, b]` tuple or a tuple list, whichever comes first. */
export function parsePositions(line: string): PositionsOnLine | null {
  const single = COORDS_RE.exec(line);
  const list = TUPLE_LIST_RE.exec(line);
  if (list && (!single || list.index < single.index)) return readTupleList(line, list);
  if (!single) return null;
  const a = Number(single[1]);
  const b = Number(single[2]);
  const readable = !Number.isNaN(a) && !Number.isNaN(b);
  return {
    tuples: readable ? [{ a, b }] : [],
    unreadable: readable ? [] : [single[0]],
    before: line.slice(0, single.index).trim(),
    after: line.slice(single.index + single[0].length),
  };
}

/**
 * Index of the quote that closes a flow value `+'…'` opened at `at` — or -1. Only a quote directly
 * after "+" opens one, so an apostrophe in a name (`Bob's`) does not hide the comment after it.
 */
function flowValueEnd(line: string, at: number): number {
  return line[at] === "'" && line[at - 1] === '+' ? line.indexOf("'", at + 1) : -1;
}

/**
 * Rewrites the parts of a text outside its flow values `+'…'`, found exactly as the comment
 * stripper finds them, so that what the serializer escapes is what the parser would cut.
 */
export function rewriteOutsideFlowValues(text: string, rewrite: (part: string) => string): string {
  let rewritten = '';
  let partStart = 0;
  for (let i = 0; i < text.length; i++) {
    const valueEnd = flowValueEnd(text, i);
    if (valueEnd < 0) continue;
    rewritten += rewrite(text.slice(partStart, i)) + text.slice(i, valueEnd + 1);
    partStart = valueEnd + 1;
    i = valueEnd;
  }
  return rewritten + rewrite(text.slice(partStart));
}

/**
 * Index of the `//` that starts a line comment — or -1. Flow-value-aware (`+'http://x'>` stays
 * untouched) and URL-aware: `//` directly after `:` is a scheme separator (`url(https://…)`).
 */
function indexOfLineComment(line: string): number {
  for (let i = 0; i < line.length - 1; i++) {
    const valueEnd = flowValueEnd(line, i);
    if (valueEnd > 0) i = valueEnd;
    else if (line[i] === '/' && line[i + 1] === '/' && line[i - 1] !== ':') return i;
  }
  return -1;
}

/** Reads `<Name> [<address>]`, the text after the `url` keyword — or null. indexOf keeps it linear. */
export function readUrlDefinition(after: string): { name: string; address: string } | null {
  const open = after.indexOf('[');
  const close = after.lastIndexOf(']');
  const name = open > 0 ? after.slice(0, open).trim() : '';
  const address = open > 0 && close > open ? after.slice(open + 1, close).trim() : '';
  if (!name || !address || after.slice(close + 1).trim() !== '') return null;
  return { name, address };
}

function isUrlDefinition(line: string): boolean {
  return keywordOf(line) === 'url' && readUrlDefinition(line.trim().slice('url'.length)) !== null;
}

/**
 * Strips `//` and `/* … *\/` comments off source lines, tracking block comments across lines.
 * Returns the code part and the comment fragments (to keep them losslessly).
 */
export class CommentStripper {
  private inBlockComment = false;

  get insideBlockComment(): boolean {
    return this.inBlockComment;
  }

  strip(raw: string): { code: string; comments: string[] } {
    const comments: string[] = [];
    let working = raw;
    if (this.inBlockComment) {
      const close = working.indexOf('*/');
      if (close < 0) return { code: '', comments: [raw] };
      comments.push(working.slice(0, close + 2));
      working = working.slice(close + 2);
      this.inBlockComment = false;
    }
    // OWM exempts url lines from comment stripping, for the `//` in their address. Only a
    // definition holds an address; a link whose left name starts with "URL" is stripped as usual.
    const code = isUrlDefinition(working) ? working : this.stripComments(working, comments);
    return { code, comments };
  }

  /** Left to right, so a `/*` inside a `//` comment opens no block comment. */
  private stripComments(line: string, comments: string[]): string {
    let code = '';
    let rest = line;
    for (;;) {
      const lineComment = indexOfLineComment(rest);
      const open = indexOutsideFlowValues(rest, '/*');
      if (lineComment >= 0 && (open < 0 || lineComment < open)) {
        comments.push(rest.slice(lineComment));
        return code + rest.slice(0, lineComment);
      }
      if (open < 0) return code + rest;
      const close = rest.indexOf('*/', open + 2);
      if (close < 0) {
        comments.push(rest.slice(open));
        this.inBlockComment = true;
        return code + rest.slice(0, open);
      }
      comments.push(rest.slice(open, close + 2));
      code += `${rest.slice(0, open)} `;
      rest = rest.slice(close + 2);
    }
  }
}

function indexOutsideFlowValues(line: string, needle: string): number {
  for (let i = 0; i + needle.length <= line.length; i++) {
    const valueEnd = flowValueEnd(line, i);
    if (valueEnd > 0) i = valueEnd;
    else if (line.startsWith(needle, i)) return i;
  }
  return -1;
}

export interface InlineDecorators {
  readonly market?: boolean;
  readonly ecosystem?: boolean;
  readonly inertia?: boolean;
  readonly method?: Method;
}

export type MutableDecorators = {
  -readonly [Key in keyof InlineDecorators]: InlineDecorators[Key];
};

const PAREN_RE = /\(([^()]*)\)/g;
export const METHODS: ReadonlySet<string> = new Set(['build', 'buy', 'outsource']);

/**
 * Reads the inline decorators of a component line:
 * - parenthesized: `(market)`, `(ecosystem)`, `(build|buy|outsource)`, combined `(market, outsource)`
 * - trailing keyword: `inertia`
 * Returns the decorators found and the line stripped of them.
 *
 * @deprecated Kept for API compatibility; the parser no longer uses it. It reads every `( … )` group
 * and `inertia` anywhere on the line and lets the last method win, while `parseDSL` reads decorators
 * only after the coordinates and keeps the first method.
 */
export function parseDecorators(line: string): { decorators: InlineDecorators; rest: string } {
  const dec: MutableDecorators = {};
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

export interface TextSpan {
  readonly at: number;
  readonly text: string;
}

/** One piece of the text after a statement's coordinates; `at` is its offset in the scanned text. */
export type SuffixToken = TextSpan &
  (
    | { readonly kind: 'color'; readonly color: string }
    | { readonly kind: 'height'; readonly value: string }
    | { readonly kind: 'label'; readonly dx: string; readonly dy: string }
    | { readonly kind: 'url'; readonly ref: string }
    | { readonly kind: 'group'; readonly items: readonly TextSpan[] }
    | { readonly kind: 'inertia' }
    | { readonly kind: 'word' }
  );

// Color as an (OWM-backwards-compatible) extension: `(color #rrggbb)` OR `(color green)`.
// Deliberately placed after the coordinates -> the OWM parser ignores the rest instead of pulling
// it into the note text. Accepts hex or CSS color names.
const COLOR_SOURCE = String.raw`\(\s*color\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z][\w-]*)\s*\)`;
const HEIGHT_SOURCE = String.raw`\(\s{0,8}y\s{1,8}([^\s()]+)\s{0,8}\)`;
const LABEL_OFFSET_SOURCE = String.raw`label\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]`;
const COLOR_TOKEN_RE = new RegExp(COLOR_SOURCE, 'iy');
const HEIGHT_TOKEN_RE = new RegExp(HEIGHT_SOURCE, 'y');
const LABEL_TOKEN_RE = new RegExp(LABEL_OFFSET_SOURCE, 'iy');
const URL_TOKEN_RE = /url\s{0,8}\(([^()]*)\)/iy;
const GROUP_TOKEN_RE = /\(([^()]*)\)/y;
const INERTIA_TOKEN_RE = /inertia\b/iy;
const WORD_TOKEN_RE = /\(?[^\s(]*/y;

function matchAt(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

function groupItems(content: string, contentAt: number): TextSpan[] {
  const items: TextSpan[] = [];
  let itemStart = 0;
  for (const raw of content.split(',')) {
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) items.push({ at: contentAt + itemStart + leading, text });
    itemStart += raw.length + 1;
  }
  return items;
}

function readSuffixToken(text: string, at: number): SuffixToken {
  let m: RegExpExecArray | null;
  if ((m = matchAt(COLOR_TOKEN_RE, text, at))) {
    return { at, text: m[0], kind: 'color', color: m[1]! };
  }
  if ((m = matchAt(HEIGHT_TOKEN_RE, text, at))) {
    return { at, text: m[0], kind: 'height', value: m[1]! };
  }
  if ((m = matchAt(LABEL_TOKEN_RE, text, at))) {
    return { at, text: m[0], kind: 'label', dx: m[1]!, dy: m[2]! };
  }
  if ((m = matchAt(URL_TOKEN_RE, text, at))) {
    return { at, text: m[0], kind: 'url', ref: m[1]!.trim() };
  }
  if ((m = matchAt(GROUP_TOKEN_RE, text, at))) {
    return { at, text: m[0], kind: 'group', items: groupItems(m[1]!, at + 1) };
  }
  if ((m = matchAt(INERTIA_TOKEN_RE, text, at))) return { at, text: m[0], kind: 'inertia' };
  return { at, text: matchAt(WORD_TOKEN_RE, text, at)![0], kind: 'word' };
}

/**
 * Splits the text after a statement's coordinates into its suffixes: `(color …)`, `(y …)`,
 * `label [dx, dy]`, `url(…)`, other `( … )` groups, `inertia` and any other word.
 */
export function scanSuffix(text: string): SuffixToken[] {
  const tokens: SuffixToken[] = [];
  let at = 0;
  while (at < text.length) {
    if (/\s/.test(text[at]!)) {
      at++;
      continue;
    }
    const token = readSuffixToken(text, at);
    tokens.push(token);
    at += token.text.length;
  }
  return tokens;
}

const WHOLE_COLOR_GROUP_RE = new RegExp(`^${COLOR_SOURCE}$`, 'i');
const WHOLE_HEIGHT_GROUP_RE = new RegExp(`^${HEIGHT_SOURCE}$`);

/**
 * Splits trailing `(color …)` and `(y …)` groups off a text. Read from the end with indexOf, so a
 * word like "url" before them stays part of the text and long lines stay linear.
 */
export function splitTrailingGroups(
  text: string,
  kinds: { readonly color: boolean; readonly height: boolean },
): { rest: string; groups: string[] } {
  const groups: string[] = [];
  let end = text.trimEnd().length;
  while (text[end - 1] === ')') {
    const open = text.lastIndexOf('(', end - 1);
    const group = text.slice(Math.max(open, 0), end);
    const wanted =
      (kinds.color && WHOLE_COLOR_GROUP_RE.test(group)) ||
      (kinds.height && WHOLE_HEIGHT_GROUP_RE.test(group));
    if (open < 0 || !wanted) break;
    groups.push(group);
    end = open;
    while (end > 0 && /\s/.test(text[end - 1]!)) end--;
  }
  return { rest: text.slice(0, end), groups: groups.reverse() };
}

/** A `(color …)` directly at the start of the text (annotations write their text after it). */
export function splitLeadingColor(text: string): { color?: string; rest: string } {
  const start = text.length - text.trimStart().length;
  const m = matchAt(COLOR_TOKEN_RE, text, start);
  if (!m) return { rest: text };
  return { color: m[1]!, rest: text.slice(start + m[0].length) };
}

export interface LabelOffsetToken {
  readonly dx: number;
  readonly dy: number;
}

// The serializer writes numbers rounded to three decimals; beyond this magnitude that output
// switches to exponent notation or loses digits, so the value would not read back the same.
const MAX_UNCLAMPED_MAGNITUDE = 1e12;

/** Whether the model can hold the number unclamped (offsets, sizes) and write it back unchanged. */
export function isRoundTrippableNumber(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_UNCLAMPED_MAGNITUDE;
}

export function readUnclampedNumber(text: string): number | null {
  const value = Number(text);
  return isRoundTrippableNumber(value) ? value : null;
}

const LABEL_OFFSET_RE = new RegExp(String.raw`\b${LABEL_OFFSET_SOURCE}`, 'i');

/**
 * Reads an optional `label [dx, dy]` (pixel offset) and returns it plus the stripped line.
 * `unreadable` holds the matched text when a number in it cannot be read.
 */
export function parseLabelOffset(line: string): {
  labelOffset: LabelOffsetToken | null;
  rest: string;
  unreadable?: string;
} {
  const m = LABEL_OFFSET_RE.exec(line);
  if (!m) return { labelOffset: null, rest: line };
  const dx = readUnclampedNumber(m[1]!);
  const dy = readUnclampedNumber(m[2]!);
  const rest = line.replace(LABEL_OFFSET_RE, ' ');
  if (dx === null || dy === null) return { labelOffset: null, rest, unreadable: m[0] };
  return { labelOffset: { dx, dy }, rest };
}

// A keyword ends at a character that cannot continue a word, also a non-ASCII letter: `componentä`
// is an unknown statement, not a component named "ä".
const KEYWORD_RE = /^\s*([A-Za-z][\w-]*)(?![\w\p{L}\p{M}\p{N}-])/u;

/** First word (keyword) of a line, lowercased. */
export function keywordOf(line: string): string {
  const m = KEYWORD_RE.exec(line);
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
