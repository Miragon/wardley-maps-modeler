/**
 * How names, texts and numbers are written into the DSL. Shared by the serializer and the parser:
 * the parser reads them the way the serializer will write them, so a second parse yields the same
 * model.
 */
import { rewriteOutsideFlowValues } from './lexer.js';

/** Types referenced BY THEIR NAME in the OWM DSL (edge endpoints + namespace). */
export const NAMED_TYPES: ReadonlySet<string> = new Set([
  'anchor',
  'component',
  'accelerator',
  'submap',
]);

function defaultName(type: string): string {
  switch (type) {
    case 'anchor':
      return 'User';
    case 'accelerator':
      return 'Accelerator';
    case 'submap':
      return 'Submap';
    case 'pipeline':
      return 'Pipeline';
    default:
      return 'Component';
  }
}

export function roundAsWritten(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const DIVISION_SLASH = '∕';
const FULLWIDTH_PLUS = '＋';
const FULLWIDTH_LEFT_BRACE = '｛';

/**
 * Comment markers would cut the line on the next parse, so they are written with U+2215 instead
 * of "/". `//` directly after ":" stays: the parser reads it as part of an address (`https://`).
 * So do markers inside a flow value `+'…'`, which the parser does not read as comments either.
 */
export function escapeCommentMarkers(text: string): string {
  return rewriteOutsideFlowValues(text, (part) =>
    part.replace(/\/\*/g, `${DIVISION_SLASH}*`).replace(/(?<!:)\/\//g, DIVISION_SLASH.repeat(2)),
  );
}

/** A text as it is written on one DSL line: line breaks become spaces, comment markers are escaped. */
export function writtenText(text: string): string {
  return escapeCommentMarkers(text.replace(/\r?\n/g, ' '));
}

/** Note texts keep their line breaks as a literal `\n`. */
export function writtenNoteText(text: string): string {
  return escapeCommentMarkers(text).replace(/\r?\n/g, '\\n');
}

/**
 * A name is written where a link line reads its names, so nothing in it may read as link syntax:
 * `->` becomes `→`, a `+` that would start a flow operator (`+>`, `+<`, `+'`) becomes `＋`, and a
 * leading `{` (which would open a pipeline block) becomes `｛`. An empty name gets the type's default.
 */
export function writtenName(label: string, elementType: string): string {
  const name = label
    .replace(/\r?\n/g, ' ')
    .replace(/->/g, '→')
    .replace(/\+(?=['<>])/g, FULLWIDTH_PLUS)
    .trim()
    .replace(/^\{/, FULLWIDTH_LEFT_BRACE);
  return escapeCommentMarkers(name) || defaultName(elementType);
}

/** Hands out names that are unique within the DSL: a repeated name gets a suffix (`Name 2`). */
export class UniqueNames {
  private readonly used = new Set<string>();

  claim(base: string): string {
    let name = base;
    let suffix = 2;
    while (this.used.has(name)) name = `${base} ${suffix++}`;
    this.used.add(name);
    return name;
  }
}
