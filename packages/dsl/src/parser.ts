import {
  CURRENT_SCHEMA_VERSION,
  validateMap,
  type AcceleratorElement,
  type AnchorElement,
  type AnnotationElement,
  type AttitudeElement,
  type AttitudeKind,
  type ComponentDecorators,
  type ComponentElement,
  type MapConfig,
  type MapEdge,
  type MapElement,
  type MapStyle,
  type Movement,
  type NoteElement,
  type PipelineElement,
  type SubmapElement,
  type WardleyMap,
} from '@wardley/schema-model';
import {
  keywordOf,
  parseColor,
  parseCoords,
  parseDecorators,
  parseLabelOffset,
  slug,
  stripCoords,
  type InlineDecorators,
} from './lexer.js';

const DEP_RE = /^(.+?)\s*->\s*(.+)$/;
// Flow: A +> B, A +<> B, A +< B (reverse), A +'120ms'> B, A +'120ms'<> B
const FLOW_RE = /^(.+?)\s*\+(?:'([^']*)')?(<>|>|<)\s*(.+)$/;
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
}
interface PendingEvolve {
  readonly name: string;
  readonly newLabel?: string;
  readonly target: number;
  readonly method?: Movement['method'];
  readonly raw: string;
}
interface PendingPipeline {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly raw: string;
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
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
  const ids = new IdAllocator();
  const nameToId = new Map<string, string>();
  const elements: MapElement[] = [];
  const rawPassthrough: string[] = [];
  const pendingLinks: PendingLink[] = [];
  const pendingEvolve: PendingEvolve[] = [];
  const pendingPipeline: PendingPipeline[] = [];

  let config: MapConfig = { title: 'Untitled Map' };
  let annoCounter = 0;

  const register = (name: string, id: string) => {
    if (!nameToId.has(name)) nameToId.set(name, id);
  };

