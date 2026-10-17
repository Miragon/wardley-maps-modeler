import type { MapEdge, MapElement, WardleyMap } from '@miragon/wardley-schema-model';
import { CommentStripper } from './lexer.js';
import { roundAsWritten } from './names.js';
import { parseDSL, parseDSLWithSourceMap, widenEmptyRange, type SourceMap } from './parser.js';
import { serializeDSL, serializeKeyedLines, type KeyedLine } from './serializer.js';

/**
 * How `patchDSL` produced its text: `patched` rewrote only the changed statements, `rewritten`
 * rewrote every statement in place (comments, blank lines and order kept), `serialized` fell back
 * to `serializeDSL`, `unchanged` returned the original text because the map could not be
 * serialized at all.
 */
export type PatchOutcome = 'patched' | 'rewritten' | 'serialized' | 'unchanged';

/**
 * Writes `map` back into `originalText`, the text it was read from, and keeps everything the edit
 * did not touch verbatim: comments, blank lines, line order, number formatting, unknown lines and
 * the line breaks. Changed statements are rewritten in place the way `serializeDSL` writes them,
 * removed ones are deleted and new ones are inserted after the last statement of their kind. The
 * result always reads back as the same map as `serializeDSL(map)`; when a patch cannot guarantee
 * that, the result is `serializeDSL(map)` itself, in the line break style of the source. Never
 * throws.
 */
export function patchDSL(
  originalText: string,
  map: WardleyMap,
  options: PatchOptions = {},
): string {
  return patchDSLWithOutcome(originalText, map, options).text;
}

export interface PatchOptions {
  /**
   * The map `originalText` was last written from, in the caller's ids. An editor that keeps the
   * ids of its first read (instead of re-reading every patched text) passes it, so an element
   * renamed twice is still recognised: the re-read text derives its id from the first new name.
   */
  readonly previous?: WardleyMap;
}

/** `patchDSL`, also telling how the text was produced. */
export function patchDSLWithOutcome(
  originalText: string,
  map: WardleyMap,
  options: PatchOptions = {},
): { readonly text: string; readonly outcome: PatchOutcome } {
  const original = typeof originalText === 'string' ? originalText : '';
  let canonical: string;
  try {
    canonical = serializeDSL(map);
  } catch {
    return { text: original, outcome: 'unchanged' };
  }
  try {
    const expected = fingerprint(parseDSL(canonical));
    const source = readSource(original);
    const edited = alignToSource(source.map, map, options.previous);
    for (const mode of ['minimal', 'rewrite'] as const) {
      const text = patchLines(source, edited, mode);
      if (text !== null && fingerprint(parseDSL(text)) === expected) {
        return { text, outcome: mode === 'minimal' ? 'patched' : 'rewritten' };
      }
    }
    return { text: withLineBreaksOf(source, canonical), outcome: 'serialized' };
  } catch {
    return { text: canonical, outcome: 'serialized' };
  }
}

interface SourceLine {
  /** Without its line break. */
  readonly text: string;
  /** Empty for a last line without one. */
  readonly lineBreak: string;
}

interface LineShape {
  readonly indent: string;
  /** The statement part, trimmed: no indentation, no comment. */
  readonly code: string;
  /** The end of a block comment the line starts in (up to its `*\/`), or empty. */
  readonly commentHead: string;
  /** Whitespace and comment after the code, or empty. */
  readonly commentTail: string;
  /** Whether the code can be replaced without touching the comments. */
  readonly editable: boolean;
  readonly endsInBlockComment: boolean;
}

interface Source {
  readonly lines: readonly SourceLine[];
  readonly shapes: readonly LineShape[];
  readonly map: WardleyMap;
  readonly sourceMap: SourceMap;
  readonly lineBreak: string;
  readonly endsWithLineBreak: boolean;
}

