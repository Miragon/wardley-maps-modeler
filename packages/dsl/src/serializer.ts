import type {
  ComponentDecorators,
  ComponentElement,
  LabelOffset,
  MapElement,
  WardleyMap,
} from '@miragon/wardley-schema-model';
import { CommentStripper, keywordOf, readUrlDefinition } from './lexer.js';
import {
  NAMED_TYPES,
  UniqueNames,
  roundAsWritten,
  writtenName,
  writtenNoteText,
  writtenText,
} from './names.js';

/** Address of an element (component.url / submap.urlRef) — or undefined. */
function urlOf(el: MapElement): string | undefined {
  if (el.elementType === 'component') return el.url;
  if (el.elementType === 'submap') return el.urlRef;
  return undefined;
}

function r(n: number): string {
  return String(roundAsWritten(n));
}

/**
 * Returns a name per element ID that is UNIQUE within the DSL for the referenceable types
 * (component/anchor/…). Because edges are serialized by name (`A -> B`), duplicate or empty
 * labels would collapse onto the same node on re-import and make arrows disappear. So on
 * collision a suffix (`Name 2`) is assigned and on an empty label a default — consistently for
 * BOTH sides (node line AND edge reference). Unique names stay unchanged. The parser names
 * elements the same way, so a parsed map passes through unchanged.
 */
function uniqueNames(map: WardleyMap): Map<string, string> {
  const namesInUse = new UniqueNames();
  const byId = new Map<string, string>();
  for (const el of map.elements) {
    if (NAMED_TYPES.has(el.elementType)) {
      byId.set(el.id, namesInUse.claim(writtenName(el.label, el.elementType)));
    } else if (el.elementType === 'pipeline') {
      byId.set(el.id, writtenName(el.label, el.elementType));
    }
  }
  return byId;
}

/**
 * `url(<name>)` cannot hold parentheses, `url <name> [address]` ends the name at "[" and a flow
 * operator (`+'x'>`) would make the definition a link, so the definition name leaves them out; the
 * parser resolves it into the address and forgets the name. Names of definitions kept in
 * rawPassthrough are taken first: the parser lets a later definition replace an earlier one.
 */