  /** Tries to capture a line as a dependency/flow. Returns true when consumed. */
  const pushLink = (line: string, raw: string): boolean => {
    const semi = line.indexOf(';');
    const core = semi >= 0 ? line.slice(0, semi).trim() : line;
    const linkLabel = semi >= 0 ? line.slice(semi + 1).trim() : '';
    const dep = DEP_RE.exec(core);
    const flow = dep ? null : FLOW_RE.exec(core);
    if (dep) {
      pendingLinks.push({
        left: dep[1]!.trim(),
        right: dep[2]!.trim(),
        kind: 'dependency',
        ...(linkLabel ? { label: linkLabel } : {}),
        raw,
      });
      return true;
    }
    if (flow) {
      const op = flow[3]!;
      pendingLinks.push({
        left: flow[1]!.trim(),
        right: flow[4]!.trim(),
        kind: 'flow',
        bidirectional: op === '<>',
        reverse: op === '<',
        ...(flow[2] ? { flowValue: flow[2] } : {}),
        ...(linkLabel ? { label: linkLabel } : {}),
        raw,
      });
      return true;
    }
    return false;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const kw = keywordOf(line);
    const after = line.slice(kw.length).trim();

    // Edges/flows FIRST: element NAMES may begin with a keyword word (the default
    // component is named "Component" -> edge `Component -> X`). Declarations ALWAYS carry
    // coordinates `[...]`, edges never do. Without this pre-detection `Component -> X` would be
    // misread as a (broken) `component` declaration and vanish on re-import. Config/
    // special keywords (title/evolution/y-axis/evolve …) are exempt — they use `->` themselves.
    if (!NON_LINK_KEYWORDS.has(kw) && !parseCoords(line) && pushLink(line, raw)) {
      continue;
    }

    switch (kw) {
      case 'title':
        config = { ...config, title: after };
        break;

      case 'anchor': {
        const node = parseNode(after);
        if (!node) {
          rawPassthrough.push(raw);
          break;
        }
        const id = ids.alloc('anchor', node.name);
        const anchor: AnchorElement = compact({
          id,
          elementType: 'anchor',
          label: node.name,
          position: { visibility: node.coords.a, evolution: node.coords.b },
          labelOffset: node.labelOffset,
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
          rawPassthrough.push(raw);
          break;
        }
        const decorators = mergeLegacy(kw, node.decorators);
        const id = ids.alloc('cmp', node.name);
        const component: ComponentElement = compact({
          id,
          elementType: 'component',
          label: node.name,
          position: { visibility: node.coords.a, evolution: node.coords.b },
          labelOffset: node.labelOffset,
          decorators: Object.keys(decorators).length ? decorators : undefined,
        }) as ComponentElement;
        elements.push(component);
        register(node.name, id);
        break;
      }

      case 'note': {
        const { color, rest } = parseColor(after);
        const coords = parseCoords(rest);
        // Literal `\n` back into real line breaks (multi-line notes).
        const textPart = stripCoords(rest).trim().replace(/\\n/g, '\n');
        if (!coords) {
          rawPassthrough.push(raw);
          break;
        }
        const id = ids.alloc('note', textPart || 'note');
        const note: NoteElement = compact({
          id,
          elementType: 'note',
          label: textPart,
          position: { visibility: coords.a, evolution: coords.b },
          color,
        }) as NoteElement;
        elements.push(note);
        break;
      }

      case 'pipeline': {
        const coords = parseCoords(after);
        const name = stripCoords(after).trim();
        if (!coords || !name) {
          rawPassthrough.push(raw);
          break;
        }
        pendingPipeline.push({ name, start: coords.a, end: coords.b, raw });
        break;
      }

      case 'evolve': {
        const ev = parseEvolve(after);
        if (!ev) {
          rawPassthrough.push(raw);
          break;
        }
        pendingEvolve.push({ ...ev, raw });
        break;
      }

      case 'style': {
        const s = after.toLowerCase();
        if (KNOWN_STYLES.has(s)) config = { ...config, style: s as MapStyle };
        else rawPassthrough.push(raw);
        break;
      }

      case 'size': {
        const coords = parseCoords(after);
        if (coords) config = { ...config, size: { width: coords.a, height: coords.b } };
        else rawPassthrough.push(raw);
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
        const parts = after
          .split('->')
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length) config = { ...config, yAxisLabel: parts[0]! };
        else rawPassthrough.push(raw);
        break;
      }

      case 'annotations': {
        const coords = parseCoords(after);
        if (coords) {
          config = {
            ...config,
            annotationsBoxPosition: { visibility: coords.a, evolution: coords.b },
          };
        } else rawPassthrough.push(raw);
        break;
      }

      case 'annotation': {
        const coords = parseCoords(after);
        if (!coords) {
          rawPassthrough.push(raw);
          break;
        }
        const numMatch = /^\s*(\d+)/.exec(after);
        const number = numMatch ? Number(numMatch[1]) : ++annoCounter;
        const text = stripCoords(after.replace(/^\s*\d+\s*/, '')).trim();
        const position = { visibility: coords.a, evolution: coords.b };
        const annotation: AnnotationElement = {
          id: ids.alloc('anno', String(number)),
          elementType: 'annotation',
          label: text,
          position,
          number,
          positions: [position],
          text,
        };
        elements.push(annotation);
        break;
      }

      case 'pioneers':
      case 'settlers':
      case 'townplanners': {
        // OWM: `<kind> [visibility, maturity] width height`
        const coords = parseCoords(after);
        const trailing = stripCoords(after).trim().split(/\s+/).filter(Boolean);
        const width = Number(trailing[0]);
        const height = Number(trailing[1]);
        if (!coords || Number.isNaN(width) || Number.isNaN(height)) {
          rawPassthrough.push(raw);
          break;
        }
        const attitude: AttitudeElement = {
          id: ids.alloc('attitude', kw),
          elementType: 'attitude',
          kind: kw as AttitudeKind,
          label: '',
          position: { visibility: coords.a, evolution: coords.b },
          width,
          height,
        };
        elements.push(attitude);
        break;
      }

      case 'accelerator':
      case 'deaccelerator': {
        const node = parseNode(after);
        if (!node) {
          rawPassthrough.push(raw);
          break;
        }
        const id = ids.alloc('accel', node.name);
        const accelerator: AcceleratorElement = {
          id,
          elementType: 'accelerator',
          direction: kw === 'deaccelerator' ? 'deaccelerate' : 'accelerate',
          label: node.name,
          position: { visibility: node.coords.a, evolution: node.coords.b },
        };
        elements.push(accelerator);
        register(node.name, id);
        break;
      }

      case 'submap': {
        const node = parseNode(after);
        if (!node) {
          rawPassthrough.push(raw);
          break;
        }
        const id = ids.alloc('submap', node.name);
        const submap: SubmapElement = {
          id,
          elementType: 'submap',
          label: node.name,
          position: { visibility: node.coords.a, evolution: node.coords.b },
        };
        elements.push(submap);
        register(node.name, id);
        break;
      }

      default: {
        // Unknown keyword: try as a link (e.g. `A -> B; limited by`), otherwise keep raw.
        if (!pushLink(line, raw)) rawPassthrough.push(raw);
      }
    }
  }

