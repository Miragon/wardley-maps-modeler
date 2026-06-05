import { describe, it, expect } from 'vitest';
import { parseDSL, serializeDSL } from '../src/index.js';

const TEA_SHOP = `title Tea Shop
anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61]
component Cup [0.73, 0.78]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.80]
component Kettle [0.43, 0.35]
evolve Kettle 0.62
component Power [0.1, 0.7] (outsource)
Business -> Cup of Tea
Cup of Tea -> Cup
Cup of Tea -> Tea
Cup of Tea -> Hot Water
Hot Water -> Kettle
Kettle -> Power`;

describe('parseDSL', () => {
  it('parst die Tea-Shop-Map (Knoten, Kanten, Achsen-Konvention)', () => {
    const map = parseDSL(TEA_SHOP);
    expect(map.config.title).toBe('Tea Shop');
    const kettle = map.elements.find((e) => e.label === 'Kettle');
    expect(kettle?.elementType).toBe('component');
    // [visibility, maturity] -> visibility=0.43, evolution=0.35
    expect(kettle?.position).toEqual({ visibility: 0.43, evolution: 0.35 });
    expect(map.edges.filter((e) => e.edgeType === 'dependency')).toHaveLength(6);
  });

  it('liest evolve als movement', () => {
    const map = parseDSL(TEA_SHOP);
    const kettle = map.elements.find((e) => e.label === 'Kettle');
    expect(kettle?.elementType === 'component' && kettle.movement?.targetEvolution).toBe(0.62);
  });

  it('liest moderne Decorator-Syntax (outsource)', () => {
    const map = parseDSL(TEA_SHOP);
    const power = map.elements.find((e) => e.label === 'Power');
    expect(power?.elementType === 'component' && power.decorators?.method).toBe('outsource');
  });

  it('liest kombinierte Decorators (market, outsource) + inertia', () => {
    const map = parseDSL('title T\ncomponent X [0.1, 0.2] (market, outsource) inertia');
    const x = map.elements[0];
    expect(x?.elementType === 'component' && x.decorators).toEqual({
      market: true,
      method: 'outsource',
      inertia: true,
    });
  });

  it('behandelt pipeline-Koordinaten als [maturityStart, maturityEnd] (NICHT visibility)', () => {
    const map = parseDSL('title P\ncomponent Platform [0.5, 0.4]\npipeline Platform [0.05, 0.95]');
    const pipe = map.elements.find((e) => e.elementType === 'pipeline');
    expect(pipe?.elementType).toBe('pipeline');
    if (pipe?.elementType === 'pipeline') {
      expect(pipe.evolutionStart).toBe(0.05);
      expect(pipe.evolutionEnd).toBe(0.95);
      // visibility aus der gleichnamigen Komponente
      expect(pipe.position.visibility).toBe(0.5);
    }
  });

  it('bewahrt unbekannte Zeilen in rawPassthrough', () => {
    const map = parseDSL('title T\nsomeFutureKeyword foo bar\ncomponent X [0.1, 0.2]');
    expect(map.rawPassthrough).toContain('someFutureKeyword foo bar');
  });
});

const RICH = `title Strategy
component A [0.8, 0.3]
component B [0.5, 0.6]
A +> B
B +<> A
annotation 1 [0.9, 0.4] Erste Notiz
annotations [0.2, 0.8]
pioneers [0.9, 0.1] 120 30
accelerator Boost [0.7, 0.5]
deaccelerator Brake [0.3, 0.5]
submap Detail [0.4, 0.7]`;