function readSource(text: string): Source {
  const lines = splitLines(text);
  const parsed = parseDSLWithSourceMap(text);
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  return {
    lines,
    shapes: shapeLines(lines),
    map: parsed.map,
    sourceMap: parsed.sourceMap,
    lineBreak: crlf > lf ? '\r\n' : '\n',
    endsWithLineBreak: text === '' || text.endsWith('\n'),
  };
}

/** Splits like the parser: at `\n` or `\r\n`; the break ending the last line starts no new one. */
function splitLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const lineBreaks = /\r?\n/g;
  let start = 0;
  for (let match = lineBreaks.exec(text); match; match = lineBreaks.exec(text)) {
    lines.push({ text: text.slice(start, match.index), lineBreak: match[0] });
    start = match.index + match[0].length;
  }
  if (start < text.length) lines.push({ text: text.slice(start), lineBreak: '' });
  return lines;
}

function withoutTrailingCarriageReturns(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 13) end--;
  return text.slice(0, end);
}

function shapeLines(lines: readonly SourceLine[]): LineShape[] {
  const comments = new CommentStripper();
  return lines.map(({ text }) => {
    const raw = withoutTrailingCarriageReturns(text);
    const startsInBlockComment = comments.insideBlockComment;
    let fragments = comments.strip(raw).comments;
    let rest = raw;
    let commentHead = '';
    let commentTail = '';
    let editable = true;
    if (startsInBlockComment) {
      // A statement after the end of a block comment is editable; the comment part stays verbatim.
      const head = fragments[0];
      if (head?.endsWith('*/') && raw.startsWith(head)) {
        commentHead = head;
        rest = raw.slice(head.length);
        fragments = fragments.slice(1);
      } else {
        editable = false;
      }
    }
    let codePart = rest;
    if (editable && fragments.length) {
      const comment = fragments[0]!;
      if (fragments.length > 1 || !rest.endsWith(comment)) {
        editable = false;
      } else {
        const beforeComment = rest.slice(0, rest.length - comment.length);
        codePart = beforeComment.trimEnd();
        commentTail = beforeComment.slice(codePart.length) + comment;
      }
    }
    return {
      indent: /^\s*/.exec(codePart)![0],
      code: codePart.trim(),
      commentHead,
      commentTail,
      editable,
      endsInBlockComment: comments.insideBlockComment,
    };
  });
}

function withLineBreaksOf(source: Source, text: string): string {
  if (source.lines.length === 0) return text;
  const withBreaks = source.lineBreak === '\n' ? text : text.replace(/\n/g, source.lineBreak);
  return source.endsWithLineBreak ? withBreaks : withBreaks.replace(/\r?\n$/, '');
}

// --- Matching the edited map to the statements of the source -----------------------------------

function identityOf(el: MapElement): string {
  switch (el.elementType) {
    case 'annotation':
      return `annotation\0${el.number}`;
    case 'attitude':
      return `attitude\0${el.kind}`;
    default:
      return `${el.elementType}\0${el.label}`;
  }
}

function edgeIdentityOf(edge: MapEdge): string {
  return `${edge.edgeType}\0${edge.from}\0${edge.to}`;
}

/**
 * Pairs the elements of `edited` with the source statements they continue: same id and name, then
 * the pairing `hint` (same kind), then same name, then same id. Returns edited id -> source id.
 */
