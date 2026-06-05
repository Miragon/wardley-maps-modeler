import type {
  ComponentDecorators,
  ComponentElement,
  LabelOffset,
  MapElement,
  WardleyMap,
} from '@wardley/schema-model';

function r(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function labelById(map: WardleyMap): Map<string, string> {
  const m = new Map<string, string>();
  for (const el of map.elements) m.set(el.id, el.label);
  return m;
}

function offsetSuffix(lo: LabelOffset | undefined): string {
  return lo ? ` label [${r(lo.dx)}, ${r(lo.dy)}]` : '';
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
 * Serialisiert ein WardleyMap in Online-Wardley-Maps-Text. Deterministisch; schreibt nur
 * Syntax, die der OWM-Parser wieder einliest. `rawPassthrough` wird unveraendert angehaengt.
 * Koordinaten keyword-differenziert (component/anchor/note = [visibility, maturity];
 * pipeline = [maturityStart, maturityEnd]).
 */
export function serializeDSL(map: WardleyMap): string {
  const lines: string[] = [];
  const labels = labelById(map);

  lines.push(`title ${map.config.title}`);
  if (map.config.style) lines.push(`style ${map.config.style}`);
  if (map.config.size)
    lines.push(`size [${r(map.config.size.width)}, ${r(map.config.size.height)}]`);
  if (map.config.evolutionLabels) lines.push(`evolution ${map.config.evolutionLabels.join('->')}`);
  if (map.config.yAxisLabel) lines.push(`y-axis ${map.config.yAxisLabel}`);
  if (map.config.annotationsBoxPosition) {
    const b = map.config.annotationsBoxPosition;
    lines.push(`annotations [${r(b.visibility)}, ${r(b.evolution)}]`);
  }

  const evolveLines: string[] = [];

  for (const el of map.elements) {
    lines.push(elementLine(el));
    if (el.elementType === 'component' && el.movement) {
      evolveLines.push(evolveLine(el));
    }
  }

  for (const line of evolveLines) lines.push(line);

  for (const edge of map.edges) {
    const from = labels.get(edge.from) ?? edge.from;
    const to = labels.get(edge.to) ?? edge.to;
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

  if (map.rawPassthrough) for (const raw of map.rawPassthrough) lines.push(raw);

  return lines.join('\n') + '\n';
}

function elementLine(el: MapElement): string {
  const p = el.position;
  switch (el.elementType) {
    case 'anchor':
      return `anchor ${el.label} [${r(p.visibility)}, ${r(p.evolution)}]${offsetSuffix(el.labelOffset)}`;
    case 'component':
      return `component ${el.label} [${r(p.visibility)}, ${r(p.evolution)}]${decoratorSuffix(el.decorators)}${offsetSuffix(el.labelOffset)}`;
    case 'note':
      return `note ${el.label} [${r(p.visibility)}, ${r(p.evolution)}]`;
    case 'pipeline':
      return `pipeline ${el.label} [${r(el.evolutionStart)}, ${r(el.evolutionEnd)}]`;
    case 'submap':
      return `submap ${el.label} [${r(p.visibility)}, ${r(p.evolution)}]`;
    case 'annotation':
      return `annotation ${el.number} [${r(p.visibility)}, ${r(p.evolution)}] ${el.text}`;
    case 'accelerator':
      return `${el.direction === 'deaccelerate' ? 'deaccelerator' : 'accelerator'} ${el.label} [${r(p.visibility)}, ${r(p.evolution)}]`;
    case 'attitude':
      return `${el.kind} [${r(p.visibility)}, ${r(p.evolution)}] ${r(el.width)} ${r(el.height)}`;
  }
}

function evolveLine(el: ComponentElement): string {
  const mv = el.movement!;
  const name = mv.newLabel ? `${el.label}->${mv.newLabel}` : el.label;
  const method = mv.method ? ` (${mv.method})` : '';
  return `evolve ${name} ${r(mv.targetEvolution)}${method}`;
}