describe('parseDSL – M4-Typen', () => {
  it('liest annotation (Nummer, Text, Position) und annotations-Legendenbox', () => {
    const map = parseDSL(RICH);
    const anno = map.elements.find((e) => e.elementType === 'annotation');
    expect(anno?.elementType === 'annotation' && anno.number).toBe(1);
    expect(anno?.elementType === 'annotation' && anno.text).toBe('Erste Notiz');
    expect(map.config.annotationsBoxPosition).toEqual({ visibility: 0.2, evolution: 0.8 });
  });

  it('liest attitude (pioneers) als [vis, mat] + width height (OWM-Syntax)', () => {
    const map = parseDSL(RICH);
    const att = map.elements.find((e) => e.elementType === 'attitude');
    expect(att?.elementType).toBe('attitude');
    if (att?.elementType === 'attitude') {
      expect(att.kind).toBe('pioneers');
      expect(att.position).toEqual({ visibility: 0.9, evolution: 0.1 });
      expect(att.width).toBe(120);
      expect(att.height).toBe(30);
    }
  });

  it('liest accelerator und deaccelerator', () => {
    const map = parseDSL(RICH);
    const acc = map.elements.filter((e) => e.elementType === 'accelerator');
    expect(acc).toHaveLength(2);
    const dirs = acc.map((a) => (a.elementType === 'accelerator' ? a.direction : '')).sort();
    expect(dirs).toEqual(['accelerate', 'deaccelerate']);
  });

  it('liest Flow-Links (+> und +<> bidirektional)', () => {
    const map = parseDSL(RICH);
    const flows = map.edges.filter((e) => e.edgeType === 'flow');
    expect(flows).toHaveLength(2);
    const bidi = flows.find((f) => f.edgeType === 'flow' && f.bidirectional);
    expect(bidi).toBeDefined();
  });
});

describe('parseDSL – Reverse-Flow & Link-Labels (OWM)', () => {
  const base = 'title T\ncomponent A [0.8, 0.3]\ncomponent B [0.5, 0.6]\n';

  it('Reverse-Flow A +< B kehrt die Richtung um (B -> A)', () => {
    const map = parseDSL(base + 'A +< B');
    const flow = map.edges.find((e) => e.edgeType === 'flow');
    const aId = map.elements.find((e) => e.label === 'A')!.id;
    const bId = map.elements.find((e) => e.label === 'B')!.id;
    expect(flow?.from).toBe(bId);
    expect(flow?.to).toBe(aId);
  });

  it('Dependency-Link mit ; Annotation', () => {
    const map = parseDSL(base + 'A -> B; limited by');
    const dep = map.edges.find((e) => e.edgeType === 'dependency');
    expect(dep?.edgeType === 'dependency' && dep.label).toBe('limited by');
    const out = serializeDSL(map);
    expect(out).toContain('A -> B; limited by');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('Flow mit Wert UND ; Annotation', () => {
    const map = parseDSL(base + "A +'$0.10'> B; constrained");
    const flow = map.edges.find((e) => e.edgeType === 'flow');
    expect(flow?.edgeType === 'flow' && flow.flowValue).toBe('$0.10');
    expect(flow?.edgeType === 'flow' && flow.label).toBe('constrained');
    const out = serializeDSL(map);
    expect(out).toContain("+'$0.10'>");
    expect(out).toContain('; constrained');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });
});

describe('parseDSL – Achsen-Konfig & labeled flow', () => {
  it('liest evolution-Custom-Labels und y-axis-Label', () => {
    const map = parseDSL(
      'title T\nevolution Novel->Emerging->Good->Best\ny-axis Wertschöpfung->Unsichtbar->Sichtbar',
    );
    expect(map.config.evolutionLabels).toEqual(['Novel', 'Emerging', 'Good', 'Best']);
    expect(map.config.yAxisLabel).toBe('Wertschöpfung');
  });

  it("liest labeled flow (+'wert'>) inkl. Round-Trip", () => {
    const src = "title T\ncomponent A [0.8, 0.3]\ncomponent B [0.5, 0.6]\nA +'120ms'> B";
    const map = parseDSL(src);
    const flow = map.edges.find((e) => e.edgeType === 'flow');
    expect(flow?.edgeType === 'flow' && flow.flowValue).toBe('120ms');
    const once = serializeDSL(map);
    expect(once).toContain("+'120ms'>");
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('serializeDSL Round-Trip', () => {
  it('ist stabil fuer die M4-Typen (annotation/attitude/accelerator/flow/submap)', () => {
    const once = serializeDSL(parseDSL(RICH));
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
  });

  it('ist stabil ueber zwei Zyklen (inkl. spaces in Namen, evolve, decorators)', () => {
    const once = serializeDSL(parseDSL(TEA_SHOP));
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
  });

  it('Round-Trip mit asymmetrischer Pipeline-Range', () => {
    const src = 'title P\ncomponent Platform [0.5, 0.4]\npipeline Platform [0.05, 0.95]';
    const once = serializeDSL(parseDSL(src));
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
    expect(once).toContain('pipeline Platform [0.05, 0.95]');
  });
});
