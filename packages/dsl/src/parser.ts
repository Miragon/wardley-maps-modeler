import {
  CURRENT_SCHEMA_VERSION,
  validateMap,
  type AcceleratorElement,
  type AnchorElement,
  type AnnotationElement,
  type DrawingElement,
  type DrawingStrokeStyle,
  type AttitudeElement,
  type AttitudeKind,
  type ComponentDecorators,
  type ComponentElement,
  type Coordinate,
  type MapConfig,
  type MapEdge,
  type MapElement,
  type MapStyle,
  type Method,
  type Movement,
  type NoteElement,
  type PipelineElement,
  type SubmapElement,
  type WardleyMap,
} from '@miragon/wardley-schema-model';
import {
  CommentStripper,
  METHODS,
  isRoundTrippableNumber,
  keywordOf,
  parseCoords,
  parseLabelOffset,
  parseMultiCoords,
  parsePositions,
  readUnclampedNumber,
  readUrlDefinition,
  scanSuffix,
  slug,
  splitAtCoords,
  splitAtCoords4,
  splitAtFirstChildTuple,
  splitAtTuple,
  splitLeadingColor,
  splitTrailingGroups,
  type InlineDecorators,
  type LabelOffsetToken,
  type MutableDecorators,
  type SuffixToken,
  type TextSpan,
} from './lexer.js';
import { UniqueNames, escapeCommentMarkers, roundAsWritten, writtenName } from './names.js';

/** Splits `A -> B` at the FIRST arrow — plain indexOf, immune to regex backtracking. */
function splitDependency(core: string): { left: string; right: string } | null {
  const arrow = core.indexOf('->');
  if (arrow <= 0) return null;
  const left = core.slice(0, arrow).trim();
  const right = core.slice(arrow + 2).trim();
  return left && right ? { left, right } : null;
}
/**
 * Splits a flow line at the FIRST valid operator (`+>`, `+<>`, `+<`, `+'value'>`/`+'value'<>`)
 *  via a linear scan — same semantics as the previous lazy regex, but immune to backtracking.
 */
function splitFlow(
  core: string,
): { left: string; right: string; op: string; value?: string } | null {
  for (let i = 1; i < core.length; i++) {
    if (core[i] !== '+') continue;
    let j = i + 1;
    let value: string | undefined;
    if (core[j] === "'") {
      const end = core.indexOf("'", j + 1);
      if (end < 0) continue;
      value = core.slice(j + 1, end);
      j = end + 1;
    }
    const op = core.startsWith('<>', j)
      ? '<>'
      : core[j] === '>' || core[j] === '<'
        ? core[j]!
        : null;
    if (!op) continue;
    const left = core.slice(0, i).trim();
    const right = core.slice(j + op.length).trim();
    if (left && right) return { left, right, op, ...(value ? { value } : {}) };
  }
  return null;
}
// A link-shaped line starting with one of these keywords may be that statement instead
// (`Title Search -> X` vs. `title Search -> X`); `title`, `evolution`, `y-axis` and `evolve` hold
// `->` themselves. The declared names decide.
const LINK_LIKE_STATEMENT_KEYWORDS: ReadonlySet<string> = new Set([
  'title',
  'style',
  'size',
  'evolution',
  'y-axis',
  'annotations',
  'annotation',
  'evolve',
  'line',
]);
// A declaration needs a tuple, which a link line has only after its `;` (`note A -> B; see [x, y]`).
// `pipeline` is not among them: read as a statement it opens or closes pipeline blocks, which would
// change what the other lines declare between the two readings, so such a line is always a link.
const DECLARATION_KEYWORDS: ReadonlySet<string> = new Set([
  'anchor',
  'component',
  'market',
  'ecosystem',
  'note',
  'pioneers',
  'settlers',
  'townplanners',
  'url',
  'build',
  'buy',
  'outsource',
  'accelerator',
  'deaccelerator',
  'submap',
]);
const KNOWN_STYLES: ReadonlySet<string> = new Set(['wardley', 'handwritten', 'colour', 'dark']);

interface PendingLink {
  readonly left: string;
  readonly right: string;
  readonly kind: 'dependency' | 'flow';
  readonly bidirectional?: boolean;
  /** `+<` — flow direction reversed (right -> left). */
  readonly reverse?: boolean;
  readonly flowValue?: string;
  /** Annotation text after `;`. */
  readonly label?: string;
  /** Names as the serializer writes the statement, for a line that could also be its keyword's. */
  readonly writtenNames?: { readonly left: string; readonly right: string };
  readonly raw: string;
  readonly lineNo: number;
  readonly text: string;
}
interface PendingEvolve {
  readonly name: string;
  readonly newLabel?: string;
  readonly target: number;
  readonly method?: Movement['method'];
  readonly labelOffset?: LabelOffsetToken;
  /** Findings that only matter once the evolve is applied; the whole line is kept otherwise. */
  readonly notes: readonly string[];
  readonly raw: string;
  readonly lineNo: number;
  readonly text: string;
}
interface PipelineChild {
  readonly name: string;
  readonly maturity: number;
  readonly decorators: InlineDecorators;
  readonly labelOffset?: LabelOffsetToken;
  readonly color?: string;
  readonly lineNo: number;
  readonly text: string;
}
interface PendingPipeline {
  readonly name: string;
  readonly lineNo: number;
  readonly text: string;
  /** Explicit range; if absent (OWM v2 block form without coordinates), it is derived from the children. */
  readonly start?: number;
  readonly end?: number;
  /** Explicit height — project extension `(y 0.x)`; otherwise derived from the anchor component. */
  readonly visibility?: number;
  readonly color?: string;
  /** Findings that only matter once the pipeline is drawn; the whole line is kept otherwise. */
  readonly notes: readonly string[];
  readonly raw: string;
  readonly children: PipelineChild[];
}
/** Legacy standalone line `build|buy|outsource <Name>` — method on an existing component. */
interface PendingMethod {
  readonly name: string;
  readonly method: Method;
  readonly raw: string;
  readonly lineNo: number;
  readonly text: string;
}
interface UrlDefinition {
  readonly name: string;
  readonly address: string;
  readonly lineNo: number;
  readonly text: string;
}
/** An `evolution`/`y-axis` line that cannot be used; `index` is its place in the passthrough. */
interface UnusedConfigLine {
  readonly keyword: 'evolution' | 'y-axis';
  readonly reason: string;
  readonly index: number;
  readonly line: number;
  readonly text: string;
}
/** A `url(Name)` reference on the element at `index`, not yet resolved. */
interface PendingUrlRef {
  readonly index: number;
  readonly ref: string;
  readonly line: number;
  readonly text: string;
}
interface PassthroughEntry {
  readonly text: string;
  readonly isComment: boolean;
  readonly lineNo: number;
  readonly source: string;
}
type Report = (message: string, line: number, text: string) => void;

function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

function linkCore(line: string): string {
  const semi = line.indexOf(';');
  return semi >= 0 ? line.slice(0, semi) : line;
}

/** Reads `A -> B`, `A +> B`, `A +'value'<> B`, … with an optional `; annotation` — or null. */
function readLink(line: string, lineNo: number, text: string): PendingLink | null {
  const semi = line.indexOf(';');
  const core = (semi >= 0 ? line.slice(0, semi) : line).trim();
  const label = semi >= 0 ? line.slice(semi + 1).trim() : '';
  const common = { ...(label ? { label } : {}), raw: line, lineNo, text };
  const dependency = splitDependency(core);
  if (dependency) return { ...dependency, kind: 'dependency', ...common };
  const flow = splitFlow(core);
  if (!flow) return null;
  return {
    left: flow.left,
    right: flow.right,
    kind: 'flow',
    bidirectional: flow.op === '<>',
    reverse: flow.op === '<',
    ...(flow.value ? { flowValue: flow.value } : {}),
    ...common,
  };
}

