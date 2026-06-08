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
  it('parses the Tea Shop map (nodes, edges, axis convention)', () => {
    const map = parseDSL(TEA_SHOP);
    expect(map.config.title).toBe('Tea Shop');
    const kettle = map.elements.find((e) => e.label === 'Kettle');
    expect(kettle?.elementType).toBe('component');
    // [visibility, maturity] -> visibility=0.43, evolution=0.35
    expect(kettle?.position).toEqual({ visibility: 0.43, evolution: 0.35 });
    expect(map.edges.filter((e) => e.edgeType === 'dependency')).toHaveLength(6);
  });

  it('reads evolve as movement', () => {
    const map = parseDSL(TEA_SHOP);
    const kettle = map.elements.find((e) => e.label === 'Kettle');
    expect(kettle?.elementType === 'component' && kettle.movement?.targetEvolution).toBe(0.62);
  });

  it('reads modern decorator syntax (outsource)', () => {
    const map = parseDSL(TEA_SHOP);
    const power = map.elements.find((e) => e.label === 'Power');
    expect(power?.elementType === 'component' && power.decorators?.method).toBe('outsource');
  });

  it('reads combined decorators (market, outsource) + inertia', () => {
    const map = parseDSL('title T\ncomponent X [0.1, 0.2] (market, outsource) inertia');
    const x = map.elements[0];
    expect(x?.elementType === 'component' && x.decorators).toEqual({
      market: true,
      method: 'outsource',
      inertia: true,
    });
  });

  it('treats pipeline coordinates as [maturityStart, maturityEnd] (NOT visibility)', () => {
    const map = parseDSL('title P\ncomponent Platform [0.5, 0.4]\npipeline Platform [0.05, 0.95]');
    const pipe = map.elements.find((e) => e.elementType === 'pipeline');
    expect(pipe?.elementType).toBe('pipeline');
    if (pipe?.elementType === 'pipeline') {
      expect(pipe.evolutionStart).toBe(0.05);
      expect(pipe.evolutionEnd).toBe(0.95);
      // visibility from the component of the same name
      expect(pipe.position.visibility).toBe(0.5);
    }
  });

  it('preserves unknown lines in rawPassthrough', () => {
    const map = parseDSL('title T\nsomeFutureKeyword foo bar\ncomponent X [0.1, 0.2]');
    expect(map.rawPassthrough).toContain('someFutureKeyword foo bar');
  });
});

const RICH = `title Strategy
component A [0.8, 0.3]
component B [0.5, 0.6]
A +> B
B +<> A
annotation 1 [0.9, 0.4] First note
annotations [0.2, 0.8]
pioneers [0.9, 0.1] 120 30
accelerator Boost [0.7, 0.5]
deaccelerator Brake [0.3, 0.5]
submap Detail [0.4, 0.7]`;