function urlDefinitionNames(
  map: WardleyMap,
  nameOf: (el: MapElement) => string,
  keptDefinitionNames: readonly string[],
) {
  const namesInUse = new UniqueNames();
  for (const name of keptDefinitionNames) namesInUse.claim(name);
  const byId = new Map<string, string>();
  for (const el of map.elements) {
    if (!urlOf(el)) continue;
    const readable = nameOf(el)
      .replace(/[()[\]<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    byId.set(el.id, namesInUse.claim(`${readable} URL`.trim()));
  }
  return byId;
}

function offsetSuffix(lo: LabelOffset | undefined): string {
  return lo ? ` label [${r(lo.dx)}, ${r(lo.dy)}]` : '';
}

/** Project extension: `(color …)` after the coordinates (the OWM parser ignores it). */
function colorSuffix(el: { color?: string }): string {
  return el.color ? ` (color ${el.color})` : '';
}

function decoratorSuffix(dec: ComponentDecorators | undefined): string {
  if (!dec) return '';
  const paren: string[] = [];
  if (dec.market) paren.push('market');
  if (dec.ecosystem) paren.push('ecosystem');
  if (dec.method) paren.push(dec.method);
  let out = '';
  if (paren.length) out += ` (${paren.join(', ')})`;
  if (dec.inertia) out += ' inertia';
  return out;
}

function configLines(config: WardleyMap['config']): string[] {
  const lines = [`title ${writtenText(config.title)}`];
  if (config.style) lines.push(`style ${config.style}`);
  if (config.size) lines.push(`size [${r(config.size.width)}, ${r(config.size.height)}]`);
  if (config.evolutionLabels) {
    lines.push(`evolution ${config.evolutionLabels.map(writtenText).join('->')}`);
  }
  if (config.yAxisLabel) {
    const ends = config.yAxisEndLabels;
    const endLabels = ends ? `->${writtenText(ends[0])}->${writtenText(ends[1])}` : '';
    lines.push(`y-axis ${writtenText(config.yAxisLabel)}${endLabels}`);
  }
  if (config.annotationsBoxPosition) {
    const b = config.annotationsBoxPosition;
    lines.push(`annotations [${r(b.visibility)}, ${r(b.evolution)}]`);
  }
  return lines;
}

/**
 * The rawPassthrough lines as the next parse reads them: a config keyword the map already writes
 * (e.g. an unparsable `evolution` line from externally-authored DSL) would produce a contradictory
 * duplicate line, so it is dropped (config is the truth); the same words inside a comment are kept.
 * Also returns the names of the url definitions among them.
 */
function passthroughLines(map: WardleyMap): { lines: string[]; urlDefinitionNames: string[] } {
  const emitted = new Set<string>();
  if (map.config.evolutionLabels) emitted.add('evolution');
  if (map.config.yAxisLabel) emitted.add('y-axis');
  const comments = new CommentStripper();
  const lines: string[] = [];
  const urlDefinitionNames: string[] = [];
  for (const raw of map.rawPassthrough ?? []) {
    const code = comments.strip(raw).code;
    const keyword = keywordOf(code);
    if (emitted.has(keyword)) continue;
    lines.push(raw);
    const definition = keyword === 'url' ? readUrlDefinition(code.trim().slice(3)) : null;
    if (definition) urlDefinitionNames.push(definition.name);
  }
  return { lines, urlDefinitionNames };
}

/**
 * The OWM pipeline line has no slot for the height — emit the project extension `(y 0.x)` whenever
 * the visibility written differs from what re-parsing would derive (the visibility of the component
 * written under the pipeline's name, or 0.5), so standalone pipelines do not snap back to
 * mid-canvas on every round trip. The parser derives it only from components declared on their own
 * lines, never from pipeline children.
 */
function pipelineHeights(
  map: WardleyMap,
  pipelineIds: ReadonlySet<string>,
  nameOf: (el: MapElement) => string,
): (el: MapElement) => string {
  const componentVisibilityByName = new Map<string, number>();
  for (const el of map.elements) {
    if (el.elementType !== 'component') continue;
    const isChild = !!el.pipelineId && pipelineIds.has(el.pipelineId);
    if (!isChild) componentVisibilityByName.set(nameOf(el), el.position.visibility);
  }
  return (el) => {
    if (el.elementType !== 'pipeline') return '';
    const derived = componentVisibilityByName.get(nameOf(el)) ?? 0.5;
    const written = r(el.position.visibility);
    return written !== r(derived) ? ` (y ${written})` : '';
  };
}

function edgeLines(map: WardleyMap, nameOf: (el: MapElement) => string): string[] {
  const namesById = new Map(map.elements.map((el) => [el.id, nameOf(el)]));
  return map.edges.map((edge) => {
    const from = namesById.get(edge.from) ?? edge.from;
    const to = namesById.get(edge.to) ?? edge.to;
    const annotation = edge.label ? `; ${writtenText(edge.label)}` : '';
    if (edge.edgeType === 'dependency') return `${from} -> ${to}${annotation}`;
    const op = edge.flowValue
      ? `+'${edge.flowValue}'${edge.bidirectional ? '<>' : '>'}`
      : edge.bidirectional
        ? '+<>'
        : '+>';
    return `${from} ${op} ${to}${annotation}`;
  });
}

/**
 * Serializes a WardleyMap into Online-Wardley-Maps text. Deterministic; writes only
 * syntax the OWM parser reads back. `rawPassthrough` is appended unchanged.
 * Coordinates are keyword-differentiated (component/anchor/note = [visibility, maturity];
 * pipeline = [maturityStart, maturityEnd]).
 */
export function serializeDSL(map: WardleyMap): string {
  const names = uniqueNames(map);
  const nameOf = (el: MapElement): string => names.get(el.id) ?? writtenText(el.label);
  const passthrough = passthroughLines(map);
  const lines = configLines(map.config);

  // url definitions: one `url <Name> URL [address]` line per element with an address,
  // referenced on the element via `url(<Name> URL)` (OWM form: definition + reference).
  const urlDefNames = urlDefinitionNames(map, nameOf, passthrough.urlDefinitionNames);
  for (const el of map.elements) {
    const defName = urlDefNames.get(el.id);
    if (defName) lines.push(`url ${defName} [${urlOf(el)}]`);
  }
  const urlSuffix = (el: MapElement): string => {
    const def = urlDefNames.get(el.id);
    return def ? ` url(${def})` : '';
  };

  // Pipeline children (pipelineId set + pipeline exists) are emitted in the pipeline's
  // block form instead of as top-level components (OWM v2).
  const pipelineIds = new Set(
    map.elements.filter((e) => e.elementType === 'pipeline').map((e) => e.id),
  );
  const childrenByPipeline = new Map<string, ComponentElement[]>();
  for (const el of map.elements) {
    if (el.elementType !== 'component' || !el.pipelineId || !pipelineIds.has(el.pipelineId)) {
      continue;
    }
    const list = childrenByPipeline.get(el.pipelineId) ?? [];
    list.push(el);
    childrenByPipeline.set(el.pipelineId, list);
  }
  const pipelineHeight = pipelineHeights(map, pipelineIds, nameOf);

  const evolveLines: string[] = [];
  for (const el of map.elements) {
    if (el.elementType === 'component' && el.movement) {
      evolveLines.push(evolveLine(el, nameOf(el)));
    }
    if (el.elementType === 'component' && el.pipelineId && pipelineIds.has(el.pipelineId)) {
      continue; // emitted inside the pipeline block
    }
    lines.push(elementLine(el, nameOf(el)) + pipelineHeight(el) + urlSuffix(el));
    const kids = childrenByPipeline.get(el.id) ?? [];
    if (kids.length) {
      lines.push('{');
      for (const k of kids) {
        lines.push(
          `  component ${nameOf(k)} [${r(k.position.evolution)}]` +
            `${decoratorSuffix(k.decorators)}${colorSuffix(k)}${offsetSuffix(k.labelOffset)}`,
        );
      }
      lines.push('}');
    }
  }

  return [...lines, ...evolveLines, ...edgeLines(map, nameOf), ...passthrough.lines, ''].join('\n');
}

function elementLine(el: MapElement, name: string): string {
  const p = el.position;
  switch (el.elementType) {
    case 'anchor':
      return `anchor ${name} [${r(p.visibility)}, ${r(p.evolution)}]${colorSuffix(el)}${offsetSuffix(el.labelOffset)}`;
    case 'component':
      return `component ${name} [${r(p.visibility)}, ${r(p.evolution)}]${decoratorSuffix(el.decorators)}${colorSuffix(el)}${offsetSuffix(el.labelOffset)}`;
    case 'note':
      // Encode line breaks as literal `\n` -> the line-based DSL stays single-line.
      return `note ${writtenNoteText(el.label)} [${r(p.visibility)}, ${r(p.evolution)}]${colorSuffix(el)}`;
    case 'pipeline':
      return `pipeline ${name} [${r(el.evolutionStart)}, ${r(el.evolutionEnd)}]${colorSuffix(el)}`;
    case 'submap':
      return `submap ${name} [${r(p.visibility)}, ${r(p.evolution)}]${colorSuffix(el)}`;
    case 'annotation': {
      const pos =
        el.positions.length > 1
          ? `[${el.positions.map((q) => `[${r(q.visibility)}, ${r(q.evolution)}]`).join(', ')}]`
          : `[${r(p.visibility)}, ${r(p.evolution)}]`;
      return `annotation ${el.number} ${pos}${colorSuffix(el)} ${writtenText(el.text)}`;
    }
    case 'accelerator':
      return `${el.direction === 'deaccelerate' ? 'deaccelerator' : 'accelerator'} ${name} [${r(p.visibility)}, ${r(p.evolution)}]${colorSuffix(el)}`;
    case 'attitude':
      // OWM canon: two corners, normalized — `pioneers [vis1, mat1, vis2, mat2]`.
      return `${el.kind} [${r(p.visibility)}, ${r(p.evolution)}, ${r(el.corner2.visibility)}, ${r(el.corner2.evolution)}]${colorSuffix(el)}`;
    case 'drawing': {
      // Project extension (freeform drawing): tuple list + style flags.
      const pts = el.points.map((q) => `[${r(q.visibility)}, ${r(q.evolution)}]`).join(', ');
      const closed = el.closed ? ' (closed)' : '';
      const stroke = el.strokeStyle && el.strokeStyle !== 'solid' ? ` (${el.strokeStyle})` : '';
      return `line [${pts}]${closed}${stroke}${colorSuffix(el)}`;
    }
  }
}

function evolveLine(el: ComponentElement, name: string): string {
  const mv = el.movement!;
  const label = mv.newLabel ? `${name}->${writtenText(mv.newLabel)}` : name;
  const method = mv.method ? ` (${mv.method})` : '';
  return `evolve ${label} ${r(mv.targetEvolution)}${method}${offsetSuffix(mv.labelOffset)}`;
}
