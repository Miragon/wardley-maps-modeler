import type {
  ComponentDecorators,
  ComponentElement,
  LabelOffset,
  MapElement,
  WardleyMap,
} from '@miragon/wardley-schema-model';

/** Address of an element (component.url / submap.urlRef) — or undefined. */
function urlOf(el: MapElement): string | undefined {
  if (el.elementType === 'component') return el.url;
  if (el.elementType === 'submap') return el.urlRef;
  return undefined;
}

function r(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Types referenced BY THEIR NAME in the OWM DSL (edge endpoints + namespace). */
const NAMED_TYPES: ReadonlySet<string> = new Set(['anchor', 'component', 'accelerator', 'submap']);

function defaultName(type: string): string {
  return type === 'anchor'
    ? 'User'
    : type === 'accelerator'
      ? 'Accelerator'
      : type === 'submap'
        ? 'Submap'
        : 'Component';
}

/**
 * Returns a name per element ID that is UNIQUE within the DSL for the referenceable types
 * (component/anchor/…). Because edges are serialized by name (`A -> B`), duplicate or empty
 * labels would collapse onto the same node on re-import and make arrows disappear. So on
 * collision a suffix (`Name 2`) is assigned and on an empty label a default — consistently for
 * BOTH sides (node line AND edge reference). Unique names stay unchanged.
 */
function uniqueNames(map: WardleyMap): Map<string, string> {
  const used = new Set<string>();
  const byId = new Map<string, string>();
  for (const el of map.elements) {
    if (!NAMED_TYPES.has(el.elementType)) continue;
    const base = el.label.trim().replace(/->/g, '→') || defaultName(el.elementType);
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base} ${i++}`;
    used.add(name);
    byId.set(el.id, name);
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

/**
 * Serializes a WardleyMap into Online-Wardley-Maps text. Deterministic; writes only
 * syntax the OWM parser reads back. `rawPassthrough` is appended unchanged.
 * Coordinates are keyword-differentiated (component/anchor/note = [visibility, maturity];
 * pipeline = [maturityStart, maturityEnd]).
 */
export function serializeDSL(map: WardleyMap): string {
  const lines: string[] = [];
  const names = uniqueNames(map);
  const nameOf = (el: MapElement): string => names.get(el.id) ?? el.label;

  lines.push(`title ${map.config.title}`);
  if (map.config.style) lines.push(`style ${map.config.style}`);
  if (map.config.size)
    lines.push(`size [${r(map.config.size.width)}, ${r(map.config.size.height)}]`);
  if (map.config.evolutionLabels) lines.push(`evolution ${map.config.evolutionLabels.join('->')}`);
  if (map.config.yAxisLabel) {
    const ends = map.config.yAxisEndLabels;
    lines.push(`y-axis ${map.config.yAxisLabel}${ends ? `->${ends[0]}->${ends[1]}` : ''}`);
  }
  if (map.config.annotationsBoxPosition) {
    const b = map.config.annotationsBoxPosition;
    lines.push(`annotations [${r(b.visibility)}, ${r(b.evolution)}]`);
  }

  // url definitions: one `url <Name> URL [address]` line per element with an address,
  // referenced on the element via `url(<Name> URL)` (OWM form: definition + reference).
  const urlDefNames = new Map<string, string>(); // element ID -> definition name
  for (const el of map.elements) {
    const address = urlOf(el);
    if (!address) continue;
    const defName = `${nameOf(el)} URL`;
    urlDefNames.set(el.id, defName);
    lines.push(`url ${defName} [${address}]`);
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
  const isPipelineChild = (el: MapElement): el is ComponentElement =>
    el.elementType === 'component' && !!el.pipelineId && pipelineIds.has(el.pipelineId);

  const evolveLines: string[] = [];

  // The OWM pipeline line has no slot for the height — emit the project extension `(y 0.x)`
  // whenever the visibility differs from what re-parsing would derive (anchor component or 0.5),
  // so standalone pipelines do not snap back to mid-canvas on every round trip.
  const componentVisByLabel = new Map<string, number>();
  for (const el of map.elements) {
    if (el.elementType === 'component' && !componentVisByLabel.has(el.label)) {
      componentVisByLabel.set(el.label, el.position.visibility);
    }
  }
  const pipelineYSuffix = (el: MapElement): string => {
    if (el.elementType !== 'pipeline') return '';
    const derived = componentVisByLabel.get(el.label) ?? 0.5;
    return Math.abs(el.position.visibility - derived) > 0.0005
      ? ` (y ${r(el.position.visibility)})`
      : '';
  };

  for (const el of map.elements) {
    if (el.elementType === 'component' && el.movement) {
      evolveLines.push(evolveLine(el, nameOf(el)));
    }
    if (isPipelineChild(el)) continue; // emitted inside the pipeline block
    lines.push(elementLine(el, nameOf(el)) + pipelineYSuffix(el) + urlSuffix(el));
    if (el.elementType === 'pipeline') {
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
  }

  for (const line of evolveLines) lines.push(line);

  // Edges may also end at a pipeline (its ■ anchor) — fall back to the element label for
  // endpoint types that are not part of the unique-name pass.
  const labelsById = new Map(map.elements.map((el) => [el.id, el.label]));
  for (const edge of map.edges) {
    const from = names.get(edge.from) ?? labelsById.get(edge.from) ?? edge.from;
    const to = names.get(edge.to) ?? labelsById.get(edge.to) ?? edge.to;
    const annotation = edge.label ? `; ${edge.label}` : '';
    if (edge.edgeType === 'dependency') {
      lines.push(`${from} -> ${to}${annotation}`);
    } else {
      const op = edge.flowValue
        ? `+'${edge.flowValue}'${edge.bidirectional ? '<>' : '>'}`
        : edge.bidirectional
          ? '+<>'
          : '+>';
      lines.push(`${from} ${op} ${to}${annotation}`);
    }
  }

  // Config keywords were already emitted from the map above. A rawPassthrough entry with the
  // same keyword (e.g. an unparsable `evolution` line from externally-authored DSL) would
  // otherwise produce a contradictory duplicate line — drop it (config is the truth).
  if (map.rawPassthrough) {
    const emitted = new Set<string>();
    if (map.config.evolutionLabels) emitted.add('evolution');
    if (map.config.yAxisLabel) emitted.add('y-axis');
    for (const raw of map.rawPassthrough) {
      if (emitted.has(raw.trim().split(/\s+/)[0]!)) continue;
      lines.push(raw);
    }
  }

  return lines.join('\n') + '\n';
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
      return `note ${name.replace(/\n/g, '\\n')} [${r(p.visibility)}, ${r(p.evolution)}]${colorSuffix(el)}`;
    case 'pipeline':
      return `pipeline ${name} [${r(el.evolutionStart)}, ${r(el.evolutionEnd)}]${colorSuffix(el)}`;
    case 'submap':
      return `submap ${name} [${r(p.visibility)}, ${r(p.evolution)}]${colorSuffix(el)}`;
    case 'annotation': {
      const pos =
        el.positions.length > 1
          ? `[${el.positions.map((q) => `[${r(q.visibility)}, ${r(q.evolution)}]`).join(', ')}]`
          : `[${r(p.visibility)}, ${r(p.evolution)}]`;
      return `annotation ${el.number} ${pos}${colorSuffix(el)} ${el.text}`;
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
  const label = mv.newLabel ? `${name}->${mv.newLabel}` : name;
  const method = mv.method ? ` (${mv.method})` : '';
  return `evolve ${label} ${r(mv.targetEvolution)}${method}${offsetSuffix(mv.labelOffset)}`;
}