/**
 * Whether a link-shaped line could also be its keyword's statement; the declared names decide then.
 * A whole url definition is one too: its address may hold `->` or `+>`.
 */
function couldBeStatement(line: string, keyword: string, after: string): boolean {
  return (
    LINK_LIKE_STATEMENT_KEYWORDS.has(keyword) ||
    (DECLARATION_KEYWORDS.has(keyword) && parseCoords(line) !== null) ||
    (keyword === 'url' && readUrlDefinition(after) !== null)
  );
}

/**
 * The link names of a keyword line once the serializer has written it as its statement: lowercase
 * keyword, single spaces, `->` without spaces. Deciding on these too keeps a line read as a
 * statement from turning into a link on the next parse.
 */
function namesAsWritten(link: PendingLink): { left: string; right: string } {
  const keyword = keywordOf(link.left);
  const nameAfterKeyword = link.left.slice(keyword.length).trim();
  return {
    left: [keyword, nameAfterKeyword].filter(Boolean).join(' '),
    right: link.right
      .split('->')
      .map((part) => part.trim())
      .join('->'),
  };
}

function leftNameIsDeclared(link: PendingLink, names: ReadonlySet<string>): boolean {
  return names.has(link.left) || names.has(namesAsWritten(link).left);
}

function unknownStatementMessage(line: string): string {
  const core = linkCore(line);
  if (/->|\+('[^']*')?(<>|>|<)/.test(core)) return 'Link needs a name on both sides';
  const flowValue = /\+'[^']*'/.exec(core);
  if (flowValue) return `Flow ${flowValue[0]} has no direction — add ">", "<" or "<>"`;
  return `Unknown statement "${line.split(/\s/)[0]}"`;
}

function buildEdges(
  links: readonly PendingLink[],
  idOfName: (name: string) => string | undefined,
  unresolved: (link: PendingLink, name: string) => void,
  labelOf: (link: PendingLink) => string | undefined,
): MapEdge[] {
  let dependencies = 0;
  let flows = 0;
  const edges: MapEdge[] = [];
  for (const link of links) {
    const fromId = idOfName(link.left) ?? idOfName(link.writtenNames?.left ?? link.left);
    const toId = idOfName(link.right) ?? idOfName(link.writtenNames?.right ?? link.right);
    if (!fromId || !toId) {
      unresolved(link, fromId ? link.right : link.left);
      continue;
    }
    if (link.kind === 'dependency') {
      edges.push(
        compact({
          id: `dep_${++dependencies}`,
          edgeType: 'dependency',
          from: fromId,
          to: toId,
          label: labelOf(link),
        }) as MapEdge,
      );
      continue;
    }
    // `+<` reverses the flow direction (right -> left).
    const [from, to] = link.reverse ? [toId, fromId] : [fromId, toId];
    edges.push(
      compact({
        id: `flow_${++flows}`,
        edgeType: 'flow',
        from,
        to,
        bidirectional: link.bidirectional ? true : undefined,
        flowValue: link.flowValue,
        label: labelOf(link),
      }) as MapEdge,
    );
  }
  return edges;
}

/** Finding produced while parsing — line is 1-based; `text` is that source line, trimmed. */
export interface ParseDiagnostic {
  readonly line: number;
  readonly message: string;
  readonly text: string;
}

export interface ParseResult {
  readonly map: WardleyMap;
  readonly diagnostics: readonly ParseDiagnostic[];
}

class IdAllocator {
  private readonly used = new Set<string>();
  alloc(prefix: string, label: string): string {
    const base = `${prefix}_${slug(label)}`;
    let id = base;
    let i = 2;
    while (this.used.has(id)) id = `${base}_${i++}`;
    this.used.add(id);
    return id;
  }
}

/**
 * Keyword-differentiated coordinates (component/anchor/note = [visibility, maturity];
 * pipeline = [maturityStart, maturityEnd]). Unknown lines land in `rawPassthrough`.
 */
export function parseDSL(text: string): WardleyMap {
  return parseDSLWithDiagnostics(text).map;
}

/**
 * Like `parseDSL`, but additionally returns findings with line numbers (uninterpretable lines,
 * unresolved references, clamped coordinates) — for editor feedback instead of silent loss.
 */
export function parseDSLWithDiagnostics(text: string): ParseResult {
  const reading = new MapReader(new Set()).read(text);
  // `Title Search -> X` is a link only when both names are declared, maybe further down the file:
  // the first reading collects the names. Read either way, such a line declares no name a link can
  // reach (a declaration among them has the ";" in its name), so the second reading sees the same.
  const needsDeclaredNames = reading.keywordLinks.some((link) =>
    leftNameIsDeclared(link, reading.declaredNames),
  );
  return needsDeclaredNames
    ? new MapReader(reading.declaredNames).read(text).result
    : reading.result;
}

interface MapReading {
  readonly result: ParseResult;
  readonly declaredNames: ReadonlySet<string>;
  /** Link-shaped lines read as their keyword's statement because their names were not declared. */
  readonly keywordLinks: readonly PendingLink[];
}

class MapReader {
  private readonly diagnostics: ParseDiagnostic[] = [];
  private readonly ids = new IdAllocator();
  private readonly namesInUse = new UniqueNames();
  /** The first element declared under a name wins it. */
  private readonly idBySourceName = new Map<string, string>();
  private readonly idByElementName = new Map<string, string>();
  private readonly elements: MapElement[] = [];
  private readonly passthrough: PassthroughEntry[] = [];
  private readonly pendingLinks: PendingLink[] = [];
  private readonly keywordLinks: PendingLink[] = [];
  private readonly pendingEvolve: PendingEvolve[] = [];
  private readonly pendingPipeline: PendingPipeline[] = [];
  private readonly pendingMethod: PendingMethod[] = [];
  private config: MapConfig = { title: 'Untitled Map' };
  private readonly lineThatSetConfig = new Map<string, number>();
  private readonly unusedConfigLines: UnusedConfigLine[] = [];
  private annotationCounter = 0;
  private readonly comments = new CommentStripper();
  private readonly urlDefinitions: UrlDefinition[] = [];
  private readonly pendingUrlRefs: PendingUrlRef[] = [];
  /** Candidate for a `{` block opening: a block binds only to the directly preceding pipeline line. */
  private lastPipeline: PendingPipeline | null = null;
  private blockPipeline: PendingPipeline | null = null;
  private blockOpening = { line: 0, text: '' };
  private lineNo = 0;
  private currentLine = '';

  constructor(private readonly linkNames: ReadonlySet<string>) {}

  private readonly report = (message: string) => this.diag(message);
  private readonly reportAt: Report = (message, line, text) => this.diag(message, line, text);

  private diag(message: string, atLine = this.lineNo, text = this.currentLine): void {
    this.diagnostics.push({ line: atLine, message, text });
  }

  private keepLine(statement: string, lineNo = this.lineNo, source = this.currentLine): void {
    this.passthrough.push({ text: statement, isComment: false, lineNo, source });
  }

  private keep(statement: string, message: string): void {
    this.keepLine(statement);
    this.diag(message);
  }

  /** For a line that looks like a known construct but cannot be parsed. */
  private failed(line: string): void {
    this.keep(line, 'Line could not be interpreted (kept losslessly in rawPassthrough)');
  }

  // A reference binds to the name as written first, so `X 2` stays bound to an explicit "X 2" even
  // when a duplicate "X" was renamed to "X 2"; the serializer then writes that reference by the
  // element's new name, and the next parse binds it the same way.
  private idOfName(name: string): string | undefined {
    return this.idBySourceName.get(name) ?? this.idByElementName.get(name);
  }