function matchElements(
  source: WardleyMap,
  edited: WardleyMap,
  hint: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  const unmatchedSource = new Map(source.elements.map((el) => [el.id, el]));
  const idByEditedId = new Map<string, string>();
  const claim = (editedId: string, sourceId: string) => {
    idByEditedId.set(editedId, sourceId);
    unmatchedSource.delete(sourceId);
  };
  const unclaimed = () => edited.elements.filter((el) => !idByEditedId.has(el.id));
  for (const el of edited.elements) {
    const same = unmatchedSource.get(el.id);
    if (same && identityOf(same) === identityOf(el)) claim(el.id, el.id);
  }
  for (const el of unclaimed()) {
    const hinted = hint.get(el.id);
    const candidate = hinted === undefined ? undefined : unmatchedSource.get(hinted);
    if (candidate?.elementType === el.elementType) claim(el.id, candidate.id);
  }
  // The name outranks a bare id: a modeler that keeps the ids of its first read holds ids that
  // the re-read text has since given to other statements (rename "Tea", then add a new "Tea").
  const sourceIdsByIdentity = new Map<string, string[]>();
  for (const el of unmatchedSource.values()) {
    const ids = sourceIdsByIdentity.get(identityOf(el)) ?? [];
    ids.push(el.id);
    sourceIdsByIdentity.set(identityOf(el), ids);
  }
  for (const el of unclaimed()) {
    const match = sourceIdsByIdentity.get(identityOf(el))?.shift();
    if (match !== undefined) claim(el.id, match);
  }
  for (const el of unclaimed()) {
    if (unmatchedSource.get(el.id)?.elementType === el.elementType) claim(el.id, el.id);
  }
  return idByEditedId;
}

/**
 * Gives every element and edge of the edited map the id of the source statement it continues (see
 * `matchElements`; `previous` supplies the hint), so keys line up with the source lines, and puts
 * them in source order. New ones keep their id, made unique against the source ids.
 */
function alignToSource(
  source: WardleyMap,
  edited: WardleyMap,
  previous: WardleyMap | undefined,
): WardleyMap {
  const hint = previous ? matchElements(source, previous) : undefined;
  const idByEditedId = matchElements(source, edited, hint);
  const usedIds = new Set([...source.elements.map((el) => el.id), ...idByEditedId.values()]);
  const freshId = (id: string): string => {
    let candidate = id;
    for (let suffix = 2; usedIds.has(candidate); suffix++) candidate = `${id}~${suffix}`;
    usedIds.add(candidate);
    return candidate;
  };
  for (const el of edited.elements) {
    if (!idByEditedId.has(el.id)) idByEditedId.set(el.id, freshId(el.id));
  }
  const rename = (id: string): string => idByEditedId.get(id) ?? id;
  const elements = edited.elements.map((el): MapElement => {
    const renamed = { ...el, id: rename(el.id) } as MapElement;
    if (renamed.elementType === 'component' && renamed.pipelineId !== undefined) {
      return { ...renamed, pipelineId: rename(renamed.pipelineId) };
    }
    if (renamed.elementType === 'pipeline') {
      return { ...renamed, childIds: renamed.childIds.map(rename) };
    }
    return renamed;
  });
  const edges = alignEdges(
    source.edges,
    edited.edges.map((edge) => ({ ...edge, from: rename(edge.from), to: rename(edge.to) })),
  );
  return {
    ...edited,
    elements: inSourceOrder(elements, source.elements),
    edges: inSourceOrder(edges, source.edges),
  };
}

function alignEdges(sourceEdges: readonly MapEdge[], editedEdges: readonly MapEdge[]): MapEdge[] {
  const unmatchedSource = new Map(sourceEdges.map((edge) => [edge.id, edge]));
  const idByIndex = new Map<number, string>();
  const claim = (index: number, id: string) => {
    idByIndex.set(index, id);
    unmatchedSource.delete(id);
  };
  editedEdges.forEach((edge, index) => {
    const same = unmatchedSource.get(edge.id);
    if (same && edgeIdentityOf(same) === edgeIdentityOf(edge)) claim(index, edge.id);
  });
  editedEdges.forEach((edge, index) => {
    if (idByIndex.has(index)) return;
    const match = [...unmatchedSource.values()].find(
      (candidate) => edgeIdentityOf(candidate) === edgeIdentityOf(edge),
    );
    if (match) claim(index, match.id);
  });
  editedEdges.forEach((edge, index) => {
    if (idByIndex.has(index)) return;
    if (unmatchedSource.get(edge.id)?.edgeType === edge.edgeType) claim(index, edge.id);
  });
  const usedIds = new Set([...sourceEdges.map((edge) => edge.id), ...idByIndex.values()]);
  return editedEdges.map((edge, index) => {
    let id = idByIndex.get(index);
    if (id === undefined) {
      id = edge.id;
      for (let suffix = 2; usedIds.has(id); suffix++) id = `${edge.id}~${suffix}`;
      usedIds.add(id);
    }
    return { ...edge, id };
  });
}