describe('parseDSL – M4 types', () => {
  it('reads annotation (number, text, position) and the annotations legend box', () => {
    const map = parseDSL(RICH);
    const anno = map.elements.find((e) => e.elementType === 'annotation');
    expect(anno?.elementType === 'annotation' && anno.number).toBe(1);
    expect(anno?.elementType === 'annotation' && anno.text).toBe('First note');
    expect(map.config.annotationsBoxPosition).toEqual({ visibility: 0.2, evolution: 0.8 });
  });

  it('reads attitude (pioneers) as [vis, mat] + width height (OWM syntax)', () => {
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

  it('reads accelerator and deaccelerator', () => {
    const map = parseDSL(RICH);
    const acc = map.elements.filter((e) => e.elementType === 'accelerator');
    expect(acc).toHaveLength(2);
    const dirs = acc.map((a) => (a.elementType === 'accelerator' ? a.direction : '')).sort();
    expect(dirs).toEqual(['accelerate', 'deaccelerate']);
  });

  it('reads flow links (+> and +<> bidirectional)', () => {
    const map = parseDSL(RICH);
    const flows = map.edges.filter((e) => e.edgeType === 'flow');
    expect(flows).toHaveLength(2);
    const bidi = flows.find((f) => f.edgeType === 'flow' && f.bidirectional);
    expect(bidi).toBeDefined();
  });
});

describe('parseDSL – reverse flow & link labels (OWM)', () => {
  const base = 'title T\ncomponent A [0.8, 0.3]\ncomponent B [0.5, 0.6]\n';

  it('reverse flow A +< B reverses the direction (B -> A)', () => {
    const map = parseDSL(base + 'A +< B');
    const flow = map.edges.find((e) => e.edgeType === 'flow');
    const aId = map.elements.find((e) => e.label === 'A')!.id;
    const bId = map.elements.find((e) => e.label === 'B')!.id;
    expect(flow?.from).toBe(bId);
    expect(flow?.to).toBe(aId);
  });

  it('dependency link with ; annotation', () => {
    const map = parseDSL(base + 'A -> B; limited by');
    const dep = map.edges.find((e) => e.edgeType === 'dependency');
    expect(dep?.edgeType === 'dependency' && dep.label).toBe('limited by');
    const out = serializeDSL(map);
    expect(out).toContain('A -> B; limited by');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('flow with value AND ; annotation', () => {
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

describe('parseDSL – axis config & labeled flow', () => {
  it('reads custom evolution labels and the y-axis label', () => {
    const map = parseDSL(
      'title T\nevolution Novel->Emerging->Good->Best\ny-axis Value chain->Invisible->Visible',
    );
    expect(map.config.evolutionLabels).toEqual(['Novel', 'Emerging', 'Good', 'Best']);
    expect(map.config.yAxisLabel).toBe('Value chain');
  });

  it('custom evolution labels survive the serialize round-trip', () => {
    const src = 'title T\nevolution Unmodelled->Divergent->Convergent->Modelled';
    const map = parseDSL(src);
    expect(map.config.evolutionLabels).toEqual([
      'Unmodelled',
      'Divergent',
      'Convergent',
      'Modelled',
    ]);
    const once = serializeDSL(map);
    expect(once).toContain('evolution Unmodelled->Divergent->Convergent->Modelled');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('custom evolution labels with an empty stage survive the round-trip (no filter(Boolean))', () => {
    const map = parseDSL('title T\nevolution Genesis->->Product->Commodity');
    expect(map.config.evolutionLabels).toEqual(['Genesis', '', 'Product', 'Commodity']);
    const once = serializeDSL(map);
    expect(once).toContain('evolution Genesis->->Product->Commodity');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('an unparsable evolution line is not emitted twice when config.evolutionLabels is set', () => {
    // 3-part `evolution` line -> lands in rawPassthrough, evolutionLabels stays undefined.
    const map = parseDSL('title T\nevolution A->B->C');
    expect(map.config.evolutionLabels).toBeUndefined();
    expect(map.rawPassthrough).toContain('evolution A->B->C');
    // Now the editor sets valid labels: the stale line must NOT survive as a duplicate.
    const withLabels = {
      ...map,
      config: { ...map.config, evolutionLabels: ['W', 'X', 'Y', 'Z'] as const },
    };
    const out = serializeDSL(withLabels);
    expect(out.match(/^evolution /gm)).toHaveLength(1);
    expect(out).toContain('evolution W->X->Y->Z');
  });

  it('duplicate component labels do not lose an edge (the serializer disambiguates names)', () => {
    const base = parseDSL('title T\ncomponent A [0.8, 0.3]\ncomponent B [0.5, 0.6]\nA -> B');
    // Set both components to the same name (as after a colliding rename).
    const dup = { ...base, elements: base.elements.map((e) => ({ ...e, label: 'X' })) };
    const out = serializeDSL(dup);
    const comps = out.split('\n').filter((l) => l.startsWith('component'));
    expect(comps).toHaveLength(2);
    expect(comps[0]).not.toBe(comps[1]); // names were disambiguated (X / X 2)
    // Re-import: the edge connects TWO DIFFERENT nodes (no self-reference -> arrow stays).
    const round = parseDSL(out);
    expect(round.elements.filter((e) => e.elementType === 'component')).toHaveLength(2);
    expect(round.edges).toHaveLength(1);
    expect(round.edges[0]!.from).not.toBe(round.edges[0]!.to);
    expect(serializeDSL(round)).toBe(out);
  });

  it('an edge between components with keyword-prefix names ("Component") is preserved', () => {
    // Default name "Component" starts with the keyword `component`; the edge line must NOT be
    // misread as a declaration (otherwise the arrow disappears on reload).
    const src =
      'title T\ncomponent Component [0.8, 0.3]\ncomponent Component 2 [0.5, 0.6]\nComponent -> Component 2';
    const map = parseDSL(src);
    expect(map.elements.filter((e) => e.elementType === 'component')).toHaveLength(2);
    expect(map.edges).toHaveLength(1);
    expect(map.edges[0]!.from).not.toBe(map.edges[0]!.to);
    const out = serializeDSL(map);
    expect(parseDSL(out).edges).toHaveLength(1); // edge survives the re-parse
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('a flow between components with keyword-prefix names is preserved', () => {
    const map = parseDSL(
      'title T\ncomponent Component [0.8, 0.3]\ncomponent Anchor X [0.5, 0.6]\nComponent +> Anchor X',
    );
    expect(map.edges.filter((e) => e.edgeType === 'flow')).toHaveLength(1);
  });

  it("reads labeled flow (+'value'>) including round-trip", () => {
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
  it('is stable for the M4 types (annotation/attitude/accelerator/flow/submap)', () => {
    const once = serializeDSL(parseDSL(RICH));
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
  });

  it('is stable across two cycles (incl. spaces in names, evolve, decorators)', () => {
    const once = serializeDSL(parseDSL(TEA_SHOP));
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
  });

  it('round-trip with an asymmetric pipeline range', () => {
    const src = 'title P\ncomponent Platform [0.5, 0.4]\npipeline Platform [0.05, 0.95]';
    const once = serializeDSL(parseDSL(src));
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
    expect(once).toContain('pipeline Platform [0.05, 0.95]');
  });
});

describe('notes – color & multiline', () => {
  it('parses color `(color …)` and a literal `\\n` as a real line break', () => {
    const src =
      'title T\nnote Looks good [0.8, 0.3] (color #15803d)\nnote Line1\\nLine2 [0.4, 0.6]';
    const notes = parseDSL(src).elements.filter((e) => e.elementType === 'note') as Array<{
      label: string;
      color?: string;
    }>;
    expect(notes).toHaveLength(2);
    expect(notes[0]!.color).toBe('#15803d');
    expect(notes[0]!.label).toBe('Looks good');
    expect(notes[1]!.color).toBeUndefined();
    expect(notes[1]!.label).toBe('Line1\nLine2');
  });

  it('round-trip is stable (color stays, line break stays escaped)', () => {
    const src = 'title T\nnote Risk here [0.8, 0.3] (color #b91c1c)\nnote A\\nB [0.4, 0.6]';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('note Risk here [0.8, 0.3] (color #b91c1c)');
    expect(once).toContain('note A\\nB [0.4, 0.6]');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('note color (project extension: `(color …)`)', () => {
  it('parses the color and keeps the text clean', () => {
    const map = parseDSL('title T\nnote Looks good [0.8, 0.6] (color #15803d)');
    const note = map.elements.find((e) => e.elementType === 'note');
    expect(note).toMatchObject({ label: 'Looks good', color: '#15803d' });
  });

  it('also accepts CSS color names', () => {
    const map = parseDSL('title T\nnote Risk here [0.3, 0.2] (color red)');
    const note = map.elements.find((e) => e.elementType === 'note');
    expect(note).toMatchObject({ label: 'Risk here', color: 'red' });
  });

  it('serializes the color and is round-trip stable', () => {
    const src = 'title T\nnote Watch this [0.5, 0.5] (color #b45309)';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('note Watch this [0.5, 0.5] (color #b45309)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('notes without a color stay unchanged (no empty parentheses)', () => {
    const out = serializeDSL(parseDSL('title T\nnote Plain [0.5, 0.5]'));
    expect(out).toContain('note Plain [0.5, 0.5]');
    expect(out).not.toContain('(color');
  });
});
