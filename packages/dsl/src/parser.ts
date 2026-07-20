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
  indexOfOutsideQuotes,
  keywordOf,
  parseColor,
  parseCoords,
  parseCoords4,
  parseDecorators,
  parseLabelOffset,
  parseMultiCoords,
  parseUrlRef,
  slug,
  splitAtCoords,
  splitLineComment,
  stripCoords,
  type InlineDecorators,
} from './lexer.js';

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
// Config/special keywords that must NOT be (pre-)detected as an edge — `evolution`/`evolve`/
// `y-axis`/`title` can themselves contain `->` and have their own handling in the switch.
const NON_LINK_KEYWORDS: ReadonlySet<string> = new Set([
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
  readonly raw: string;
  readonly lineNo: number;
}
interface PendingEvolve {
  readonly name: string;
  readonly newLabel?: string;
  readonly target: number;
  readonly method?: Movement['method'];
  readonly labelOffset?: { dx: number; dy: number };
  readonly raw: string;
  readonly lineNo: number;
}
interface PipelineChild {
  readonly name: string;
  readonly maturity: number;
  readonly decorators: InlineDecorators;
  readonly labelOffset?: { dx: number; dy: number };
  readonly color?: string;
}
interface PendingPipeline {
  readonly name: string;
  /** Explicit range; if absent (OWM v2 block form without coordinates), it is derived from the children. */
  readonly start?: number;
  readonly end?: number;
  /** Explicit height — project extension `(y 0.x)`; otherwise derived from the anchor component. */
  readonly visibility?: number;
  readonly color?: string;
  readonly raw: string;
  readonly children: PipelineChild[];
}
/** Legacy standalone line `build|buy|outsource <Name>` — method on an existing component. */
interface PendingMethod {
  readonly name: string;
  readonly method: Method;
  readonly raw: string;
  readonly lineNo: number;
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Finding produced while parsing — line is 1-based; `text` is the (comment-stripped) line. */
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
  const diagnostics: ParseDiagnostic[] = [];
  const ids = new IdAllocator();
  const nameToId = new Map<string, string>();
  const elements: MapElement[] = [];
  const rawPassthrough: string[] = [];
  const pendingLinks: PendingLink[] = [];
  const pendingEvolve: PendingEvolve[] = [];
  const pendingPipeline: PendingPipeline[] = [];
  const pendingMethod: PendingMethod[] = [];

  let config: MapConfig = { title: 'Untitled Map' };
  let annoCounter = 0;
  let inBlockComment = false;
  /** OWM `url Name [address]` definitions; resolved into component.url / submap.urlRef. */
  const urlDefs = new Map<string, string>();
  /** Not-yet-resolved `url(Name)` references: element index -> definition name. */
  const pendingUrlRefs: Array<{ readonly index: number; readonly ref: string }> = [];
  /** Pipeline from the immediately preceding line (candidate for a `{` block opening). */
  let lastPipeline: PendingPipeline | null = null;
  /** Currently open pipeline block (`{ … }`); component lines inside it are added as children. */
  let blockPipeline: PendingPipeline | null = null;

  const register = (name: string, id: string) => {
    if (!nameToId.has(name)) nameToId.set(name, id);
  };

  // Diagnostics helpers: read the current line/number from the loop state.
  let lineNo = 0;
  let currentLine = '';

  /** Tries to capture a line as a dependency/flow. Returns true when consumed. */
  const pushLink = (line: string): boolean => {
    // Split off an optional link annotation after ';' (e.g. `A -> B; limited by`).
    const semi = line.indexOf(';');
    const core = semi >= 0 ? line.slice(0, semi).trim() : line;
    const linkLabel = semi >= 0 ? line.slice(semi + 1).trim() : '';
    const dep = splitDependency(core);
    const flow = dep ? null : splitFlow(core);
    if (dep) {
      pendingLinks.push({
        left: dep.left,
        right: dep.right,
        kind: 'dependency',
        ...(linkLabel ? { label: linkLabel } : {}),
        raw: line,
        lineNo,
      });
      return true;
    }
    if (flow) {
      pendingLinks.push({
        left: flow.left,
        right: flow.right,
        kind: 'flow',
        bidirectional: flow.op === '<>',
        reverse: flow.op === '<',
        ...(flow.value ? { flowValue: flow.value } : {}),
        ...(linkLabel ? { label: linkLabel } : {}),
        raw: line,
        lineNo,
      });
      return true;
    }
    return false;
  };
  const diag = (message: string, atLine = lineNo, text_ = currentLine) =>
    diagnostics.push({ line: atLine, message, text: text_ });
  /** Passthrough for a line that looks like a known construct but cannot be parsed. */
  const failed = (l: string) => {
    rawPassthrough.push(l);
    diag('Line could not be interpreted (kept losslessly in rawPassthrough)');
  };
  /** Clamps a normalized value to [0,1] — with a diagnostic instead of a later validation crash. */
  const clampDiag = (n: number): number => {
    if (n < 0 || n > 1) diag(`Coordinate ${n} is outside [0,1] and was clamped`);
    return n < 0 ? 0 : n > 1 ? 1 : n;
  };
  const pos = (visibility: number, evolution: number) => ({
    visibility: clampDiag(visibility),
    evolution: clampDiag(evolution),
  });

  const sourceLines = text.split(/\r?\n/);
  for (let i = 0; i < sourceLines.length; i++) {
    const raw = sourceLines[i]!;
    lineNo = i + 1;
    currentLine = raw.trim();
    let working = raw;

    // --- Comments (`//`, `/* */`): strip, but keep losslessly in rawPassthrough. ---
    if (inBlockComment) {
      const close = working.indexOf('*/');
      if (close < 0) {
        rawPassthrough.push(raw);
        continue;
      }
      rawPassthrough.push(working.slice(0, close + 2));
      working = working.slice(close + 2);
      inBlockComment = false;
    }
    // OWM rule: url lines are exempt from comment stripping (https://…).
    if (keywordOf(working) !== 'url') {
      let open = indexOfOutsideQuotes(working, '/*');
      while (open >= 0) {
        const close = working.indexOf('*/', open + 2);
        if (close < 0) {
          rawPassthrough.push(working.slice(open));
          working = working.slice(0, open);
          inBlockComment = true;
          break;
        }
        rawPassthrough.push(working.slice(open, close + 2));
        working = `${working.slice(0, open)} ${working.slice(close + 2)}`;
        open = indexOfOutsideQuotes(working, '/*');
      }
      const { code, comment } = splitLineComment(working);
      if (comment !== null) rawPassthrough.push(comment);
      working = code;
    }

    const line = working.trim();
    if (!line) continue;

    // --- Pipeline block (OWM v2): `pipeline X [..]` followed by `{ component Child [maturity] }` ---
    if (blockPipeline) {
      if (line === '}') {
        blockPipeline = null;
        continue;
      }
      const childKw = keywordOf(line);
      if (childKw === 'component') {
        const child = parseBlockChild(line.slice(childKw.length).trim());
        if (child) {
          blockPipeline.children.push(child);
          continue;
        }
      }
      rawPassthrough.push(line);
      continue;
    }
    if (line.startsWith('{')) {
      if (lastPipeline) {
        blockPipeline = lastPipeline;
        lastPipeline = null;
        continue;
      }
      rawPassthrough.push(line);
      continue;
    }

    const kw = keywordOf(line);
    const after = line.slice(kw.length).trim();
    // `{` binds only to the DIRECTLY preceding pipeline line.
    if (kw !== 'pipeline') lastPipeline = null;

    // Edges/flows FIRST: element NAMES may begin with a keyword word (the default
    // component is named "Component" -> edge `Component -> X`). Declarations ALWAYS carry
    // coordinates `[...]`, edges never do. Without this pre-detection `Component -> X` would be
    // misread as a (broken) `component` declaration and vanish on re-import. Config/
    // special keywords (title/evolution/y-axis/evolve …) are exempt — they use `->` themselves.
    if (!NON_LINK_KEYWORDS.has(kw) && !parseCoords(line) && pushLink(line)) {
      continue;
    }

    switch (kw) {
      case 'title':
        config = { ...config, title: after };
        break;

      case 'anchor': {
        const node = parseNode(after);
        if (!node) {
          failed(line);
          break;
        }
        const id = ids.alloc('anchor', node.name);
        const anchor: AnchorElement = compact({
          id,
          elementType: 'anchor',
          label: node.name,
          position: pos(node.coords.a, node.coords.b),
          labelOffset: node.labelOffset,
          color: node.color,
        }) as AnchorElement;
        elements.push(anchor);
        register(node.name, id);
        break;
      }

      case 'component':
      case 'market':
      case 'ecosystem': {
        const node = parseNode(after);
        if (!node) {
          failed(line);
          break;
        }
        const decorators = mergeLegacy(kw, node.decorators);
        const id = ids.alloc('cmp', node.name);
        const component: ComponentElement = compact({
          id,
          elementType: 'component',
          label: node.name,
          position: pos(node.coords.a, node.coords.b),
          labelOffset: node.labelOffset,
          decorators: Object.keys(decorators).length ? decorators : undefined,
          color: node.color,
        }) as ComponentElement;
        elements.push(component);
        if (node.urlRef) pendingUrlRefs.push({ index: elements.length - 1, ref: node.urlRef });
        register(node.name, id);
        break;
      }

      case 'note': {
        const { color, rest } = parseColor(after);
        const coords = parseCoords(rest);
        // Literal `\n` back into real line breaks (multi-line notes).
        const textPart = stripCoords(rest).trim().replace(/\\n/g, '\n');
        if (!coords) {
          failed(line);
          break;
        }
        const id = ids.alloc('note', textPart || 'note');
        const note: NoteElement = compact({
          id,
          elementType: 'note',
          label: textPart,
          position: pos(coords.a, coords.b),
          color,
        }) as NoteElement;
        elements.push(note);
        break;
      }

      case 'pipeline': {
        // `pipeline X [s, e]`, `pipeline X` (block form, range from children) — optionally with `{` at the end.
        let body = after;
        let opensBlock = false;
        if (body.endsWith('{')) {
          opensBlock = true;
          body = body.slice(0, -1).trim();
        }
        const col = parseColor(body);
        // Project extension `(y 0.x)`: the OWM pipeline line has no slot for the height —
        // without it a standalone pipeline snaps back to visibility 0.5 on every round trip.
        const yMatch = /\(\s{0,8}y\s{1,8}([\d.]+)\s{0,8}\)/.exec(col.rest);
        const bodyRest = yMatch ? col.rest.replace(yMatch[0], ' ') : col.rest;
        const coords = parseCoords(bodyRest);
        const name = stripCoords(bodyRest).trim();
        if (!name) {
          failed(line);
          break;
        }
        const pending: PendingPipeline = {
          name,
          ...(coords ? { start: coords.a, end: coords.b } : {}),
          ...(yMatch ? { visibility: clamp01(Number(yMatch[1])) } : {}),
          ...(col.color ? { color: col.color } : {}),
          raw: line,
          children: [],
        };
        pendingPipeline.push(pending);
        if (opensBlock) blockPipeline = pending;
        else lastPipeline = pending;
        break;
      }

      case 'evolve': {
        const ev = parseEvolve(after);
        if (!ev) {
          failed(line);
          break;
        }
        pendingEvolve.push({ ...ev, target: clampDiag(ev.target), raw: line, lineNo });
        break;
      }

      case 'style': {
        const s = after.toLowerCase();
        if (KNOWN_STYLES.has(s)) config = { ...config, style: s as MapStyle };
        else failed(line);
        break;
      }

      case 'size': {
        const coords = parseCoords(after);
        if (coords) config = { ...config, size: { width: coords.a, height: coords.b } };
        else failed(line);
        break;
      }

      case 'evolution': {
        // Exactly four positions (the serializer always writes four). Do NOT filter out
        // empty segments, otherwise an empty stage label is lost (the whole line would fall
        // out of the 4-slot grid and land in rawPassthrough -> axis snaps back to default).
        const parts = after.split('->').map((s) => s.trim());
        if (parts.length === 4) {
          config = { ...config, evolutionLabels: [parts[0]!, parts[1]!, parts[2]!, parts[3]!] };
        } else rawPassthrough.push(raw);
        break;
      }

      case 'y-axis': {
        // OWM: `y-axis Label->BottomLabel->TopLabel` — keep the end labels losslessly too.
        const parts = after
          .split('->')
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length) {
          config = {
            ...config,
            yAxisLabel: parts[0]!,
            ...(parts.length >= 3
              ? { yAxisEndLabels: [parts[1]!, parts[2]!] as [string, string] }
              : {}),
          };
        } else failed(line);
        break;
      }

      case 'annotations': {
        const coords = parseCoords(after);
        if (coords) {
          config = {
            ...config,
            annotationsBoxPosition: pos(coords.a, coords.b),
          };
        } else rawPassthrough.push(raw);
        break;
      }

      case 'annotation': {
        const numMatch = /^\s*(\d+)/.exec(after);
        const number = numMatch ? Number(numMatch[1]) : ++annoCounter;
        const colA = parseColor(after.replace(/^\s*\d+\s*/, ''));
        const afterNum = colA.rest;
        // Try the multi-position form `[[y,x],[y,x]]` FIRST — the single-tuple RE would otherwise
        // match only the first inner tuple and corrupt the rest as text.
        const multi = parseMultiCoords(afterNum);
        let positions: Coordinate[];
        let text: string;
        if (multi) {
          positions = multi.tuples.map((t) => pos(t.a, t.b));
          text = multi.rest.trim();
        } else {
          const coords = parseCoords(afterNum);
          if (!coords) {
            rawPassthrough.push(line);
            break;
          }
          positions = [pos(coords.a, coords.b)];
          text = stripCoords(afterNum).trim();
        }
        const annotation: AnnotationElement = {
          id: ids.alloc('anno', String(number)),
          elementType: 'annotation',
          label: text,
          position: positions[0]!,
          number,
          positions,
          text,
          ...(colA.color ? { color: colA.color } : {}),
        };
        elements.push(annotation);
        break;
      }

      case 'line': {
        // Project extension (freeform drawing): `line [[v,e], [v,e], …] (closed) (dashed) (color x)`.
        const col = parseColor(after);
        const multi = parseMultiCoords(col.rest);
        if (!multi || multi.tuples.length < 2) {
          failed(line);
          break;
        }
        const flags = multi.rest.toLowerCase();
        const strokeStyle: DrawingStrokeStyle | undefined = flags.includes('(dashed)')
          ? 'dashed'
          : flags.includes('(dotted)')
            ? 'dotted'
            : undefined;
        const points = multi.tuples.map((t) => pos(t.a, t.b));
        const drawing: DrawingElement = {
          id: ids.alloc('draw', 'line'),
          elementType: 'drawing',
          label: '',
          position: points[0]!,
          points,
          ...(flags.includes('(closed)') ? { closed: true } : {}),
          ...(strokeStyle ? { strokeStyle } : {}),
          ...(col.color ? { color: col.color } : {}),
        };
        elements.push(drawing);
        break;
      }

      case 'pioneers':
      case 'settlers':
      case 'townplanners': {
        // Canonical OWM form: `<kind> [vis1, mat1, vis2, mat2]` (two corners, normalized).
        const col = parseColor(after);
        const four = parseCoords4(col.rest);
        if (!four) {
          failed(line);
          break;
        }
        elements.push(
          makeAttitude(ids, kw as AttitudeKind, four.a, four.b, four.c, four.d, col.color),
        );
        break;
      }

      case 'url': {
        // OWM: `url Name [https://…]` — definition, referenced via `url(Name)` on elements.
        // Parsed via indexOf (not regex) — immune to backtracking on hostile input.
        const open = after.indexOf('[');
        const close = after.lastIndexOf(']');
        const name = open > 0 ? after.slice(0, open).trim() : '';
        const address = open > 0 && close > open ? after.slice(open + 1, close).trim() : '';
        if (!name || !address || after.slice(close + 1).trim() !== '') {
          failed(line);
          break;
        }
        urlDefs.set(name, address);
        break;
      }

      case 'build':
      case 'buy':
      case 'outsource': {
        // Legacy OWM: `buy <Name>` (method on an existing component) or
        // `buy <Name> [vis, mat]` (create a component with a method).
        const node = parseNode(after);
        if (node) {
          const id = ids.alloc('cmp', node.name);
          const component: ComponentElement = compact({
            id,
            elementType: 'component',
            label: node.name,
            position: pos(node.coords.a, node.coords.b),
            labelOffset: node.labelOffset,
            decorators: { ...node.decorators, method: kw as Method },
            color: node.color,
          }) as ComponentElement;
          elements.push(component);
          register(node.name, id);
        } else if (after.trim()) {
          pendingMethod.push({ name: after.trim(), method: kw as Method, raw: line, lineNo });
        } else {
          rawPassthrough.push(line);
        }
        break;
      }

      case 'accelerator':
      case 'deaccelerator': {
        const node = parseNode(after);
        if (!node) {
          failed(line);
          break;
        }
        const id = ids.alloc('accel', node.name);
        const accelerator: AcceleratorElement = {
          id,
          elementType: 'accelerator',
          direction: kw === 'deaccelerator' ? 'deaccelerate' : 'accelerate',
          label: node.name,
          position: pos(node.coords.a, node.coords.b),
          ...(node.color ? { color: node.color } : {}),
        };
        elements.push(accelerator);
        register(node.name, id);
        break;
      }

      case 'submap': {
        const node = parseNode(after);
        if (!node) {
          failed(line);
          break;
        }
        const id = ids.alloc('submap', node.name);
        const submap: SubmapElement = {
          id,
          elementType: 'submap',
          label: node.name,
          position: pos(node.coords.a, node.coords.b),
          ...(node.color ? { color: node.color } : {}),
        };
        elements.push(submap);
        if (node.urlRef) pendingUrlRefs.push({ index: elements.length - 1, ref: node.urlRef });
        register(node.name, id);
        break;
      }

      default: {
        // Unknown keyword: try as a link (e.g. `A -> B; limited by`), otherwise keep raw.
        if (!pushLink(line)) rawPassthrough.push(line);
      }
    }
  }

  // --- Resolve pipelines (visibility from the same-named component; children inherit it) ---
  // BEFORE evolve/method so that evolve/buy can reference block children.
  for (const p of pendingPipeline) {
    const refId = nameToId.get(p.name);
    const ref = elements.find((e) => e.id === refId);
    const visibility = p.visibility ?? (ref ? ref.position.visibility : 0.5);
    const id = ids.alloc('pipeline', p.name);
    // Standalone pipelines (no same-named component) are edge endpoints themselves —
    // register() keeps the first entry, so an existing anchor component still wins.
    register(p.name, id);

    const childIds: string[] = [];
    const childElements: ComponentElement[] = [];
    for (const c of p.children) {
      const cid = ids.alloc('cmp', c.name);
      childElements.push(
        compact({
          id: cid,
          elementType: 'component',
          label: c.name,
          position: { visibility, evolution: clamp01(c.maturity) },
          labelOffset: c.labelOffset,
          decorators: Object.keys(c.decorators).length ? c.decorators : undefined,
          pipelineId: id,
          color: c.color,
        }) as ComponentElement,
      );
      register(c.name, cid);
      childIds.push(cid);
    }

    // Range: explicit, otherwise derived from the child maturities (OWM v2); useless without either.
    let start =
      p.start ?? (p.children.length ? Math.min(...p.children.map((c) => c.maturity)) : NaN);
    let end = p.end ?? (p.children.length ? Math.max(...p.children.map((c) => c.maturity)) : NaN);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      rawPassthrough.push(p.raw);
      continue;
    }
    start = clamp01(start);
    end = clamp01(end);
    if (end <= start) end = Math.min(1, start + 0.05);

    const pipeline: PipelineElement = {
      id,
      elementType: 'pipeline',
      label: p.name,
      position: { visibility, evolution: (start + end) / 2 },
      evolutionStart: start,
      evolutionEnd: end,
      childIds,
      ...(p.color ? { color: p.color } : {}),
    };
    elements.push(pipeline, ...childElements);
  }

  // --- Resolve evolve ---
  for (const ev of pendingEvolve) {
    const id = nameToId.get(ev.name);
    const idx = elements.findIndex((e) => e.id === id);
    if (idx < 0 || elements[idx]!.elementType !== 'component') {
      rawPassthrough.push(ev.raw);
      diag(`evolve: component "${ev.name}" not found`, ev.lineNo, ev.raw);
      continue;
    }
    const movement = compact({
      targetEvolution: ev.target,
      newLabel: ev.newLabel,
      method: ev.method,
      labelOffset: ev.labelOffset,
    }) as Movement;
    elements[idx] = { ...(elements[idx] as ComponentElement), movement };
  }

  // --- Resolve legacy standalone methods (`buy <name>`) ---
  for (const pm of pendingMethod) {
    const id = nameToId.get(pm.name);
    const idx = elements.findIndex((e) => e.id === id);
    const el = idx >= 0 ? elements[idx]! : undefined;
    if (!el || el.elementType !== 'component') {
      rawPassthrough.push(pm.raw);
      diag(`${pm.method}: component "${pm.name}" not found`, pm.lineNo, pm.raw);
      continue;
    }
    elements[idx] = { ...el, decorators: { ...el.decorators, method: pm.method } };
  }

  // --- Resolve url(...) references (the definition may appear before OR after the element) ---
  const usedUrlDefs = new Set<string>();
  for (const { index, ref } of pendingUrlRefs) {
    const fromDef = urlDefs.get(ref);
    if (fromDef) usedUrlDefs.add(ref);
    // Also accept a directly embedded address (`url(https://…)`).
    const address = fromDef ?? (/^[a-z][\w+.-]*:\/\//i.test(ref) ? ref : undefined);
    if (!address) continue;
    const el = elements[index]!;
    if (el.elementType === 'component') {
      elements[index] = { ...el, url: address };
    } else if (el.elementType === 'submap') {
      elements[index] = { ...el, urlRef: address };
    }
  }
  // Keep unreferenced definitions losslessly.
  for (const [name, address] of urlDefs) {
    if (!usedUrlDefs.has(name)) rawPassthrough.push(`url ${name} [${address}]`);
  }

  let depN = 0;
  let flowN = 0;
  const edges: MapEdge[] = [];
  for (const link of pendingLinks) {
    const fromId = nameToId.get(link.left);
    const toId = nameToId.get(link.right);
    if (!fromId || !toId) {
      rawPassthrough.push(link.raw);
      diag(
        `Link: ${!fromId ? `"${link.left}"` : `"${link.right}"`} not found`,
        link.lineNo,
        link.raw,
      );
      continue;
    }
    if (link.kind === 'dependency') {
      edges.push(
        compact({
          id: `dep_${++depN}`,
          edgeType: 'dependency',
          from: fromId,
          to: toId,
          label: link.label,
        }) as MapEdge,
      );
    } else {
      // `+<` reverses the flow direction (right -> left).
      const [f, t] = link.reverse ? [toId, fromId] : [fromId, toId];
      edges.push(
        compact({
          id: `flow_${++flowN}`,
          edgeType: 'flow',
          from: f,
          to: t,
          bidirectional: link.bidirectional ? true : undefined,
          flowValue: link.flowValue,
          label: link.label,
        }) as MapEdge,
      );
    }
  }

  const map = compact({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    config,
    elements,
    edges,
    rawPassthrough: rawPassthrough.length ? rawPassthrough : undefined,
  }) as WardleyMap;

  return { map: validateMap(map), diagnostics };
}