function inSourceOrder<T extends { readonly id: string }>(
  items: readonly T[],
  sourceItems: readonly { readonly id: string }[],
): T[] {
  const sourceIndex = new Map(sourceItems.map((item, index) => [item.id, index]));
  const position = (item: T) => sourceIndex.get(item.id) ?? Number.POSITIVE_INFINITY;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => position(a.item) - position(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

// --- Planning the edit --------------------------------------------------------------------------

type Mode = 'minimal' | 'rewrite';
type Status = 'same' | 'changed' | 'deleted';

const isRawKey = (key: string) => key.startsWith('raw:');

function keyedTexts(lines: readonly KeyedLine[]): Map<string, string> {
  return new Map(lines.filter((line) => !isRawKey(line.key)).map((line) => [line.key, line.text]));
}

function listsByLine<T>(lineCount: number): T[][] {
  return Array.from({ length: lineCount }, () => []);
}

/** The rawPassthrough indexes of `before` that `after` no longer holds, and the entries it adds. */
function diffPassthrough(
  before: readonly KeyedLine[],
  after: readonly KeyedLine[],
): { removed: Set<number>; added: KeyedLine[] } {
  const remainingByText = new Map<string, number[]>();
  for (const line of before.filter((entry) => isRawKey(entry.key))) {
    const indexes = remainingByText.get(line.text) ?? [];
    indexes.push(Number(line.key.slice('raw:'.length)));
    remainingByText.set(line.text, indexes);
  }
  const added: KeyedLine[] = [];
  for (const line of after.filter((entry) => isRawKey(entry.key))) {
    if (remainingByText.get(line.text)?.shift() === undefined) added.push(line);
  }
  return { removed: new Set([...remainingByText.values()].flat()), added };
}

interface Insertion {
  readonly text: string;
  readonly order: number;
}

function pipelineOfEachChild(map: WardleyMap): Map<string, string> {
  const pipelineById = new Map<string, string>();
  for (const el of map.elements) {
    if (el.elementType === 'component' && el.pipelineId !== undefined) {
      pipelineById.set(el.id, el.pipelineId);
    }
  }
  return pipelineById;
}

/** Children that moved to another pipeline: their line leaves one block and joins the other. */
function reparentedChildKeys(source: WardleyMap, edited: WardleyMap): Set<string> {
  const pipelineBefore = pipelineOfEachChild(source);
  const keys = new Set<string>();
  for (const [id, pipelineId] of pipelineOfEachChild(edited)) {
    const previous = pipelineBefore.get(id);
    if (previous !== undefined && previous !== pipelineId) keys.add(`child:${id}`);
  }
  return keys;
}

/**
 * A pipeline line written without a range takes it from its children, so it needs the range
 * written out once its children no longer span exactly the pipeline's range.
 */
function pipelinesNoLongerSpannedByChildren(
  edited: WardleyMap,
  rangeFromChildren: ReadonlySet<string>,
): Set<string> {
  const keys = new Set<string>();
  if (rangeFromChildren.size === 0) return keys;
  const evolutionsByPipeline = new Map<string, number[]>();
  for (const el of edited.elements) {
    if (el.elementType !== 'component' || el.pipelineId === undefined) continue;
    const evolutions = evolutionsByPipeline.get(el.pipelineId) ?? [];
    evolutions.push(roundAsWritten(el.position.evolution));
    evolutionsByPipeline.set(el.pipelineId, evolutions);
  }
  for (const el of edited.elements) {
    if (el.elementType !== 'pipeline' || !rangeFromChildren.has(el.id)) continue;
    const evolutions = evolutionsByPipeline.get(el.id) ?? [];
    const read =
      evolutions.length > 0
        ? widenEmptyRange({ start: Math.min(...evolutions), end: Math.max(...evolutions) })
        : undefined;
    const spanned =
      read !== undefined &&
      read.start === roundAsWritten(el.evolutionStart) &&
      read.end === roundAsWritten(el.evolutionEnd);
    if (!spanned) keys.add(`element:${el.id}`);
  }
  return keys;
}

/** Returns the patched text, or null when this mode cannot express the edit. */
function patchLines(source: Source, edited: WardleyMap, mode: Mode): string | null {
  const { lines, shapes, sourceMap } = source;
  const hints = { urlReferences: sourceMap.urlReferences };
  const before = serializeKeyedLines(source.map, hints);
  const after = serializeKeyedLines(edited, hints);
  const textBefore = keyedTexts(before);
  const textAfter = keyedTexts(after);
  const passthrough = diffPassthrough(before, after);
  const reparented = reparentedChildKeys(source.map, edited);
  const unspanned = pipelinesNoLongerSpannedByChildren(edited, sourceMap.rangeFromChildren);

  const statusOf = (key: string): Status => {
    const written = textAfter.get(key);
    if (written === undefined || reparented.has(key)) return 'deleted';
    if (mode === 'rewrite' || written !== textBefore.get(key) || unspanned.has(key)) {
      return 'changed';
    }
    return 'same';
  };

  const primaryKeysByLine = listsByLine<string>(lines.length);
  for (const [key, line] of sourceMap.primaryLineOf) {
    if (textBefore.has(key)) primaryKeysByLine[line - 1]?.push(key);
  }
  const secondaryKeysByLine = listsByLine<string>(lines.length);
  for (const [key, secondaryLines] of sourceMap.secondaryLinesOf) {
    if (!textBefore.has(key)) continue;
    for (const line of secondaryLines) secondaryKeysByLine[line - 1]?.push(key);
  }
  const passthroughByLine = listsByLine<number>(lines.length);
  sourceMap.passthrough.forEach((entry, index) => passthroughByLine[entry.line - 1]?.push(index));
  const bracesByLine = listsByLine<{ pipelineId: string; end: 'open' | 'close' }>(lines.length);
  for (const [pipelineId, block] of sourceMap.blocks) {
    if (block.open !== undefined) {
      bracesByLine[block.open - 1]?.push({ pipelineId, end: 'open' });
    }
    if (block.close !== undefined) {
      bracesByLine[block.close - 1]?.push({ pipelineId, end: 'close' });
    }
  }
  // A block goes with its pipeline or its last child; an empty block of a kept pipeline stays.
  const braceRemoved = (pipelineId: string) =>
    !textAfter.has(`block-open:${pipelineId}`) &&
    (textBefore.has(`block-open:${pipelineId}`) || !textAfter.has(`element:${pipelineId}`));

  const result: (string | null)[] = [];
  for (let index = 0; index < lines.length; index++) {
    const patched = patchLine(index);
    if (patched === undefined) return null;
    result.push(patched);
  }

  function patchLine(index: number): string | null | undefined {
    const line = lines[index]!;
    const shape = shapes[index]!;
    const primaries = primaryKeysByLine[index]!;
    const removedPassthrough = passthroughByLine[index]!.filter((entry) =>
      passthrough.removed.has(entry),
    );
    const braces = bracesByLine[index]!;
    const changed =
      primaries.some((key) => statusOf(key) !== 'same') ||
      secondaryKeysByLine[index]!.some((key) => statusOf(key) !== 'same') ||
      removedPassthrough.length > 0 ||
      braces.some((brace) => braceRemoved(brace.pipelineId));
    if (!changed) return line.text;
    if (!shape.editable || primaries.length > 1) return undefined;
    if (removedPassthrough.some((entry) => sourceMap.passthrough[entry]!.isComment)) {
      return undefined;
    }

    // null keeps the statement as written; '' removes it
    let statement: string | null = null;
    const primary = primaries[0];
    if (primary !== undefined) {
      const status = statusOf(primary);
      if (status === 'changed') statement = textAfter.get(primary)!.trim();
      else if (status === 'deleted') statement = '';
    } else if (secondaryKeysByLine[index]!.length || removedPassthrough.length) {
      statement = '';
    }

    // The block braces on the line: a leading `{`, a trailing `}`, or the `{` ending a pipeline line.
    const open = braces.find((brace) => brace.end === 'open');
    const close = braces.find((brace) => brace.end === 'close');
    let rest = shape.code;
    let prefix = '';
    let suffix = '';
    if (open && primary !== `element:${open.pipelineId}` && rest.startsWith('{')) {
      prefix = braceRemoved(open.pipelineId) ? '' : '{';
      rest = rest.slice(1).trimStart();
    } else if (open && rest.endsWith('{')) {
      suffix = braceRemoved(open.pipelineId) ? '' : '{';
      rest = rest.slice(0, -1).trimEnd();
    } else if (open) return undefined;
    if (close && rest.endsWith('}') && !(open && suffix)) {
      suffix = braceRemoved(close.pipelineId) ? '' : '}';
      rest = rest.slice(0, -1).trimEnd();
    } else if (close) return undefined;
    const assembled = [prefix, statement ?? rest, suffix].filter(Boolean).join(' ');
    if (assembled) return shape.commentHead + shape.indent + assembled + shape.commentTail;
    // A removed statement keeps the comment around it (the head still closes its block comment).
    if (shape.commentHead) return shape.commentHead + shape.commentTail;
    return shape.commentTail ? shape.indent + shape.commentTail.trimStart() : null;
  }

  const insertions = planInsertions(source, edited, after, textBefore, textAfter, reparented);
  if (!insertions) return null;
  passthrough.added.forEach((line, index) => {
    addInsertion(insertions, lines.length - 1, line.text, after.length + index);
  });
  return assemble(source, result, insertions);
}

function addInsertion(
  insertions: Map<number, Insertion[]>,
  afterLine: number,
  text: string,
  order: number,
): void {
  const list = insertions.get(afterLine) ?? [];
  list.push({ text, order });
  insertions.set(afterLine, list);
}

/**
 * Where the statements the source does not hold yet go: after the last statement of the same kind
 * (children at the end of their pipeline's block), else after related statements, else at the end
 * (config at the top). Keyed by the 0-based line they follow; -1 is the top of the file.
 */
function planInsertions(
  source: Source,
  edited: WardleyMap,
  after: readonly KeyedLine[],
  textBefore: ReadonlyMap<string, string>,
  textAfter: ReadonlyMap<string, string>,
  reparented: ReadonlySet<string>,
): Map<number, Insertion[]> | null {
  const { lines, shapes, sourceMap } = source;
  const lastLine = lines.length - 1;
  const lineOf = (key: string) => {
    const line = sourceMap.primaryLineOf.get(key);
    return line === undefined ? undefined : line - 1;
  };
  const pipelineLineOf = (pipelineId: string) => lineOf(`element:${pipelineId}`);
  const childLinesOf = (pipelineId: string): number[] =>
    source.map.elements.flatMap((el) => {
      if (el.elementType !== 'component' || el.pipelineId !== pipelineId) return [];
      const line = lineOf(`child:${el.id}`);
      return line === undefined ? [] : [line];
    });
  /** The last line of a pipeline's block in the source, if it has one. */
  const blockEndOf = (pipelineId: string): number | undefined => {
    const block = sourceMap.blocks.get(pipelineId);
    if (block?.open === undefined || pipelineLineOf(pipelineId) === undefined) return undefined;
    if (block.close !== undefined) return block.close - 1;
    return Math.max(block.open - 1, ...childLinesOf(pipelineId));
  };
  /** Where a child joins its pipeline's source block; null when the block's layout cannot take it. */
  const anchorInBlock = (pipelineId: string): number | null => {
    const block = sourceMap.blocks.get(pipelineId)!;
    let anchor: number;
    if (block.close === undefined) anchor = blockEndOf(pipelineId)!;
    else if (block.close !== block.open && shapes[block.close - 1]!.code === '}') {
      anchor = block.close - 2;
    } else return null;
    return shapes[anchor]?.endsInBlockComment ? null : anchor;
  };
  const hasSourceBlock = (pipelineId: string) => blockEndOf(pipelineId) !== undefined;
  /** The last line a statement occupies: a pipeline reaches to the end of its block. */
  const endOf = (key: string): number | undefined => {
    const line = lineOf(key);
    if (line === undefined || !key.startsWith('element:')) return line;
    return Math.max(line, blockEndOf(key.slice('element:'.length)) ?? line);
  };
  const sourceElementTypes = new Map(source.map.elements.map((el) => [el.id, el.elementType]));
  const editedElementById = new Map(edited.elements.map((el) => [el.id, el]));
  const lastLineOf = (accepts: (key: string) => boolean): number | undefined => {
    let last: number | undefined;
    for (const key of sourceMap.primaryLineOf.keys()) {
      if (!accepts(key) || !textBefore.has(key)) continue;
      const end = endOf(key);
      if (end !== undefined && (last === undefined || end > last)) last = end;
    }
    return last;
  };
  const isElementOfType = (type: string) => (key: string) =>
    key.startsWith('element:') && sourceElementTypes.get(key.slice('element:'.length)) === type;
  const startsWith = (prefix: string) => (key: string) => key.startsWith(prefix);

  /** Never between a pipeline and its block, never inside a block or a block comment. */
  const settle = (line: number): number => {
    if (line < 0) return -1;
    let settled = line;
    for (const pipelineId of sourceMap.blocks.keys()) {
      const start = pipelineLineOf(pipelineId);
      const end = blockEndOf(pipelineId);
      if (start === undefined || end === undefined) continue;
      if (settled >= start && settled < end) settled = end;
    }
    while (settled < lastLine && shapes[settled]!.endsInBlockComment) settled++;
    return settled;
  };
  const firstOf = (...candidates: (number | undefined)[]): number => {
    for (const candidate of candidates) if (candidate !== undefined) return candidate;
    return lastLine;
  };

  const needsInsertion = (key: string) =>
    reparented.has(key) ||
    (!sourceMap.primaryLineOf.has(key) && textBefore.get(key) !== textAfter.get(key));
  const anchorOfElement = (id: string): number => {
    const type = editedElementById.get(id)?.elementType ?? '';
    return settle(
      firstOf(
        lastLineOf(isElementOfType(type)),
        lastLineOf(startsWith('element:')),
        lastLineOf(startsWith('url:')),
        lastLineOf(startsWith('config:')),
      ),
    );
  };
  /** A new block goes right after its pipeline line, as the parser binds it only there. */
  const anchorOfNewBlock = (pipelineId: string): number =>
    pipelineLineOf(pipelineId) ?? anchorOfElement(pipelineId);

  const insertions = new Map<number, Insertion[]>();
  for (let order = 0; order < after.length; order++) {
    const { key, text } = after[order]!;
    if (isRawKey(key)) continue;
    const separator = key.indexOf(':');
    const kind = key.slice(0, separator);
    const id = key.slice(separator + 1);
    let anchor: number | null;
    if (kind === 'block-open' || kind === 'block-close') {
      if (textBefore.has(`block-open:${id}`)) continue;
      if (hasSourceBlock(id)) {
        // The source holds an empty block: the new children go into it.
        if (anchorInBlock(id) === null) return null;
        continue;
      }
      anchor = anchorOfNewBlock(id);
    } else if (!needsInsertion(key)) {
      continue;
    } else if (kind === 'config') {
      anchor = settle(firstOf(lastLineOf(startsWith('config:')), -1));
    } else if (kind === 'url') {
      const lastUrl = lastLineOf(startsWith('url:'));
      anchor = settle(firstOf(lastUrl, lastLineOf(startsWith('config:')), -1));
    } else if (kind === 'element') {
      anchor = anchorOfElement(id);
    } else if (kind === 'child') {
      const child = editedElementById.get(id);
      const pipelineId = child?.elementType === 'component' ? child.pipelineId : undefined;
      if (pipelineId === undefined) return null;
      anchor = hasSourceBlock(pipelineId)
        ? anchorInBlock(pipelineId)
        : anchorOfNewBlock(pipelineId);
    } else if (kind === 'evolve') {
      anchor = settle(firstOf(lastLineOf(startsWith('evolve:')), endOf(`element:${id}`)));
    } else if (kind === 'edge') {
      anchor = settle(firstOf(lastLineOf(startsWith('edge:'))));
    } else return null;
    if (anchor === null) return null;
    addInsertion(insertions, anchor, text, order);
  }
  return insertions;
}

function assemble(
  source: Source,
  result: readonly (string | null)[],
  insertions: ReadonlyMap<number, Insertion[]>,
): string {
  const output: { text: string; lineBreak: string }[] = [];
  const insertAfter = (line: number) => {
    const list = [...(insertions.get(line) ?? [])].sort((a, b) => a.order - b.order);
    for (const { text } of list) output.push({ text, lineBreak: '' });
  };
  insertAfter(-1);
  result.forEach((text, index) => {
    if (text !== null) output.push({ text, lineBreak: source.lines[index]!.lineBreak });
    insertAfter(index);
  });
  return output
    .map(({ text, lineBreak }, index) => {
      const isLast = index === output.length - 1;
      if (isLast && !source.endsWithLineBreak) return text;
      return text + (lineBreak || source.lineBreak);
    })
    .join('');
}

// --- Safety net ---------------------------------------------------------------------------------

/** Rounds numbers as the serializer writes them and orders object keys, so equal maps compare equal. */
function normalized(value: unknown): unknown {
  if (typeof value === 'number') return roundAsWritten(value);
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, normalized(entry)]),
    );
  }
  return value;
}

