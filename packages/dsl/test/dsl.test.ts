import { describe, it, expect } from 'vitest';
import { parseDSL, parseDSLWithDiagnostics, serializeDSL } from '../src/index.js';

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
pioneers [0.9, 0.1, 0.7, 0.4]
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

  it('reads attitude (pioneers) with two normalized corners', () => {
    const map = parseDSL(RICH);
    const att = map.elements.find((e) => e.elementType === 'attitude');
    expect(att?.elementType).toBe('attitude');
    if (att?.elementType === 'attitude') {
      expect(att.kind).toBe('pioneers');
      expect(att.position).toEqual({ visibility: 0.9, evolution: 0.1 });
      expect(att.corner2).toEqual({ visibility: 0.7, evolution: 0.4 });
    }
  });

  it('legacy px form `pioneers [v,m] w h` lands in rawPassthrough (hard cut)', () => {
    const map = parseDSL('title T\npioneers [0.9, 0.1] 120 30');
    expect(map.elements.find((e) => e.elementType === 'attitude')).toBeUndefined();
    expect(map.rawPassthrough).toContain('pioneers [0.9, 0.1] 120 30');
  });

  it('reads the canonical attitude form [vis1, mat1, vis2, mat2] (OWM)', () => {
    const map = parseDSL('title T\nsettlers [0.59, 0.43, 0.49, 0.63]');
    const att = map.elements.find((e) => e.elementType === 'attitude');
    expect(att?.elementType).toBe('attitude');
    if (att?.elementType === 'attitude') {
      expect(att.kind).toBe('settlers');
      expect(att.position).toEqual({ visibility: 0.59, evolution: 0.43 });
      expect(att.corner2).toEqual({ visibility: 0.49, evolution: 0.63 });
    }
    const out = serializeDSL(map);
    expect(out).toContain('settlers [0.59, 0.43, 0.49, 0.63]');
    expect(serializeDSL(parseDSL(out))).toBe(out);
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

  it('keeps the y-axis end labels losslessly through the round-trip', () => {
    const src = 'title T\ny-axis Value chain->Invisible->Visible';
    const map = parseDSL(src);
    expect(map.config.yAxisEndLabels).toEqual(['Invisible', 'Visible']);
    const once = serializeDSL(map);
    expect(once).toContain('y-axis Value chain->Invisible->Visible');
    expect(serializeDSL(parseDSL(once))).toBe(once);
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

describe('parseDSL – comments', () => {
  it('does NOT parse commented-out components as elements', () => {
    const map = parseDSL('title T\n// component Ghost [0.5, 0.5]\ncomponent Real [0.4, 0.4]');
    expect(map.elements.map((e) => e.label)).toEqual(['Real']);
    expect(map.rawPassthrough).toContain('// component Ghost [0.5, 0.5]');
  });

  it('separates trailing // comments from content (label stays clean)', () => {
    const map = parseDSL('title T\ncomponent Kettle [0.43, 0.35] // replace soon');
    const kettle = map.elements[0]!;
    expect(kettle.label).toBe('Kettle');
    expect(map.rawPassthrough).toContain('// replace soon');
  });

  it('skips /* ... */ blocks spanning multiple lines', () => {
    const map = parseDSL(
      'title T\n/* everything\ncomponent Ghost [0.5, 0.5]\ngone */\ncomponent Real [0.4, 0.4]',
    );
    expect(map.elements.map((e) => e.label)).toEqual(['Real']);
  });

  it('leaves // in quoted flow values untouched', () => {
    const map = parseDSL(
      "title T\ncomponent A [0.8, 0.3]\ncomponent B [0.5, 0.6]\nA +'http://x'> B",
    );
    const flow = map.edges.find((e) => e.edgeType === 'flow');
    expect(flow?.edgeType === 'flow' && flow.flowValue).toBe('http://x');
  });

  it('comments survive the round-trip (rawPassthrough)', () => {
    const src = 'title T\n// important note\ncomponent Real [0.4, 0.4]';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('// important note');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('parseDSL – evolve with label offset', () => {
  it('reads evolve X 0.62 label [16, 5] as movement with labelOffset', () => {
    const map = parseDSL(
      'title T\ncomponent Kettle [0.43, 0.35]\nevolve Kettle 0.62 label [16, 5]',
    );
    const kettle = map.elements.find((e) => e.label === 'Kettle');
    expect(kettle?.elementType === 'component' && kettle.movement?.targetEvolution).toBe(0.62);
    expect(kettle?.elementType === 'component' && kettle.movement?.labelOffset).toEqual({
      dx: 16,
      dy: 5,
    });
    const out = serializeDSL(map);
    expect(out).toContain('evolve Kettle 0.62 label [16, 5]');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });
});

describe('parseDSL – multi-position annotations', () => {
  it('reads annotation 1 [[y,x],[y,x]] text losslessly', () => {
    const src = 'title T\nannotation 1 [[0.9, 0.4], [0.5, 0.6]] Two spots';
    const map = parseDSL(src);
    const anno = map.elements.find((e) => e.elementType === 'annotation');
    expect(anno?.elementType === 'annotation' && anno.positions).toEqual([
      { visibility: 0.9, evolution: 0.4 },
      { visibility: 0.5, evolution: 0.6 },
    ]);
    expect(anno?.elementType === 'annotation' && anno.text).toBe('Two spots');
    const out = serializeDSL(map);
    expect(out).toContain('annotation 1 [[0.9, 0.4], [0.5, 0.6]] Two spots');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });
});

describe('parseDSL – names with parentheses/keywords', () => {
  it('leaves parentheses in names untouched (decorators only after coordinates)', () => {
    const map = parseDSL('title T\ncomponent Tea (green) [0.6, 0.8]');
    const tea = map.elements[0]!;
    expect(tea.label).toBe('Tea (green)');
    expect(tea.elementType === 'component' && tea.decorators).toBeUndefined();
  });

  it('leaves the word "inertia" in names untouched', () => {
    const map = parseDSL('title T\ncomponent inertia dampener [0.6, 0.8]');
    expect(map.elements[0]!.label).toBe('inertia dampener');
  });

  it('still reads decorators after the coordinates', () => {
    const map = parseDSL('title T\ncomponent X [0.1, 0.2] (market, outsource) inertia');
    const x = map.elements[0]!;
    expect(x.elementType === 'component' && x.decorators).toEqual({
      market: true,
      method: 'outsource',
      inertia: true,
    });
  });
});

describe('parseDSL – Legacy build/buy/outsource', () => {
  it('sets the method on an existing component (buy Kettle)', () => {
    const map = parseDSL('title T\ncomponent Kettle [0.43, 0.35]\nbuy Kettle');
    const kettle = map.elements.find((e) => e.label === 'Kettle');
    expect(kettle?.elementType === 'component' && kettle.decorators?.method).toBe('buy');
  });

  it('creates a component with a method when coordinates are given (outsource Power [y,x])', () => {
    const map = parseDSL('title T\noutsource Power [0.1, 0.7]');
    const power = map.elements.find((e) => e.label === 'Power');
    expect(power?.elementType === 'component' && power.decorators?.method).toBe('outsource');
  });

  it('an unknown reference stays in rawPassthrough', () => {
    const map = parseDSL('title T\nbuy Ghost');
    expect(map.rawPassthrough).toContain('buy Ghost');
  });
});

describe('parseDSL – pipeline block (OWM v2)', () => {
  const SRC = `title P
component Kettle [0.43, 0.35]
pipeline Kettle [0.1, 0.9]
{
  component Campfire Kettle [0.35]
  component Electric Kettle [0.7] (buy)
}
Campfire Kettle -> Electric Kettle`;

  it('reads block children with visibility inheritance and pipelineId', () => {
    const map = parseDSL(SRC);
    const pipe = map.elements.find((e) => e.elementType === 'pipeline');
    expect(pipe?.elementType).toBe('pipeline');
    const kids = map.elements.filter((e) => e.elementType === 'component' && e.pipelineId);
    expect(kids.map((k) => k.label)).toEqual(['Campfire Kettle', 'Electric Kettle']);
    for (const k of kids) {
      expect(k.elementType === 'component' && k.pipelineId).toBe(pipe!.id);
      expect(k.position.visibility).toBe(0.43); // inherited from the Kettle component
    }
    expect(kids[0]!.position.evolution).toBe(0.35);
    expect(kids[1]!.elementType === 'component' && kids[1]!.decorators?.method).toBe('buy');
    if (pipe?.elementType === 'pipeline') expect(pipe.childIds).toHaveLength(2);
    // edges to block children work
    expect(map.edges).toHaveLength(1);
  });

  it('derives the range from the children when no coordinates are given', () => {
    const map = parseDSL(
      'title P\npipeline Power Source\n{\n  component Solar [0.4]\n  component Grid [0.8]\n}',
    );
    const pipe = map.elements.find((e) => e.elementType === 'pipeline');
    if (pipe?.elementType === 'pipeline') {
      expect(pipe.evolutionStart).toBe(0.4);
      expect(pipe.evolutionEnd).toBe(0.8);
    }
  });

  it('serializes the block form and round-trips stably', () => {
    const once = serializeDSL(parseDSL(SRC));
    expect(once).toContain('pipeline Kettle [0.1, 0.9]');
    expect(once).toContain('{');
    expect(once).toContain('  component Campfire Kettle [0.35]');
    expect(once).toContain('  component Electric Kettle [0.7] (buy)');
    expect(once).toContain('}');
    // children must NOT additionally appear as top-level component
    expect(once.match(/^component Campfire Kettle/m)).toBeNull();
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('keeps the height of a standalone pipeline via the `(y …)` extension', () => {
    const src = 'title P\npipeline Options [0.2, 0.6] (y 0.75)';
    const map = parseDSL(src);
    const pipe = map.elements.find((e) => e.elementType === 'pipeline');
    expect(pipe?.position.visibility).toBe(0.75);
    const once = serializeDSL(map);
    expect(once).toContain('pipeline Options [0.2, 0.6] (y 0.75)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('writes NO (y …) when the height matches the anchor component (canonical OWM stays clean)', () => {
    const src = 'title P\ncomponent Kettle [0.43, 0.35]\npipeline Kettle [0.3, 0.65]';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('pipeline Kettle [0.3, 0.65]');
    expect(once).not.toContain('(y ');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('a standalone pipeline (no anchor component) is an edge endpoint itself', () => {
    const src = `title P
anchor consumer [0.95, 0.5]
pipeline GOOD [0.3, 0.7]
{
  component physical [0.4]
}
consumer -> GOOD`;
    const map = parseDSL(src);
    const pipe = map.elements.find((e) => e.elementType === 'pipeline');
    const edge = map.edges[0];
    expect(edge?.to).toBe(pipe!.id);
    const once = serializeDSL(map);
    expect(once).toContain('consumer -> GOOD');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('with an anchor component the edge still binds to the component (OWM convention)', () => {
    const src = `title P
anchor consumer [0.95, 0.5]
component GOOD [0.8, 0.5]
pipeline GOOD [0.3, 0.7]
consumer -> GOOD`;
    const map = parseDSL(src);
    const comp = map.elements.find((e) => e.elementType === 'component' && e.label === 'GOOD');
    expect(map.edges[0]?.to).toBe(comp!.id);
  });
});

describe('parseDSL – url keyword', () => {
  it('resolves url definition + url(Name) reference on submap/component', () => {
    const src = `title T
url TeamMap [https://example.org/team#m=abc]
submap Platform [0.4, 0.7] url(TeamMap)
component API [0.6, 0.5] url(https://api.example.org/docs)`;
    const map = parseDSL(src);
    const sub = map.elements.find((e) => e.elementType === 'submap');
    expect(sub?.elementType === 'submap' && sub.urlRef).toBe('https://example.org/team#m=abc');
    const api = map.elements.find((e) => e.label === 'API');
    expect(api?.elementType === 'component' && api.url).toBe('https://api.example.org/docs');
  });

  it('round-trips definition + reference stably', () => {
    const src =
      'title T\nurl TeamMap [https://example.org/x]\nsubmap Platform [0.4, 0.7] url(TeamMap)';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('url Platform URL [https://example.org/x]');
    expect(once).toContain('url(Platform URL)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('keeps unreferenced url definitions in rawPassthrough', () => {
    const map = parseDSL('title T\nurl Orphaned [https://example.org/y]');
    expect(map.rawPassthrough).toContain('url Orphaned [https://example.org/y]');
  });
});

describe('parseDSLWithDiagnostics', () => {
  it('reports unparsable lines with line numbers', () => {
    const { diagnostics } = parseDSLWithDiagnostics('title T\ncomponent broken [oops]\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(2);
    expect(diagnostics[0]!.text).toContain('component broken');
  });

  it('clamps out-of-range coordinates instead of throwing', () => {
    const { map, diagnostics } = parseDSLWithDiagnostics('title T\ncomponent X [1.4, -0.2]');
    const x = map.elements[0]!;
    expect(x.position).toEqual({ visibility: 1, evolution: 0 });
    expect(diagnostics.some((d) => d.message.includes('clamped'))).toBe(true);
  });

  it('reports unresolved references (evolve/edges) with line numbers', () => {
    const { diagnostics } = parseDSLWithDiagnostics(
      'title T\ncomponent A [0.5, 0.5]\nevolve Ghost 0.8\nA -> Ghost',
    );
    expect(diagnostics.some((d) => d.line === 3 && d.message.includes('Ghost'))).toBe(true);
    expect(diagnostics.some((d) => d.line === 4 && d.message.includes('Ghost'))).toBe(true);
  });

  it('comments produce NO diagnostics', () => {
    const { diagnostics } = parseDSLWithDiagnostics('title T\n// just a comment\n');
    expect(diagnostics).toHaveLength(0);
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

describe('element color on every type (project extension: `(color …)`)', () => {
  it('parses and round-trips the color on all element lines', () => {
    const src = `title T
anchor consumer [0.9, 0.5] (color #b45309)
component Shop [0.7, 0.4] (market) (color #15803d)
submap Detail [0.6, 0.2] (color #6d28d9)
accelerator Boost [0.5, 0.6] (color #0e7c74)
pioneers [0.8, 0.1, 0.6, 0.3] (color #be123c)
pipeline Shop [0.3, 0.7] (color #1d4ed8)`;
    const map = parseDSL(src);
    const colorOf = (type: string) => map.elements.find((e) => e.elementType === type)?.color;
    expect(colorOf('anchor')).toBe('#b45309');
    expect(colorOf('component')).toBe('#15803d');
    expect(colorOf('submap')).toBe('#6d28d9');
    expect(colorOf('accelerator')).toBe('#0e7c74');
    expect(colorOf('attitude')).toBe('#be123c');
    expect(colorOf('pipeline')).toBe('#1d4ed8');
    // Decorators survive next to the color.
    const comp = map.elements.find((e) => e.elementType === 'component');
    expect(comp && 'decorators' in comp && comp.decorators?.market).toBe(true);
    const once = serializeDSL(map);
    expect(once).toContain('component Shop [0.7, 0.4] (market) (color #15803d)');
    expect(once).toContain('pipeline Shop [0.3, 0.7] (color #1d4ed8)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('round-trips freeform drawings (`line` project extension)', () => {
    const src = `title T
line [[0.8, 0.2], [0.6, 0.35], [0.7, 0.5]] (closed) (dashed) (color #b45309)
line [[0.3, 0.1], [0.25, 0.4]]`;
    const map = parseDSL(src);
    const drawings = map.elements.filter((e) => e.elementType === 'drawing');
    expect(drawings).toHaveLength(2);
    const shape = drawings[0]!;
    if (shape.elementType === 'drawing') {
      expect(shape.points).toHaveLength(3);
      expect(shape.closed).toBe(true);
      expect(shape.strokeStyle).toBe('dashed');
      expect(shape.color).toBe('#b45309');
    }
    const open = drawings[1]!;
    if (open.elementType === 'drawing') {
      expect(open.closed).toBeUndefined();
      expect(open.strokeStyle).toBeUndefined();
    }
    const once = serializeDSL(map);
    expect(once).toContain(
      'line [[0.8, 0.2], [0.6, 0.35], [0.7, 0.5]] (closed) (dashed) (color #b45309)',
    );
    expect(once).toContain('line [[0.3, 0.1], [0.25, 0.4]]');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('keeps the color on pipeline block children', () => {
    const src = `title T
pipeline GOOD [0.3, 0.7]
{
  component physical [0.4] (color #b45309)
}`;
    const map = parseDSL(src);
    const child = map.elements.find((e) => e.label === 'physical');
    expect(child?.color).toBe('#b45309');
    const once = serializeDSL(map);
    expect(once).toContain('  component physical [0.4] (color #b45309)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});