  private register(sourceName: string, elementName: string, id: string): void {
    if (!this.idBySourceName.has(sourceName)) this.idBySourceName.set(sourceName, id);
    this.idByElementName.set(elementName, id);
  }

  private setConfig(keyword: string, update: MapConfig): void {
    const earlier = this.lineThatSetConfig.get(keyword);
    if (earlier !== undefined) {
      this.diag(`Repeated "${keyword}" — replaces the one on line ${earlier}`);
    }
    this.lineThatSetConfig.set(keyword, this.lineNo);
    this.config = update;
  }

  private keepUnusedConfigLine(
    keyword: 'evolution' | 'y-axis',
    statement: string,
    reason: string,
  ): void {
    this.unusedConfigLines.push({
      keyword,
      reason,
      index: this.passthrough.length,
      line: this.lineNo,
      text: this.currentLine,
    });
    this.keepLine(statement);
  }

  /**
   * Links are read before statements, as names may begin with a keyword (`Component -> X`); a link
   * has no `[a, b]` tuple before its `;`. A line that could also be its keyword's statement is a
   * link only when both names are declared.
   */
  private readsAsLink(line: string, kw: string, after: string): boolean {
    const link = parseCoords(linkCore(line)) ? null : readLink(line, this.lineNo, this.currentLine);
    if (!link) return false;
    if (!couldBeStatement(line, kw, after)) {
      this.pendingLinks.push(link);
      return true;
    }
    const declared = this.linkNames;
    const written = namesAsWritten(link);
    const leftDeclared = declared.has(link.left) || declared.has(written.left);
    if (leftDeclared && (declared.has(link.right) || declared.has(written.right))) {
      this.pendingLinks.push({ ...link, writtenNames: written });
      return true;
    }
    this.keywordLinks.push(link);
    if (leftDeclared) this.diag(`Link: "${link.right}" not found — read as a "${kw}" statement`);
    return false;
  }