/**
 * The meaning of a map, independent of ids (derived from names and order) and statement order:
 * elements and edges reference each other by type and label.
 */
function fingerprint(map: WardleyMap): string {
  const elementById = new Map(map.elements.map((el) => [el.id, el]));
  const reference = (id: string) => {
    const el = elementById.get(id);
    return el ? `${el.elementType}:${el.label}` : `?${id}`;
  };
  const entries = [`config ${JSON.stringify(normalized(map.config))}`];
  for (const el of map.elements) {
    const { id: _id, ...rest } = el;
    const described: Record<string, unknown> = { ...rest };
    if (el.elementType === 'component' && el.pipelineId !== undefined) {
      described['pipelineId'] = reference(el.pipelineId);
    }
    if (el.elementType === 'pipeline') described['childIds'] = el.childIds.map(reference).sort();
    entries.push(`element ${JSON.stringify(normalized(described))}`);
  }
  for (const edge of map.edges) {
    const { id: _id, ...rest } = edge;
    const described = { ...rest, from: reference(edge.from), to: reference(edge.to) };
    entries.push(`edge ${JSON.stringify(normalized(described))}`);
  }
  for (const raw of map.rawPassthrough ?? []) entries.push(`raw ${raw}`);
  return entries.sort().join('\n');
}