interface ParsedNode {
  readonly name: string;
  readonly coords: { a: number; b: number };
  readonly decorators: InlineDecorators;
  readonly labelOffset?: { dx: number; dy: number };
  /** `url(Name)` reference (definition name, not yet resolved). */
  readonly urlRef?: string;
  /** Project extension `(color …)` — supported on every element line. */
  readonly color?: string;
}

/**
 * Parses `<name> [a, b] <decorators> [url(Name)] [label [dx,dy]]`. Decorators, url reference and
 * label offset are looked up ONLY in the suffix AFTER the coordinates — parentheses
 * (`Tea (green)`) or words like "inertia" inside the name stay untouched.
 */
function parseNode(after: string): ParsedNode | null {
  const split = splitAtCoords(after);
  if (!split || !split.name) return null;
  // Color must be stripped BEFORE the decorators — `(color x)` would otherwise be consumed
  // (and silently dropped) by the decorator parentheses.
  const col = parseColor(split.suffix);
  const url = parseUrlRef(col.rest);
  const lo = parseLabelOffset(url.rest);
  const dec = parseDecorators(lo.rest);
  return compact({
    name: split.name,
    coords: split.coords,
    decorators: dec.decorators,
    labelOffset: lo.labelOffset ?? undefined,
    urlRef: url.urlRef ?? undefined,
    color: col.color ?? undefined,
  }) as ParsedNode;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

const SINGLE_COORD_RE = /\[\s*([-\d.]+)\s*\]/;

/** Parses a pipeline block child line: `<name> [maturity]` (+ optional decorators/offset). */
function parseBlockChild(after: string): PipelineChild | null {
  const m = SINGLE_COORD_RE.exec(after);
  if (!m) return null;
  const maturity = Number(m[1]);
  if (Number.isNaN(maturity)) return null;
  const name = after.slice(0, m.index).trim();
  if (!name) return null;
  const suffix = after.slice(m.index + m[0].length);
  const col = parseColor(suffix);
  const lo = parseLabelOffset(col.rest);
  const dec = parseDecorators(lo.rest);
  return compact({
    name,
    maturity,
    decorators: dec.decorators,
    labelOffset: lo.labelOffset ?? undefined,
    color: col.color ?? undefined,
  }) as PipelineChild;
}

/** Builds an AttitudeElement from two (arbitrarily oriented) corners; normalizes to TL/BR. */
function makeAttitude(
  ids: IdAllocator,
  kind: AttitudeKind,
  v1: number,
  m1: number,
  v2: number,
  m2: number,
  color?: string,
): AttitudeElement {
  return {
    id: ids.alloc('attitude', kind),
    elementType: 'attitude',
    kind,
    label: '',
    ...(color ? { color } : {}),
    position: {
      visibility: clamp01(Math.max(v1, v2)),
      evolution: clamp01(Math.min(m1, m2)),
    },
    corner2: {
      visibility: clamp01(Math.min(v1, v2)),
      evolution: clamp01(Math.max(m1, m2)),
    },
  };
}

function mergeLegacy(kw: string, dec: InlineDecorators): ComponentDecorators {
  const merged: Record<string, unknown> = { ...dec };
  if (kw === 'market') merged['market'] = true;
  if (kw === 'ecosystem') merged['ecosystem'] = true;
  return compact(merged) as ComponentDecorators;
}

function parseEvolve(after: string): Omit<PendingEvolve, 'raw'> | null {
  // Remove `label [dx, dy]` FIRST — otherwise the last token is `dy]` and Number() fails.
  const lo = parseLabelOffset(after);
  const dec = parseDecorators(lo.rest);
  const tokens = dec.rest.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1]!;
  const target = Number(last);
  if (Number.isNaN(target)) return null;
  const namePart = tokens.slice(0, -1).join(' ').trim();
  if (!namePart) return null;
  const renameIdx = namePart.indexOf('->');
  const name = renameIdx >= 0 ? namePart.slice(0, renameIdx).trim() : namePart;
  const newLabel = renameIdx >= 0 ? namePart.slice(renameIdx + 2).trim() : undefined;
  return compact({
    name,
    newLabel: newLabel || undefined,
    target,
    method: dec.decorators.method,
    labelOffset: lo.labelOffset ?? undefined,
  }) as Omit<PendingEvolve, 'raw'>;
}