  /** Clamps a normalized value to [0,1] — with a diagnostic instead of a later validation crash. */
  private clamp(n: number, report = this.report): number {
    if (n < 0 || n > 1) report(`Coordinate ${n} is outside [0,1] and was clamped`);
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  private position(visibility: number, evolution: number): Coordinate {
    return { visibility: this.clamp(visibility), evolution: this.clamp(evolution) };
  }

  private reportTextBefore(before: string): void {
    if (before) this.diag(`Ignored text before the coordinates: "${before}"`);
  }

  /** A suffix written in front of the coordinates is part of the name or text (OWM). */
  private reportMisplacedSuffix(groups: readonly string[], where: string, fix: string): void {
    if (groups.length) this.diag(`"${groups.join(' ')}" ${where} — ${fix}`);
  }

  /**
   * A text as the serializer writes it. Its comment markers are protected only by flow values
   * `+'…'` within the text itself; one that other parts of the line protected is escaped now,
   * not on the next parse.
   */
  private readText(text: string, line = this.lineNo, source = this.currentLine): string {
    const written = escapeCommentMarkers(text);
    if (written !== text) {
      this.diag(
        `"${text}" read as "${written}" — "//" or "/*" there would start a comment once saved`,
        line,
        source,
      );
    }
    return written;
  }

  /** Names an element the way the serializer writes it, so the next parse yields the same name. */
  private nameElement(
    sourceName: string,
    elementType: string,
    atLine = this.lineNo,
    atText = this.currentLine,
  ): string {
    const base = writtenName(sourceName, elementType);
    const name = this.namesInUse.claim(base);
    if (name !== base) {
      this.diag(
        `Duplicate name "${sourceName}" — renamed to "${name}"; links bind to the first "${sourceName}"`,
        atLine,
        atText,
      );
    } else if (name !== sourceName) {
      this.diag(renamedMessage(sourceName, name), atLine, atText);
    }
    return name;
  }

  private openBlock(): void {
    if (this.lastPipeline) {
      this.blockPipeline = this.lastPipeline;
      this.blockOpening = { line: this.lineNo, text: this.currentLine };
    } else this.diag('Ignored "{" — a block must directly follow a pipeline line');
    this.lastPipeline = null;
  }

  private closeBlock(): void {
    if (this.blockPipeline) this.blockPipeline = null;
    else this.diag('Ignored "}" — no pipeline block is open');
    this.lastPipeline = null;
  }

  private endUnclosedBlock(): void {
    if (!this.blockPipeline) return;
    this.diag(
      `Pipeline block of "${this.blockPipeline.name}" is never closed — add "}"`,
      this.blockOpening.line,
      this.blockOpening.text,
    );
    this.blockPipeline = null;
  }

  /** A `url(Name)` reference on the element just pushed. */
  private addUrlRef(ref: string): void {
    this.pendingUrlRefs.push({
      index: this.elements.length - 1,
      ref,
      line: this.lineNo,
      text: this.currentLine,
    });
  }

  read(text: string): MapReading {
    const sourceLines = text.split(/\r?\n/);
    // The newline that ends the last line does not start another one; inside an unclosed block
    // comment that phantom line would otherwise be kept and grow the file by one line per save.
    if (sourceLines.length > 1 && sourceLines[sourceLines.length - 1] === '') sourceLines.pop();
    let blockCommentStart: { readonly line: number; readonly text: string } | null = null;
    for (let i = 0; i < sourceLines.length; i++) {
      // A carriage return left over from a `\r\r\n` ending would become part of a kept comment,
      // and the serializer's line break would then turn it into a line ending of its own.
      const raw = withoutTrailingCarriageReturns(sourceLines[i]!);
      this.lineNo = i + 1;
      this.currentLine = raw.trim();

      const stripped = this.comments.strip(raw);
      if (!this.comments.insideBlockComment) blockCommentStart = null;
      else blockCommentStart ??= { line: this.lineNo, text: this.currentLine };
      for (const fragment of stripped.comments) {
        this.passthrough.push({
          text: fragment,
          isComment: true,
          lineNo: this.lineNo,
          source: this.currentLine,
        });
      }
      this.readCode(stripped.code.trim());
    }
    this.endUnclosedBlock();
    if (blockCommentStart) {
      const { line, text: startText } = blockCommentStart;
      this.diag(
        'Block comment "/*" is never closed — the rest of the file is a comment',
        line,
        startText,
      );
    }
    return this.finish();
  }

  /**
   * Braces are structural tokens: `{` at the start of a line, and `}` there while a block is open
   * or on its own; `}` also ends a block line. A name starting with `}` stays a name.
   */
  private readCode(code: string): void {
    let statement = code;
    for (;;) {
      if (statement.startsWith('{')) this.openBlock();
      else if (statement.startsWith('}') && (this.blockPipeline || statement === '}')) {
        this.closeBlock();
      } else break;
      statement = statement.slice(1).trim();
    }
    const closesBlock = this.blockPipeline !== null && statement.endsWith('}');
    if (closesBlock) statement = statement.slice(0, -1).trim();
    if (statement) this.readStatement(statement);
    if (closesBlock) this.blockPipeline = null;
  }

  private readStatement(line: string): void {
    const kw = keywordOf(line);
    const after = line.slice(kw.length).trim();
    if (this.blockPipeline && kw === 'component' && this.readBlockChild(after)) return;
    this.lastPipeline = null;
    if (this.readsAsLink(line, kw, after)) return;

    switch (kw) {
      case 'title':
        this.setConfig('title', { ...this.config, title: this.readText(after) });
        return;
      case 'anchor':
        return this.readAnchor(line, after);
      case 'component':
      case 'market':
      case 'ecosystem':
        if (!this.pushComponent(after, kw)) this.failed(line);
        return;
      case 'note':
        return this.readNote(line, after);
      case 'pipeline':
        return this.readPipeline(line, after);
      case 'evolve':
        return this.readEvolve(line, after);
      case 'style':
        return this.readStyle(line, after);
      case 'size':
        return this.readSize(line, after);
      case 'evolution':
        return this.readEvolution(line, after);
      case 'y-axis':
        return this.readYAxis(line, after);
      case 'annotations':
        return this.readAnnotationsBox(line, after);
      case 'annotation':
        return this.readAnnotation(line, after);
      case 'line':
        return this.readDrawing(line, after);
      case 'pioneers':
      case 'settlers':
      case 'townplanners':
        return this.readAttitude(line, after, kw);
      case 'url':
        return this.readUrlDefinition(line, after);
      case 'build':
      case 'buy':
      case 'outsource':
        return this.readMethod(line, after, kw);
      case 'accelerator':
      case 'deaccelerator':
        return this.readAccelerator(line, after, kw);
      case 'submap':
        return this.readSubmap(line, after);
      default: {
        // A link whose name holds a tuple (`A [x] -> B`) still reads as one.
        const link = readLink(line, this.lineNo, this.currentLine);
        if (link) this.pendingLinks.push(link);
        else this.keep(line, unknownStatementMessage(line));
      }
    }
  }

  private readBlockChild(after: string): boolean {
    const blockPipeline = this.blockPipeline!;
    const child = parseBlockChild(after, this.report);
    if (child) {
      blockPipeline.children.push({
        ...child,
        maturity: this.clamp(child.maturity),
        lineNo: this.lineNo,
        text: this.currentLine,
      });
      return true;
    }
    if (splitAtCoords(after)?.name) {
      this.diag(
        `Component with [visibility, maturity] inside the block of pipeline "${blockPipeline.name}" is not a child — use [maturity]`,
      );
    }
    return false;
  }

  private readAnchor(line: string, after: string): void {
    const node = parseNode(after, ANCHOR_SUFFIXES, this.report);
    if (!node) return this.failed(line);
    const label = this.nameElement(node.name, 'anchor');
    const id = this.ids.alloc('anchor', label);
    const anchor: AnchorElement = compact({
      id,
      elementType: 'anchor',
      label,
      position: this.position(node.coords.a, node.coords.b),
      labelOffset: node.labelOffset,
      color: node.color,
    }) as AnchorElement;
    this.elements.push(anchor);
    this.register(node.name, label, id);
  }

  /** `component`/`market`/`ecosystem` and `build`/`buy`/`outsource` lines with coordinates. */
  private pushComponent(after: string, kw: string): boolean {
    const keywordMethod = METHODS.has(kw) ? (kw as Method) : undefined;
    const node = parseNode(after, COMPONENT_SUFFIXES, this.report, keywordMethod);
    if (!node) return false;
    const decorators = mergeLegacy(kw, node.decorators);
    const label = this.nameElement(node.name, 'component');
    const id = this.ids.alloc('cmp', label);
    const component: ComponentElement = compact({
      id,
      elementType: 'component',
      label,
      position: this.position(node.coords.a, node.coords.b),
      labelOffset: node.labelOffset,
      decorators: Object.keys(decorators).length ? decorators : undefined,
      color: node.color,
    }) as ComponentElement;
    this.elements.push(component);
    if (node.urlRef) this.addUrlRef(node.urlRef);
    this.register(node.name, label, id);
    return true;
  }

  private readNote(line: string, after: string): void {
    const split = splitAtCoords(after);
    if (!split) return this.failed(line);
    const { color } = readSuffix(split.suffix, NOTE_SUFFIXES, this.report);
    this.reportMisplacedSuffix(
      splitTrailingGroups(split.name, { color: true, height: false }).groups,
      'before the coordinates is read as part of the text',
      'write it after them',
    );
    // Literal `\n` back into real line breaks (multi-line notes).
    const textPart = this.readText(split.name.replace(/\\n/g, '\n'));
    const note: NoteElement = compact({
      id: this.ids.alloc('note', textPart || 'note'),
      elementType: 'note',
      label: textPart,
      position: this.position(split.coords.a, split.coords.b),
      color,
    }) as NoteElement;
    this.elements.push(note);
  }

  /** `pipeline X [s, e]`, `pipeline X` (block form, range from children) — optionally with `{` at the end. */
  private readPipeline(line: string, after: string): void {
    this.endUnclosedBlock();
    let body = after;
    let opensBlock = false;
    while (body.endsWith('{')) {
      if (opensBlock) this.diag('Ignored "{" — a block must directly follow a pipeline line');
      opensBlock = true;
      body = body.slice(0, -1).trim();
    }
    const { name, range, suffixText, misplaced } = splitPipelineLine(body);
    if (!name) return this.failed(line);
    if (range && !range.coords) this.diag(unreadableNumberMessage(range.tuple));
    this.reportMisplacedSuffix(
      misplaced,
      'before the coordinates is read as part of the name',
      'write it after them',
    );
    const notes: string[] = [];
    const note = (message: string) => notes.push(message);
    // Project extension `(y 0.x)`: the OWM pipeline line has no slot for the height —
    // without it a standalone pipeline snaps back to visibility 0.5 on every round trip.
    const suffix = readSuffix(suffixText, PIPELINE_SUFFIXES, note);
    const coords = range?.coords;
    const pending: PendingPipeline = {
      name,
      lineNo: this.lineNo,
      text: this.currentLine,
      ...(coords ? { start: this.clamp(coords.a), end: this.clamp(coords.b) } : {}),
      ...(suffix.height !== undefined
        ? { visibility: roundAsWritten(this.clamp(suffix.height, note)) }
        : {}),
      ...(suffix.color ? { color: suffix.color } : {}),
      notes,
      raw: line.slice(0, line.length - after.length) + body,
      children: [],
    };
    this.pendingPipeline.push(pending);
    if (opensBlock) {
      this.blockPipeline = pending;
      this.blockOpening = { line: this.lineNo, text: this.currentLine };
    } else this.lastPipeline = pending;
  }

  private readEvolve(line: string, after: string): void {
    const notes: string[] = [];
    const note = (message: string) => notes.push(message);
    const evolve = parseEvolve(after, note);
    if (!evolve) return this.failed(line);
    this.pendingEvolve.push({
      ...evolve,
      target: this.clamp(evolve.target, note),
      notes,
      raw: line,
      lineNo: this.lineNo,
      text: this.currentLine,
    });
  }

  private readStyle(line: string, after: string): void {
    const style = after.toLowerCase();
    if (KNOWN_STYLES.has(style)) {
      this.setConfig('style', { ...this.config, style: style as MapStyle });
    } else this.failed(line);
  }

  private readSize(line: string, after: string): void {
    const split = splitAtCoords(after);
    const coords = split?.coords;
    if (!coords || !isRoundTrippableNumber(coords.a) || !isRoundTrippableNumber(coords.b)) {
      return this.failed(line);
    }
    this.reportTextBefore(split.name);
    readSuffix(split.suffix, NO_SUFFIXES, this.report);
    this.setConfig('size', { ...this.config, size: { width: coords.a, height: coords.b } });
  }

  private readEvolution(line: string, after: string): void {
    // Exactly four positions (the serializer always writes four). Do NOT filter out
    // empty segments, otherwise an empty stage label is lost (the whole line would fall
    // out of the 4-slot grid and land in rawPassthrough -> axis snaps back to default).
    const parts = after.split('->').map((s) => s.trim());
    if (parts.length === 4) {
      const [first, second, third, fourth] = parts.map((part) => this.readText(part));
      const evolutionLabels = [first!, second!, third!, fourth!] as const;
      this.setConfig('evolution', { ...this.config, evolutionLabels });
    } else {
      const reason = `Evolution needs exactly four stages, found ${parts.length}`;
      this.keepUnusedConfigLine('evolution', line, reason);
    }
  }

  /** `y-axis Label->BottomLabel->TopLabel` — keeps the end labels losslessly too. */
  private readYAxis(line: string, after: string): void {
    const written = after.split('->').map((s) => s.trim());
    const [label, bottom, top] = written.filter(Boolean).map((part) => this.readText(part));
    if (!label) return this.keepUnusedConfigLine('y-axis', line, 'y-axis has no label');
    const { yAxisEndLabels: _replaced, ...otherConfig } = this.config;
    const ends = bottom && top ? ([bottom, top] as const) : undefined;
    this.setConfig('y-axis', {
      ...otherConfig,
      yAxisLabel: label,
      ...(ends ? { yAxisEndLabels: ends } : {}),
    });
    if (written.length !== 1 && !(written.length === 3 && written.every(Boolean))) {
      const read = [label, ...(ends ?? [])].join('->');
      this.diag(`y-axis takes "Label" or "Label->Bottom->Top" — read as "${read}"`);
    }
  }

  private readAnnotationsBox(line: string, after: string): void {
    const split = splitAtCoords(after);
    if (!split) {
      return this.keep(
        line,
        'Annotations box has no position — not used; add [visibility, maturity]',
      );
    }
    this.reportTextBefore(split.name);
    readSuffix(split.suffix, NO_SUFFIXES, this.report);
    const annotationsBoxPosition = this.position(split.coords.a, split.coords.b);
    this.setConfig('annotations', { ...this.config, annotationsBoxPosition });
  }

  /** `annotation N <position> [(color …)] <text>`; the position is a tuple or a tuple list. */
  private readAnnotation(line: string, after: string): void {
    const numMatch = /^\s*(\d+)/.exec(after);
    const number = numMatch ? Number(numMatch[1]) : ++this.annotationCounter;
    if (!Number.isSafeInteger(number)) return this.failed(line);
    const found = parsePositions(after.replace(/^\s*\d+\s*/, ''));
    if (!found) {
      return this.keep(line, 'Annotation has no position — not drawn; add [visibility, maturity]');
    }
    if (!found.tuples.length) return this.failed(line);
    for (const unreadable of found.unreadable) this.diag(unreadableNumberMessage(unreadable));
    this.reportTextBefore(found.before);
    const { color, rest } = splitLeadingColor(found.after);
    this.reportMisplacedSuffix(
      splitTrailingGroups(rest, { color: true, height: false }).groups,
      'after the annotation text is read as part of the text',
      'write it directly after the position',
    );
    const text = this.readText(rest.trim());
    const positions: Coordinate[] = found.tuples.map((t) => this.position(t.a, t.b));
    const annotation: AnnotationElement = {
      id: this.ids.alloc('anno', String(number)),
      elementType: 'annotation',
      label: text,
      position: positions[0]!,
      number,
      positions,
      text,
      ...(color ? { color } : {}),
    };
    this.elements.push(annotation);
  }

  /** Project extension (freeform drawing): `line [[v,e], [v,e], …] (closed) (dashed) (color x)`. */
  private readDrawing(line: string, after: string): void {
    const list = parseMultiCoords(after);
    if (!list || list.tuples.length < 2) return this.failed(line);
    for (const unreadable of list.unreadable) this.diag(unreadableNumberMessage(unreadable));
    this.reportTextBefore(list.before);
    const suffix = readSuffix(list.after, DRAWING_SUFFIXES, this.report);
    const points = list.tuples.map((t) => this.position(t.a, t.b));
    const drawing: DrawingElement = {
      id: this.ids.alloc('draw', 'line'),
      elementType: 'drawing',
      label: '',
      position: points[0]!,
      points,
      ...(suffix.closed ? { closed: true } : {}),
      ...(suffix.strokeStyle ? { strokeStyle: suffix.strokeStyle } : {}),
      ...(suffix.color ? { color: suffix.color } : {}),
    };
    this.elements.push(drawing);
  }

  /** Canonical OWM form: `<kind> [vis1, mat1, vis2, mat2]` (two corners, normalized). */
  private readAttitude(line: string, after: string, kind: string): void {
    const split = splitAtCoords4(after);
    if (!split) return this.failed(line);
    this.reportTextBefore(split.before);
    const { color } = readSuffix(split.after, ATTITUDE_SUFFIXES, this.report);
    const { a, b, c, d } = split.coords;
    const corners = [this.clamp(a), this.clamp(b), this.clamp(c), this.clamp(d)] as const;
    this.elements.push(makeAttitude(this.ids, kind as AttitudeKind, corners, color));
  }

  /** OWM: `url Name [https://…]` — definition, referenced via `url(Name)` on elements. */
  private readUrlDefinition(line: string, after: string): void {
    const definition = readUrlDefinition(after);
    if (!definition) return this.failed(line);
    this.urlDefinitions.push({ ...definition, lineNo: this.lineNo, text: this.currentLine });
  }

  /**
   * Legacy OWM: `buy <Name>` (method on an existing component) or `buy <Name> [vis, mat]` (create a
   * component with a method).
   */
  private readMethod(line: string, after: string, kw: string): void {
    if (this.pushComponent(after, kw)) return;
    if (!after) return this.keep(line, `${kw}: needs a component name — not used`);
    this.pendingMethod.push({
      name: after,
      method: kw as Method,
      raw: line,
      lineNo: this.lineNo,
      text: this.currentLine,
    });
  }

  private readAccelerator(line: string, after: string, kw: string): void {
    const node = parseNode(after, ACCELERATOR_SUFFIXES, this.report);
    if (!node) return this.failed(line);
    const label = this.nameElement(node.name, 'accelerator');
    const id = this.ids.alloc('accel', label);
    const accelerator: AcceleratorElement = {
      id,
      elementType: 'accelerator',
      direction: kw === 'deaccelerator' ? 'deaccelerate' : 'accelerate',
      label,
      position: this.position(node.coords.a, node.coords.b),
      ...(node.color ? { color: node.color } : {}),
    };
    this.elements.push(accelerator);
    this.register(node.name, label, id);
  }

  private readSubmap(line: string, after: string): void {
    const node = parseNode(after, SUBMAP_SUFFIXES, this.report);
    if (!node) return this.failed(line);
    const label = this.nameElement(node.name, 'submap');
    const id = this.ids.alloc('submap', label);
    const submap: SubmapElement = {
      id,
      elementType: 'submap',
      label,
      position: this.position(node.coords.a, node.coords.b),
      ...(node.color ? { color: node.color } : {}),
    };
    this.elements.push(submap);
    if (node.urlRef) this.addUrlRef(node.urlRef);
    this.register(node.name, label, id);
  }

  private finish(): MapReading {
    const removedFromPassthrough = replacedConfigLines(
      this.unusedConfigLines,
      this.config,
      this.reportAt,
    );
    // BEFORE evolve/method so that evolve/buy can reference block children.
    this.resolvePipelines();
    const indexById = new Map(this.elements.map((el, index) => [el.id, index]));
    this.resolveEvolves(indexById);
    this.resolveMethods(indexById);
    const keptDefinitions = resolveUrlReferences(
      this.elements,
      this.pendingUrlRefs,
      this.urlDefinitions,
      this.reportAt,
    );
    for (const definition of keptDefinitions) {
      this.keepLine(
        `url ${definition.name} [${definition.address}]`,
        definition.lineNo,
        definition.text,
      );
    }

    const declaredNames = new Set([...this.idBySourceName.keys(), ...this.idByElementName.keys()]);
    const edges = buildEdges(
      this.pendingLinks,
      (name) => this.idOfName(name),
      (link, missing) => {
        this.keepLine(link.raw, link.lineNo, link.text);
        this.diag(`Link: "${missing}" not found`, link.lineNo, link.text);
      },
      (link) => link.label && this.readText(link.label, link.lineNo, link.text),
    );

    const kept = this.passthrough.filter((_, index) => !removedFromPassthrough.has(index));
    const rawPassthrough = withoutClosersOfKeptComments(kept, this.reportAt);
    const map = compact({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      config: this.config,
      elements: this.elements,
      edges,
      rawPassthrough: rawPassthrough.length ? rawPassthrough : undefined,
    }) as WardleyMap;
    return {
      result: { map: validateMap(map), diagnostics: this.diagnostics },
      declaredNames,
      keywordLinks: this.keywordLinks,
    };
  }

  /**
   * A pipeline pairs with the component written under its name: it takes that component's height,
   * as the serializer assumes when it leaves out `(y …)`. Block children are not such components.
   */
  private resolvePipelines(): void {
    const componentByName = new Map<string, MapElement>();
    for (const el of this.elements) {
      if (el.elementType === 'component') componentByName.set(el.label, el);
    }
    for (const p of this.pendingPipeline) {
      const label = writtenName(p.name, 'pipeline');
      const component = componentByName.get(label);
      const writtenRange = pipelineRange(p);
      if (!writtenRange) {
        this.keepLine(p.raw, p.lineNo, p.text);
        // OWM reads `pipeline X` next to `component X` as a pipeline that is not drawn.
        if (!component) {
          this.diag(
            `Pipeline "${p.name}" has no range — not drawn; add [start, end] or child components`,
            p.lineNo,
            p.text,
          );
        }
        continue;
      }
      for (const message of p.notes) this.diag(message, p.lineNo, p.text);
      if (label !== p.name) this.diag(renamedMessage(p.name, label), p.lineNo, p.text);
      const range = widenEmptyRange(writtenRange);
      const widened = range.start !== writtenRange.start || range.end !== writtenRange.end;
      if (widened && !writtenRange.fromChildren) {
        this.diag(
          `Pipeline "${p.name}" range is empty or reversed — changed to [${range.start}, ${range.end}]`,
          p.lineNo,
          p.text,
        );
      }
      const visibility = p.visibility ?? component?.position.visibility ?? 0.5;
      const id = this.ids.alloc('pipeline', label);
      // Standalone pipelines (no same-named component) are edge endpoints themselves; an element
      // with that name still wins.
      if (this.idOfName(p.name) === undefined && this.idOfName(label) === undefined) {
        this.register(p.name, label, id);
      }
      const childNames = p.children.map((child) =>
        this.nameElement(child.name, 'component', child.lineNo, child.text),
      );
      const { pipeline, children } = pipelineElements(
        { ...p, name: label },
        id,
        visibility,
        range,
        this.ids,
        childNames,
      );
      this.elements.push(pipeline);
      children.forEach((child, index) => {
        this.elements.push(child);
        this.register(p.children[index]!.name, child.label, child.id);
      });
    }
  }

  private componentIndex(name: string, indexById: ReadonlyMap<string, number>): number {
    const index = indexById.get(this.idOfName(name) ?? '');
    return index !== undefined && this.elements[index]!.elementType === 'component' ? index : -1;
  }

  private resolveEvolves(indexById: ReadonlyMap<string, number>): void {
    const evolveLineOf = new Map<string, number>();
    for (const ev of this.pendingEvolve) {
      const index = this.componentIndex(ev.name, indexById);
      if (index < 0) {
        this.keepLine(ev.raw, ev.lineNo, ev.text);
        const misplaced = splitMisplacedEvolveSuffix(ev.name);
        const hint =
          misplaced && this.componentIndex(misplaced.name, indexById) >= 0
            ? misplacedEvolveSuffixHint(misplaced)
            : '';
        this.diag(`evolve: component "${ev.name}" not found${hint}`, ev.lineNo, ev.text);
        continue;
      }
      for (const message of ev.notes) this.diag(message, ev.lineNo, ev.text);
      const component = this.elements[index] as ComponentElement;
      const earlier = evolveLineOf.get(component.id);
      if (earlier !== undefined) {
        const message = `Repeated evolve for "${ev.name}" — replaces the one on line ${earlier}`;
        this.diag(message, ev.lineNo, ev.text);
      }
      evolveLineOf.set(component.id, ev.lineNo);
      const movement = compact({
        targetEvolution: ev.target,
        newLabel: ev.newLabel && this.readText(ev.newLabel, ev.lineNo, ev.text),
        method: ev.method,
        labelOffset: ev.labelOffset,
      }) as Movement;
      this.elements[index] = { ...component, movement };
    }
  }

  /** Legacy standalone methods (`buy <name>`). */
  private resolveMethods(indexById: ReadonlyMap<string, number>): void {
    for (const pm of this.pendingMethod) {
      const index = this.componentIndex(pm.name, indexById);
      if (index < 0) {
        this.keepLine(pm.raw, pm.lineNo, pm.text);
        this.diag(`${pm.method}: component "${pm.name}" not found`, pm.lineNo, pm.text);
        continue;
      }
      const el = this.elements[index] as ComponentElement;
      const replaced = el.decorators?.method;
      if (replaced && replaced !== pm.method) {
        const message = `${pm.method}: "${pm.name}" already has the method "${replaced}" — replaced`;
        this.diag(message, pm.lineNo, pm.text);
      }
      this.elements[index] = { ...el, decorators: { ...el.decorators, method: pm.method } };
    }
  }
}

function renamedMessage(sourceName: string, name: string): string {
  return `Name "${sourceName}" renamed to "${name}" — a name cannot hold link operators ("->", "+>", "+<", "+'"), comment markers or a leading "{"`;
}

function withoutTrailingCarriageReturns(line: string): string {
  let end = line.length;
  while (end > 0 && line[end - 1] === '\r') end--;
  return line.slice(0, end);
}

/**
 * The serializer writes rawPassthrough after everything else, in order. A kept line that lands
 * behind a kept `/*` without its `*\/` is inside that comment on the next parse, and a `*\/` in it
 * would end the comment early, so it is removed there. Elsewhere a `*\/` without a `/*` is plain
 * text and stays.
 */
function withoutClosersOfKeptComments(
  entries: readonly PassthroughEntry[],
  report: Report,
): string[] {
  const nextParse = new CommentStripper();
  return entries.map((entry) => {
    let text = entry.text;
    if (!entry.isComment && nextParse.insideBlockComment && text.includes('*/')) {
      text = text.replaceAll('*/', ' ');
      report(
        'Ignored "*/" — this line is kept after an unclosed "/*" and would end that comment',
        entry.lineNo,
        entry.source,
      );
    }
    nextParse.strip(text);
    return text;
  });
}

/**
 * The serializer writes the config instead of an unusable `evolution`/`y-axis` line once another
 * line sets it; the parser drops such a line the same way. Returns their passthrough indexes.
 */
function replacedConfigLines(
  unusedLines: readonly UnusedConfigLine[],
  config: MapConfig,
  report: Report,
): Set<number> {
  const configIsSet = {
    evolution: config.evolutionLabels !== undefined,
    'y-axis': config.yAxisLabel !== undefined,
  };
  const replacedIndexes = new Set<number>();
  for (const unused of unusedLines) {
    const replaced = configIsSet[unused.keyword];
    if (replaced) replacedIndexes.add(unused.index);
    const outcome = replaced ? `removed; another "${unused.keyword}" line sets it` : 'not used';
    report(`${unused.reason} — ${outcome}`, unused.line, unused.text);
  }
  return replacedIndexes;
}

/**
 * Resolves `url(Name)` references into component.url / submap.urlRef. A later definition of a name
 * replaces an earlier one. Returns, in source order, the definitions to keep losslessly: those no
 * element references and those replaced.
 */
function resolveUrlReferences(
  elements: MapElement[],
  refs: readonly PendingUrlRef[],
  definitions: readonly UrlDefinition[],
  report: Report,
): UrlDefinition[] {
  const definitionByName = new Map<string, UrlDefinition>();
  const replaced = new Set<UrlDefinition>();
  for (const definition of definitions) {
    const earlier = definitionByName.get(definition.name);
    if (earlier) {
      replaced.add(earlier);
      report(
        `Repeated url definition "${definition.name}" — replaces the one on line ${earlier.lineNo}, which is kept unused`,
        definition.lineNo,
        definition.text,
      );
    }
    definitionByName.set(definition.name, definition);
  }
  const used = new Set<UrlDefinition>();
  for (const { index, ref, line, text } of refs) {
    const definition = definitionByName.get(ref);
    if (definition) used.add(definition);
    // Also accept a directly embedded address (`url(https://…)`).
    const address = definition?.address ?? (/^[a-z][\w+.-]*:\/\//i.test(ref) ? ref : undefined);
    if (!address) {
      report(`url(${ref}) has no matching "url ${ref} [address]" line — ignored`, line, text);
      continue;
    }
    const el = elements[index]!;
    if (el.elementType === 'component') elements[index] = { ...el, url: address };
    else if (el.elementType === 'submap') elements[index] = { ...el, urlRef: address };
  }
  return definitions.filter((definition) => replaced.has(definition) || !used.has(definition));
}

interface ParsedNode {
  readonly name: string;
  readonly coords: { a: number; b: number };
  readonly decorators: InlineDecorators;
  readonly labelOffset?: LabelOffsetToken;
  /** `url(Name)` reference (definition name, not yet resolved). */
  readonly urlRef?: string;
  /** Project extension `(color …)` — supported on every element line. */
  readonly color?: string;
}

/**
 * Parses `<name> [a, b] <suffixes>`. Suffixes are looked up ONLY AFTER the coordinates —
 * parentheses (`Tea (green)`) or words like "inertia" inside the name stay untouched.
 */
function parseNode(
  after: string,
  suffixes: SuffixSlots,
  report: (message: string) => void,
  keywordMethod?: Method,
): ParsedNode | null {
  const split = splitAtCoords(after);
  if (!split || !split.name) return null;
  const suffix = readSuffix(split.suffix, suffixes, report, 'after the coordinates', keywordMethod);
  return compact({
    name: split.name,
    coords: split.coords,
    decorators: suffix.decorators,
    labelOffset: suffix.labelOffset,
    urlRef: suffix.urlRef,
    color: suffix.color,
  }) as ParsedNode;
}

/** The suffixes a statement can hold after its coordinates; anything else is reported and dropped. */
type SuffixSlot = 'color' | 'decorators' | 'method' | 'label' | 'url' | 'height' | 'stroke';
type SuffixSlots = ReadonlySet<SuffixSlot>;

const COMPONENT_SUFFIXES: SuffixSlots = new Set(['color', 'decorators', 'label', 'url']);
const PIPELINE_CHILD_SUFFIXES: SuffixSlots = new Set(['color', 'decorators', 'label']);
const ANCHOR_SUFFIXES: SuffixSlots = new Set(['color', 'label']);
const SUBMAP_SUFFIXES: SuffixSlots = new Set(['color', 'url']);
const ACCELERATOR_SUFFIXES: SuffixSlots = new Set(['color']);
const NOTE_SUFFIXES: SuffixSlots = new Set(['color']);
const ATTITUDE_SUFFIXES: SuffixSlots = new Set(['color']);
const PIPELINE_SUFFIXES: SuffixSlots = new Set(['color', 'height']);
const DRAWING_SUFFIXES: SuffixSlots = new Set(['color', 'stroke']);
const EVOLVE_SUFFIXES: SuffixSlots = new Set(['method']);
const NO_SUFFIXES: SuffixSlots = new Set();

interface SuffixReading {
  readonly color?: string;
  readonly decorators: InlineDecorators;
  readonly labelOffset?: LabelOffsetToken;
  readonly urlRef?: string;
  readonly height?: number;
  readonly closed?: boolean;
  readonly strokeStyle?: DrawingStrokeStyle;
}

/**
 * Reads the suffixes a statement can hold. The first of each single-valued suffix wins (a method
 * given as the statement keyword comes first); repeats and everything the statement cannot hold
 * are reported as ignored text, unreadable numbers as such.
 */
function readSuffix(
  text: string,
  slots: SuffixSlots,
  report: (message: string) => void,
  place = 'after the coordinates',
  keywordMethod?: Method,
): SuffixReading {
  const reading: {
    color?: string;
    labelOffset?: LabelOffsetToken;
    urlRef?: string;
    height?: number;
    closed?: boolean;
    strokeStyle?: DrawingStrokeStyle;
  } = {};
  const decorators: MutableDecorators = keywordMethod ? { method: keywordMethod } : {};
  const seen = new Set<SuffixToken['kind']>();
  const ignored: TextSpan[] = [];
  /** Whether a group item fits the statement; sets it when it does. */
  const readGroupItem = (item: string): boolean => {
    if (
      slots.has('decorators') &&
      (item === 'market' || item === 'ecosystem' || item === 'inertia')
    ) {
      decorators[item] = true;
      return true;
    }
    if ((slots.has('decorators') || slots.has('method')) && METHODS.has(item)) {
      decorators.method ??= item as Method;
      return decorators.method === item;
    }
    if (slots.has('stroke') && item === 'closed') {
      reading.closed = true;
      return true;
    }
    if (slots.has('stroke') && (item === 'dashed' || item === 'dotted')) {
      reading.strokeStyle ??= item;
      return reading.strokeStyle === item;
    }
    return false;
  };
  const firstOf = (token: SuffixToken, slot: SuffixSlot): boolean => {
    if (!slots.has(slot) || seen.has(token.kind)) return false;
    seen.add(token.kind);
    return true;
  };

  for (const token of scanSuffix(text)) {
    switch (token.kind) {
      case 'color':
        if (firstOf(token, 'color')) reading.color = token.color;
        else ignored.push(token);
        break;
      case 'height':
        if (firstOf(token, 'height')) {
          const height = readUnclampedNumber(token.value);
          if (height === null) report(unreadableNumberMessage(token.text));
          else reading.height = height;
        } else ignored.push(token);
        break;
      case 'label':
        if (firstOf(token, 'label')) {
          const dx = readUnclampedNumber(token.dx);
          const dy = readUnclampedNumber(token.dy);
          if (dx === null || dy === null) report(unreadableNumberMessage(token.text));
          else reading.labelOffset = { dx, dy };
        } else ignored.push(token);
        break;
      case 'url':
        if (token.ref && firstOf(token, 'url')) reading.urlRef = token.ref;
        else ignored.push(token);
        break;
      case 'inertia':
        if (slots.has('decorators')) decorators.inertia = true;
        else ignored.push(token);
        break;
      case 'group': {
        const unfit = token.items.filter((item) => !readGroupItem(item.text.toLowerCase()));
        if (unfit.length === token.items.length) ignored.push(token);
        else for (const item of unfit) ignored.push(item);
        break;
      }
      case 'word':
        ignored.push(token);
    }
  }
  if (ignored.length) report(`Ignored text ${place}: ${quotedSpans(text, ignored)}`);
  return compact({ ...reading, decorators });
}

/** The spans as they stand in the text, neighbours separated only by spaces joined into one. */
function quotedSpans(text: string, spans: readonly TextSpan[]): string {
  const pieces: string[] = [];
  let start = spans[0]!.at;
  let end = start + spans[0]!.text.length;
  for (let i = 1; i < spans.length; i++) {
    const span = spans[i]!;
    if (text.slice(end, span.at).trim() !== '') {
      pieces.push(text.slice(start, end));
      start = span.at;
    }
    end = span.at + span.text.length;
  }
  pieces.push(text.slice(start, end));
  return pieces.map((piece) => `"${piece}"`).join(', ');
}

/**
 * Splits `<name> [start, end] <suffixes>`; without a range, trailing `(color …)`/`(y …)` are the
 * suffixes. `misplaced` are such groups written at the end of the name before a range.
 */
function splitPipelineLine(body: string): {
  name: string;
  range: { tuple: string; coords: { a: number; b: number } | null } | null;
  suffixText: string;
  misplaced: readonly string[];
} {
  const kinds = { color: true, height: true };
  const split = splitAtTuple(body);
  if (split) {
    return {
      name: split.before,
      range: { tuple: split.tuple, coords: split.coords },
      suffixText: split.after,
      misplaced: splitTrailingGroups(split.before, kinds).groups,
    };
  }
  const { rest, groups } = splitTrailingGroups(body, kinds);
  return { name: rest, range: null, suffixText: groups.join(' '), misplaced: [] };
}

function unreadableNumberMessage(text: string): string {
  return `Unreadable number in "${text}" — ignored`;
}

interface PipelineRange {
  readonly start: number;
  readonly end: number;
  readonly fromChildren?: boolean;
}

function pipelineRange(p: PendingPipeline): PipelineRange | null {
  if (p.start !== undefined && p.end !== undefined) {
    return { start: roundAsWritten(p.start), end: roundAsWritten(p.end) };
  }
  const [first, ...others] = p.children;
  if (!first) return null;
  let start = first.maturity;
  let end = first.maturity;
  for (const child of others) {
    start = Math.min(start, child.maturity);
    end = Math.max(end, child.maturity);
  }
  return { start: roundAsWritten(start), end: roundAsWritten(end), fromChildren: true };
}

/** The model needs end > start; OWM keeps empty or reversed ranges as written. */
function widenEmptyRange({ start, end }: PipelineRange): PipelineRange {
  if (end > start) return { start, end };
  const widenedStart = start >= 1 ? 0.95 : start;
  return { start: widenedStart, end: roundAsWritten(Math.min(1, widenedStart + 0.05)) };
}

function pipelineElements(
  p: PendingPipeline,
  id: string,
  visibility: number,
  range: PipelineRange,
  ids: IdAllocator,
  childNames: readonly string[],
): { pipeline: PipelineElement; children: ComponentElement[] } {
  const children = p.children.map(
    (c, index) =>
      compact({
        id: ids.alloc('cmp', childNames[index]!),
        elementType: 'component',
        label: childNames[index]!,
        position: { visibility, evolution: c.maturity },
        labelOffset: c.labelOffset,
        decorators: Object.keys(c.decorators).length ? c.decorators : undefined,
        pipelineId: id,
        color: c.color,
      }) as ComponentElement,
  );
  const pipeline: PipelineElement = {
    id,
    elementType: 'pipeline',
    label: p.name,
    position: { visibility, evolution: (range.start + range.end) / 2 },
    evolutionStart: range.start,
    evolutionEnd: range.end,
    childIds: children.map((child) => child.id),
    ...(p.color ? { color: p.color } : {}),
  };
  return { pipeline, children };
}

/**
 * Parses a pipeline block child line: `<name> [maturity]` (+ optional decorators/offset). The
 * first numeric tuple decides, so the name may hold other brackets: a `[visibility, maturity]`
 * component is not a child.
 */
function parseBlockChild(
  after: string,
  report: (message: string) => void,
): Omit<PipelineChild, 'lineNo' | 'text'> | null {
  const split = splitAtFirstChildTuple(after);
  if (!split?.before || split.values.length !== 1) return null;
  const maturity = Number(split.values[0]);
  if (Number.isNaN(maturity)) return null;
  const suffix = readSuffix(split.after, PIPELINE_CHILD_SUFFIXES, report);
  return compact({
    name: split.before,
    maturity,
    decorators: suffix.decorators,
    labelOffset: suffix.labelOffset,
    color: suffix.color,
  }) as Omit<PipelineChild, 'lineNo' | 'text'>;
}

/** Builds an AttitudeElement from two (arbitrarily oriented) corners; normalizes to TL/BR. */
function makeAttitude(
  ids: IdAllocator,
  kind: AttitudeKind,
  [v1, m1, v2, m2]: readonly [number, number, number, number],
  color?: string,
): AttitudeElement {
  return {
    id: ids.alloc('attitude', kind),
    elementType: 'attitude',
    kind,
    label: '',
    ...(color ? { color } : {}),
    position: {
      visibility: Math.max(v1, v2),
      evolution: Math.min(m1, m2),
    },
    corner2: {
      visibility: Math.min(v1, v2),
      evolution: Math.max(m1, m2),
    },
  };
}

/** `market`/`ecosystem` and `build`/`buy`/`outsource` as the statement keyword (legacy OWM). */
function mergeLegacy(kw: string, dec: InlineDecorators): ComponentDecorators {
  const merged: Record<string, unknown> = { ...dec };
  if (kw === 'market') merged['market'] = true;
  if (kw === 'ecosystem') merged['ecosystem'] = true;
  if (METHODS.has(kw)) merged['method'] = kw;
  return compact(merged) as ComponentDecorators;
}

const MISPLACED_EVOLVE_SUFFIX_RE = /(?:\((build|buy|outsource)\)|\binertia)$/i;

/** A method group or `inertia` at the end of an evolve name, which older maps wrote there. */
function splitMisplacedEvolveSuffix(name: string): { name: string; suffix: string } | null {
  const m = MISPLACED_EVOLVE_SUFFIX_RE.exec(name);
  if (!m) return null;
  const rest = name.slice(0, m.index).trimEnd();
  return rest ? { name: rest, suffix: m[0] } : null;
}

function misplacedEvolveSuffixHint({ name, suffix }: { name: string; suffix: string }): string {
  return suffix.startsWith('(')
    ? ` — for component "${name}", write "${suffix}" after the target`
    : ` — for component "${name}", write "${suffix}" on its component line`;
}

const NUMBER_TOKEN_RE = /(^|\s)([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(?=\s|\(|$)/gi;

/**
 * Parses `evolve <name>[-><new name>] <target> [label [dx, dy]] [(build|buy|outsource)]` from the
 * end: the target is the last number, so numbers and parentheses inside the name stay part of it.
 */
function parseEvolve(
  after: string,
  report: (message: string) => void,
): Omit<PendingEvolve, 'raw' | 'lineNo' | 'text' | 'notes'> | null {
  const lo = parseLabelOffset(after);
  let targetMatch: RegExpExecArray | undefined;
  for (const match of lo.rest.matchAll(NUMBER_TOKEN_RE)) targetMatch = match;
  if (!targetMatch) return null;
  const targetAt = targetMatch.index + targetMatch[1]!.length;
  const namePart = lo.rest.slice(0, targetAt).trim();
  const target = Number(targetMatch[2]);
  if (!namePart || !Number.isFinite(target)) return null;
  if (lo.unreadable) report(unreadableNumberMessage(lo.unreadable));
  const tail = readSuffix(
    lo.rest.slice(targetAt + targetMatch[2]!.length),
    EVOLVE_SUFFIXES,
    report,
    'after the evolve target',
  );
  const renameIdx = namePart.indexOf('->');
  const name = renameIdx >= 0 ? namePart.slice(0, renameIdx).trim() : namePart;
  const newLabel = renameIdx >= 0 ? namePart.slice(renameIdx + 2).trim() : undefined;
  return compact({
    name,
    newLabel: newLabel || undefined,
    target,
    method: tail.decorators.method,
    labelOffset: lo.labelOffset ?? undefined,
  }) as Omit<PendingEvolve, 'raw' | 'lineNo' | 'text' | 'notes'>;
}
