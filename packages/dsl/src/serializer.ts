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

/** Typen, die in der OWM-DSL UEBER IHREN NAMEN referenziert werden (Kanten-Endpunkte + Namespace). */
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
 * Liefert pro Element-ID einen im DSL EINDEUTIGEN Namen für die referenzierbaren Typen
 * (component/anchor/…). Weil Kanten per Namen serialisiert werden (`A -> B`), wuerden doppelte oder
 * leere Labels beim Re-Import auf denselben Knoten kollabieren und Pfeile verschwinden lassen. Hier
 * wird darum bei Kollision ein Suffix (`Name 2`) und bei leerem Label ein Default vergeben — fuer
 * BEIDE Seiten (Knotenzeile UND Kantenreferenz) konsistent. Eindeutige Namen bleiben unveraendert.
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
  const names = uniqueNames(map);
  const nameOf = (el: MapElement): string => names.get(el.id) ?? el.label;

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
    lines.push(elementLine(el, nameOf(el)));
    if (el.elementType === 'component' && el.movement) {
      evolveLines.push(evolveLine(el, nameOf(el)));
    }
  }

  for (const line of evolveLines) lines.push(line);

  for (const edge of map.edges) {
    const from = names.get(edge.from) ?? edge.from;
    const to = names.get(edge.to) ?? edge.to;
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

  // Config-Keywords sind oben bereits aus der Map emittiert. Ein gleichnamiger rawPassthrough-
  // Eintrag (z.B. eine unparsbare `evolution`-Zeile aus extern-authored DSL) wuerde sonst eine
  // widerspruechliche Doppelzeile erzeugen — verwerfen (Config ist die Wahrheit).
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
      return `anchor ${name} [${r(p.visibility)}, ${r(p.evolution)}]${offsetSuffix(el.labelOffset)}`;
    case 'component':
      return `component ${name} [${r(p.visibility)}, ${r(p.evolution)}]${decoratorSuffix(el.decorators)}${offsetSuffix(el.labelOffset)}`;
    case 'note':
      // Zeilenumbrueche als literales `\n` kodieren -> die zeilenbasierte DSL bleibt einzeilig.
      return `note ${name.replace(/\n/g, '\\n')} [${r(p.visibility)}, ${r(p.evolution)}]${el.color ? ` (color ${el.color})` : ''}`;
    case 'pipeline':
      return `pipeline ${name} [${r(el.evolutionStart)}, ${r(el.evolutionEnd)}]`;
    case 'submap':
      return `submap ${name} [${r(p.visibility)}, ${r(p.evolution)}]`;
    case 'annotation':
      return `annotation ${el.number} [${r(p.visibility)}, ${r(p.evolution)}] ${el.text}`;
    case 'accelerator':
      return `${el.direction === 'deaccelerate' ? 'deaccelerator' : 'accelerator'} ${name} [${r(p.visibility)}, ${r(p.evolution)}]`;
    case 'attitude':
      return `${el.kind} [${r(p.visibility)}, ${r(p.evolution)}] ${r(el.width)} ${r(el.height)}`;
  }
}

function evolveLine(el: ComponentElement, name: string): string {
  const mv = el.movement!;
  const label = mv.newLabel ? `${name}->${mv.newLabel}` : name;
  const method = mv.method ? ` (${mv.method})` : '';
  return `evolve ${label} ${r(mv.targetEvolution)}${method}`;
}