  for (const ev of pendingEvolve) {
    const id = nameToId.get(ev.name);
    const idx = elements.findIndex((e) => e.id === id);
    if (idx < 0 || elements[idx]!.elementType !== 'component') {
      rawPassthrough.push(ev.raw);
      continue;
    }
    const movement = compact({
      targetEvolution: ev.target,
      newLabel: ev.newLabel,
      method: ev.method,
    }) as Movement;
    elements[idx] = { ...(elements[idx] as ComponentElement), movement };
  }

  // Derives visibility from the component of the same name.
  for (const p of pendingPipeline) {
    const refId = nameToId.get(p.name);
    const ref = elements.find((e) => e.id === refId);
    const visibility = ref ? ref.position.visibility : 0.5;
    const id = ids.alloc('pipeline', p.name);
    const pipeline: PipelineElement = {
      id,
      elementType: 'pipeline',
      label: p.name,
      position: { visibility, evolution: (p.start + p.end) / 2 },
      evolutionStart: p.start,
      evolutionEnd: p.end,
      childIds: [],
    };
    elements.push(pipeline);
  }

  let depN = 0;
  let flowN = 0;
  const edges: MapEdge[] = [];
  for (const link of pendingLinks) {
    const fromId = nameToId.get(link.left);
    const toId = nameToId.get(link.right);
    if (!fromId || !toId) {
      rawPassthrough.push(link.raw);
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

  return validateMap(map);
}

interface ParsedNode {
  readonly name: string;
  readonly coords: { a: number; b: number };
  readonly decorators: InlineDecorators;
  readonly labelOffset?: { dx: number; dy: number };
}

/** Parses `<name> [a, b] <decorators> [label [dx,dy]]` (the stripping order matters). */
function parseNode(after: string): ParsedNode | null {
  const lo = parseLabelOffset(after);
  const dec = parseDecorators(lo.rest);
  const coords = parseCoords(dec.rest);
  if (!coords) return null;
  const name = stripCoords(dec.rest).trim();
  if (!name) return null;
  return compact({
    name,
    coords,
    decorators: dec.decorators,
    labelOffset: lo.labelOffset ?? undefined,
  }) as ParsedNode;
}

function mergeLegacy(kw: string, dec: InlineDecorators): ComponentDecorators {
  const merged: Record<string, unknown> = { ...dec };
  if (kw === 'market') merged['market'] = true;
  if (kw === 'ecosystem') merged['ecosystem'] = true;
  return compact(merged) as ComponentDecorators;
}

function parseEvolve(after: string): Omit<PendingEvolve, 'raw'> | null {
  const dec = parseDecorators(after);
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
  }) as Omit<PendingEvolve, 'raw'>;
}
