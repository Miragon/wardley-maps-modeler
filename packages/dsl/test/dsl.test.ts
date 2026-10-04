import { describe, it, expect } from 'vitest';
import type { WardleyMap } from '@miragon/wardley-schema-model';
import { mapToJSON, parseDSL, parseDSLWithDiagnostics, serializeDSL } from '../src/index.js';

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

function expectFixedPoint(text: string): void {
  const firstMap = parseDSL(text);
  const once = serializeDSL(firstMap);
  const secondMap = parseDSL(once);
  expect(serializeDSL(secondMap)).toBe(once);
  expect(mapToJSON(secondMap)).toBe(mapToJSON(firstMap));
}

describe('pipelines without a range', () => {
  it('does not create a pipeline that has neither a range nor children, and says so', () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(
      'title P\ncomponent Tea [0.43, 0.35]\npipeline Kettle',
    );
    expect(map.elements.map((e) => e.elementType)).toEqual(['component']);
    expect(map.rawPassthrough).toEqual(['pipeline Kettle']);
    expect(diagnostics).toEqual([
      {
        line: 3,
        message: 'Pipeline "Kettle" has no range — not drawn; add [start, end] or child components',
        text: 'pipeline Kettle',
      },
    ]);
  });

  it('keeps "pipeline X" next to "component X" without a diagnostic, as OWM draws nothing there', () => {
    const src = 'title P\ncomponent Kettle [0.43, 0.35]\npipeline Kettle';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.elementType)).toEqual(['component']);
    expect(map.rawPassthrough).toEqual(['pipeline Kettle']);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('turns links to or from such a pipeline into unresolved links instead of throwing', () => {
    const src = 'title P\ncomponent A [0.8, 0.3]\npipeline Ghost\nA -> Ghost\nGhost +> A';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.edges).toEqual([]);
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [3, 'Pipeline "Ghost" has no range — not drawn; add [start, end] or child components'],
      [4, 'Link: "Ghost" not found'],
      [5, 'Link: "Ghost" not found'],
    ]);
    expectFixedPoint(src);
  });

  it('an empty block gives no range; the passthrough line drops the consumed "{"', () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(
      'title P\npipeline Empty {\n}\nUser -> Empty',
    );
    expect(map.elements).toEqual([]);
    expect(map.rawPassthrough).toEqual(['pipeline Empty', 'User -> Empty']);
    expect(diagnostics.map((d) => d.line)).toEqual([2, 4]);
  });
});

describe('pipeline range normalisation', () => {
  it.each([
    ['[1, 1]', 0.95, 1],
    ['[0.8, 0.2]', 0.8, 0.85],
    ['[0.97, 0.5]', 0.97, 1],
  ])(
    'turns the empty or reversed range %s into [%s, %s] with a diagnostic',
    (range, start, end) => {
      const src = `title P\npipeline Options ${range}`;
      const { map, diagnostics } = parseDSLWithDiagnostics(src);
      const pipe = map.elements[0]!;
      expect(pipe.elementType === 'pipeline' && [pipe.evolutionStart, pipe.evolutionEnd]).toEqual([
        start,
        end,
      ]);
      expect(diagnostics.map((d) => d.message)).toContain(
        `Pipeline "Options" range is empty or reversed — changed to [${start}, ${end}]`,
      );
      expectFixedPoint(src);
    },
  );

  it('reports clamped range values and still yields a valid range', () => {
    const { map, diagnostics } = parseDSLWithDiagnostics('title P\npipeline Options [1.3, 0.5]');
    const pipe = map.elements[0]!;
    expect(pipe.elementType === 'pipeline' && [pipe.evolutionStart, pipe.evolutionEnd]).toEqual([
      0.95, 1,
    ]);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Coordinate 1.3 is outside [0,1] and was clamped',
      'Pipeline "Options" range is empty or reversed — changed to [0.95, 1]',
    ]);
  });

  it('decides on the range as it is written back (three decimals)', () => {
    const src = 'title P\npipeline Options [0.12345, 0.12346]';
    const pipe = parseDSL(src).elements[0]!;
    expect(pipe.elementType === 'pipeline' && [pipe.evolutionStart, pipe.evolutionEnd]).toEqual([
      0.123, 0.173,
    ]);
    expectFixedPoint(src);
  });
});

describe('unreadable numbers', () => {
  const huge = '9'.repeat(320);

  it('ignores an unreadable (y …) height with a diagnostic', () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(
      'title P\npipeline Options [0.2, 0.6] (y 0.4.1)',
    );
    expect(map.elements[0]!.position.visibility).toBe(0.5);
    expect(diagnostics).toEqual([
      {
        line: 2,
        message: 'Unreadable number in "(y 0.4.1)" — ignored',
        text: 'pipeline Options [0.2, 0.6] (y 0.4.1)',
      },
    ]);
  });

  it('reports an unreadable pipeline range even when the children give a range', () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(
      'title P\npipeline Kettle [0.4.1, 0.9]\n{\n  component Campfire [0.3]\n}',
    );
    const pipe = map.elements.find((e) => e.elementType === 'pipeline');
    expect(pipe?.elementType === 'pipeline' && [pipe.evolutionStart, pipe.evolutionEnd]).toEqual([
      0.3, 0.35,
    ]);
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [2, 'Unreadable number in "[0.4.1, 0.9]" — ignored'],
    ]);
  });

  it('ignores an unreadable label offset with a diagnostic', () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(
      `title T\ncomponent A [0.5, 0.5] label [${huge}, 5]\nanchor U [0.9, 0.5] label [0.4.1, 5]`,
    );
    expect(map.elements.map((e) => e.labelOffset)).toEqual([undefined, undefined]);
    expect(diagnostics.map((d) => d.line)).toEqual([2, 3]);
    expect(diagnostics[1]!.message).toBe('Unreadable number in "label [0.4.1, 5]" — ignored');
  });

  it('keeps a size or annotation with an unreadable number as an uninterpreted line', () => {
    const src = `title T\nsize [${huge}, 800]\nannotation 99999999999999999999 [0.5, 0.5] Too big`;
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.config.size).toBeUndefined();
    expect(map.elements).toEqual([]);
    expect(map.rawPassthrough).toHaveLength(2);
    expect(diagnostics.map((d) => d.line)).toEqual([2, 3]);
    expectFixedPoint(src);
  });

  it('ignores an unreadable label offset on an evolve line with a diagnostic', () => {
    const { map, diagnostics } = parseDSLWithDiagnostics(
      `title T\ncomponent Kettle [0.43, 0.35]\nevolve Kettle 0.62 label [${huge}, 5]`,
    );
    const kettle = map.elements[0]!;
    expect(kettle.elementType === 'component' && kettle.movement).toEqual({
      targetEvolution: 0.62,
    });
    expect(diagnostics.map((d) => d.line)).toEqual([3]);
  });
});

describe('pipeline block braces', () => {
  it('reads a one-line block `{ component A [0.3] }` and closes it', () => {
    const src =
      'title P\npipeline Kettle [0.1, 0.9]\n{ component Campfire [0.3] }\ncomponent Gas [0.5, 0.5]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    const campfire = map.elements.find((e) => e.label === 'Campfire');
    const gas = map.elements.find((e) => e.label === 'Gas');
    expect(campfire?.elementType === 'component' && campfire.pipelineId).toBe('pipeline_kettle');
    expect(gas?.elementType === 'component' && gas.pipelineId).toBeUndefined();
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('reads block content after a line-opening "{" and a "}" ending a child line', () => {
    const src =
      'title P\npipeline Kettle [0.1, 0.9]\n{ component Campfire [0.3]\n  component Electric [0.7] }\ncomponent Gas [0.5, 0.5]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    const children = map.elements.filter((e) => e.elementType === 'component' && e.pipelineId);
    expect(children.map((c) => c.label)).toEqual(['Campfire', 'Electric']);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('accepts "{" at the end of the pipeline line', () => {
    const src = 'title P\npipeline Kettle [0.1, 0.9] {\n  component Campfire [0.3]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.find((e) => e.label === 'Campfire')).toMatchObject({
      pipelineId: 'pipeline_kettle',
    });
    expect(diagnostics).toEqual([]);
  });

  it('ignores a second "{" at the end of a pipeline line, as at the start of a line', () => {
    const src =
      'title P\npipeline Kettle [0.1, 0.9] { {\n  component Campfire [0.3]\n}\npipeline Tea {{';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.label)).toEqual(['Kettle', 'Campfire']);
    expect(map.rawPassthrough).toEqual(['pipeline Tea']);
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [2, 'Ignored "{" — a block must directly follow a pipeline line'],
      [5, 'Ignored "{" — a block must directly follow a pipeline line'],
      [5, 'Pipeline block of "Tea" is never closed — add "}"'],
      [5, 'Pipeline "Tea" has no range — not drawn; add [start, end] or child components'],
    ]);
    expectFixedPoint(src);
  });

  it('ignores an orphan "{" or "}" with a diagnostic and still reads the rest of the line', () => {
    const src = 'title P\n{ note Hello [0.5, 0.5]\ncomponent A [0.4, 0.4]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.label)).toEqual(['Hello', 'A']);
    expect(map.rawPassthrough).toBeUndefined();
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [2, 'Ignored "{" — a block must directly follow a pipeline line'],
      [4, 'Ignored "}" — no pipeline block is open'],
    ]);
    expectFixedPoint(src);
  });

  it('reports a block that is never closed and keeps its children', () => {
    const src = 'title P\npipeline Kettle [0.1, 0.9]\n{\n  component Campfire [0.3]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.find((e) => e.label === 'Campfire')).toMatchObject({
      pipelineId: 'pipeline_kettle',
    });
    expect(diagnostics).toEqual([
      { line: 3, message: 'Pipeline block of "Kettle" is never closed — add "}"', text: '{' },
    ]);
    expectFixedPoint(src);
  });

  it('a pipeline line inside an open block closes that block', () => {
    const src =
      'title P\npipeline A [0.1, 0.5]\n{\n  component A1 [0.2]\npipeline B [0.5, 0.9]\n{\n  component B1 [0.6]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    const parentOf = (label: string) => {
      const child = map.elements.find((e) => e.label === label);
      return child?.elementType === 'component' ? child.pipelineId : undefined;
    };
    expect([parentOf('A1'), parentOf('B1')]).toEqual(['pipeline_a', 'pipeline_b']);
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [3, 'Pipeline block of "A" is never closed — add "}"'],
    ]);
    expectFixedPoint(src);
  });
});

describe('lines inside a pipeline block', () => {
  const SRC = `title P
anchor User [0.95, 0.5]
component Kettle [0.43, 0.35]
pipeline Kettle [0.1, 0.9]
{
  component Campfire [0.3]
  note Cheap [0.4, 0.2]
  User -> Kettle
  component Gas [0.6, 0.7]
}`;

  it('parses every non-child line as a normal statement', () => {
    const { map } = parseDSLWithDiagnostics(SRC);
    expect(map.elements.find((e) => e.label === 'Cheap')?.elementType).toBe('note');
    expect(map.edges).toHaveLength(1);
    const gas = map.elements.find((e) => e.label === 'Gas');
    expect(gas?.position).toEqual({ visibility: 0.6, evolution: 0.7 });
    expect(gas?.elementType === 'component' && gas.pipelineId).toBeUndefined();
    expect(map.rawPassthrough).toBeUndefined();
  });

  it('reports a [visibility, maturity] component inside a block as not a child', () => {
    const { diagnostics } = parseDSLWithDiagnostics(SRC);
    expect(diagnostics).toEqual([
      {
        line: 9,
        message:
          'Component with [visibility, maturity] inside the block of pipeline "Kettle" is not a child — use [maturity]',
        text: 'component Gas [0.6, 0.7]',
      },
    ]);
  });

  it('is stable across saves (the lines move out of the block once)', () => {
    expectFixedPoint(SRC);
  });

  it('a child is decided by its first tuple: one number is a child, two are not', () => {
    const src = 'title P\npipeline Kettle [0.1, 0.9]\n{\n  component Gas [0.6, 0.7] label [5]\n}';
    const { map } = parseDSLWithDiagnostics(src);
    const gas = map.elements.find((e) => e.elementType === 'component');
    expect(gas?.label).toBe('Gas');
    expect(gas?.elementType === 'component' && gas.pipelineId).toBeUndefined();
    expect(gas?.position).toEqual({ visibility: 0.6, evolution: 0.7 });
    expectFixedPoint(src);
  });

  it('reads a child whose name holds brackets, and links to it', () => {
    const src =
      'title P\nanchor U [0.9, 0.5]\npipeline P [0.2, 0.9]\n{\n  component Store [old] [0.4] (buy)\n}\nU -> Store [old]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    const store = map.elements.find((e) => e.label === 'Store [old]');
    expect(store).toMatchObject({
      pipelineId: 'pipeline_p',
      position: { evolution: 0.4 },
      decorators: { method: 'buy' },
    });
    expect(map.edges).toHaveLength(1);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });
});

function messagesOf(text: string): string[] {
  return parseDSLWithDiagnostics(text).diagnostics.map((d) => d.message);
}

describe('text after the coordinates', () => {
  it('ends a note text at its coordinates and reports what follows', () => {
    const src = 'title T\nnote Foo [0.5, 0.5] label [5, 5]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({ label: 'Foo', position: { visibility: 0.5 } });
    expect(diagnostics).toEqual([
      {
        line: 2,
        message: 'Ignored text after the coordinates: "label [5, 5]"',
        text: 'note Foo [0.5, 0.5] label [5, 5]',
      },
    ]);
    expectFixedPoint(src);
  });

  it('does not let a second tuple on a note line become its coordinates on the next parse', () => {
    const src = 'title T\nnote Foo [0.5, 0.5] [0.2, 0.3]';
    const firstMap = parseDSL(src);
    expect(firstMap.elements[0]!.position).toEqual({ visibility: 0.5, evolution: 0.5 });
    expect(parseDSL(serializeDSL(firstMap)).elements[0]!.position).toEqual({
      visibility: 0.5,
      evolution: 0.5,
    });
    expectFixedPoint(src);
  });

  it('ends a pipeline name at its range and reports what follows', () => {
    const src = 'title P\npipeline Motivation [0.19, 0.7] label [0.19, 0.7]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    const pipe = map.elements[0]!;
    expect(pipe.label).toBe('Motivation');
    expect(pipe.elementType === 'pipeline' && [pipe.evolutionStart, pipe.evolutionEnd]).toEqual([
      0.19, 0.7,
    ]);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Ignored text after the coordinates: "label [0.19, 0.7]"',
    ]);
    expectFixedPoint(src);
  });

  it('reads the pipeline suffixes (color …), (y …) and "{" in any order without a diagnostic', () => {
    const src =
      'title P\npipeline Kettle [0.1, 0.9] (y 0.7) (color #b45309) {\n  component Campfire [0.3]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({
      label: 'Kettle',
      color: '#b45309',
      position: { visibility: 0.7 },
    });
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('reads trailing (color …) and (y …) on a pipeline line without a range', () => {
    const src =
      'title P\npipeline Power Source (color red) (y 0.6)\n{\n  component Solar [0.4]\n  component Grid [0.8]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({
      label: 'Power Source',
      color: 'red',
      position: { visibility: 0.6 },
    });
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('reports unknown decorator tokens and stray words on a component and keeps the rest', () => {
    const src = 'title T\ncomponent A [0.5, 0.5] (market, shiny) ? label [5, 5] (green)';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({
      decorators: { market: true },
      labelOffset: { dx: 5, dy: 5 },
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Ignored text after the coordinates: "shiny", "?", "(green)"',
    ]);
    expectFixedPoint(src);
  });

  it.each([
    [
      'anchor User [0.9, 0.5] (market) inertia url(Docs) (color red) label [5, 5]',
      '(market) inertia url(Docs)',
    ],
    ['accelerator Boost [0.7, 0.5] label [5, 5] (buy) (color red)', 'label [5, 5] (buy)'],
    ['deaccelerator Brake [0.3, 0.5] inertia', 'inertia'],
    ['submap Detail [0.4, 0.7] (market) label [5, 5] (color red)', '(market) label [5, 5]'],
    ['pioneers [0.9, 0.1, 0.7, 0.4] (color red) shiny', 'shiny'],
    ['line [[0.8, 0.2], [0.6, 0.35]] (closed) (wavy)', '(wavy)'],
    ['size [800, 600] px', 'px'],
    ['annotations [0.2, 0.8] box', 'box'],
  ])('reports what %s cannot hold', (statement, ignored) => {
    const src = `title T\n${statement}`;
    expect(messagesOf(src)).toEqual([`Ignored text after the coordinates: "${ignored}"`]);
    expectFixedPoint(src);
  });

  it('reports what a pipeline block child cannot hold', () => {
    const src = 'title P\npipeline Power [0.2, 0.8]\n{\n  component Solar [0.4] url(Docs) cheap\n}';
    const { diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toEqual([
      {
        line: 4,
        message: 'Ignored text after the coordinates: "url(Docs) cheap"',
        text: 'component Solar [0.4] url(Docs) cheap',
      },
    ]);
    expectFixedPoint(src);
  });

  it('reports text before the coordinates of statements that have no name', () => {
    const src =
      'title T\npioneers zone [0.9, 0.1, 0.7, 0.4]\nline sketch [[0.8, 0.2], [0.6, 0.35]]';
    expect(messagesOf(src)).toEqual([
      'Ignored text before the coordinates: "zone"',
      'Ignored text before the coordinates: "sketch"',
    ]);
    expectFixedPoint(src);
  });

  it('keeps the first of two colours, label offsets or methods and reports the others', () => {
    const src =
      'title T\ncomponent A [0.5, 0.5] (buy) (color red) label [1, 2] (color blue) label [3, 4] (build)';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({
      color: 'red',
      labelOffset: { dx: 1, dy: 2 },
      decorators: { method: 'buy' },
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Ignored text after the coordinates: "(color blue) label [3, 4] (build)"',
    ]);
    expectFixedPoint(src);
  });

  it('reads every suffix the serializer writes without a diagnostic', () => {
    const src = `title T
url Docs [https://example.org/docs]
anchor User [0.95, 0.5] (color #b45309) label [5, -10]
component Shop [0.7, 0.4] (market, buy) inertia (color #15803d) label [-20, 5] url(Docs)
submap Detail [0.6, 0.2] (color #6d28d9) url(https://example.org/detail)
accelerator Boost [0.5, 0.6] (color #0e7c74)
note Watch [0.4, 0.3] (color red)
annotation 1 [0.3, 0.3] (color blue) Look here
pipeline Shop [0.3, 0.7] (color #1d4ed8) (y 0.65)
{
  component Kiosk [0.4] (ecosystem) inertia (color red) label [3, 3]
}
line [[0.8, 0.2], [0.6, 0.35]] (closed) (dotted) (color green)`;
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toEqual([]);
    expect(map.rawPassthrough).toBeUndefined();
    expectFixedPoint(src);
  });

  it('reads the label offset and inertia forms found in real maps without a diagnostic', () => {
    const src =
      'title T\ncomponent A [0.5, 0.5] label[5,5]\ncomponent B [0.4, 0.4] label [5, 5]inertia\ncomponent C [0.3, 0.3] inertia label [1, 1]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toEqual([]);
    expect(map.elements.map((e) => (e.elementType === 'component' ? e.decorators : null))).toEqual([
      undefined,
      { inertia: true },
      { inertia: true },
    ]);
  });
});

describe('colour only after the coordinates', () => {
  it('keeps (color …) inside a note text as text', () => {
    const src = 'title T\nnote Legend: (color green) = good [0.5, 0.5] (color red)';
    const note = parseDSL(src).elements[0]!;
    expect(note).toMatchObject({ label: 'Legend: (color green) = good', color: 'red' });
    expectFixedPoint(src);
  });

  it('does not swap two colours on save', () => {
    const src = 'title T\nnote Risk (color blue) [0.5, 0.5] (color red)';
    const once = serializeDSL(parseDSL(src));
    expect(parseDSL(once).elements[0]).toMatchObject({ label: 'Risk (color blue)', color: 'red' });
    expectFixedPoint(src);
  });

  it('reads an annotation colour only directly after the position', () => {
    const src =
      'title T\nannotation 1 [0.5, 0.5] Legend: (color green) = good\nannotation 2 [0.4, 0.4] (color red) Risk';
    const [legend, risk] = parseDSL(src).elements;
    expect(legend).toMatchObject({ text: 'Legend: (color green) = good' });
    expect(legend?.color).toBeUndefined();
    expect(risk).toMatchObject({ text: 'Risk', color: 'red' });
    expectFixedPoint(src);
  });

  it('keeps (color …) inside a pipeline name as part of the name', () => {
    const src = 'title P\npipeline Paint (color red) Shop [0.2, 0.8] (color blue)';
    expect(parseDSL(src).elements[0]).toMatchObject({
      label: 'Paint (color red) Shop',
      color: 'blue',
    });
    expectFixedPoint(src);
  });
});

describe('annotation positions', () => {
  it('reads a list with a single position', () => {
    const src = 'title T\nannotation 1 [[0.38, 0.44]] Some text';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({
      text: 'Some text',
      positions: [{ visibility: 0.38, evolution: 0.44 }],
    });
    expect(diagnostics).toEqual([]);
    expect(serializeDSL(map)).toContain('annotation 1 [0.38, 0.44] Some text');
    expectFixedPoint(src);
  });

  it('reads a list closed with a space before the outer bracket', () => {
    const src =
      'title T\nannotation 1 [[0.95,0.75] ] Producer\nannotation 2 [[0.82,0.58],[0.52,0.71] ] Exchange';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.elementType === 'annotation' && e.text)).toEqual([
      'Producer',
      'Exchange',
    ]);
    expect(map.elements[0]).toMatchObject({ positions: [{ visibility: 0.95, evolution: 0.75 }] });
    expect(map.elements[1]).toMatchObject({
      positions: [
        { visibility: 0.82, evolution: 0.58 },
        { visibility: 0.52, evolution: 0.71 },
      ],
    });
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('reports an unreadable position in a list and keeps the others', () => {
    const src = 'title T\nannotation 1 [[0.4.1, 0.2], [0.3, 0.4]] Spot';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({ positions: [{ visibility: 0.3, evolution: 0.4 }] });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Unreadable number in "[0.4.1, 0.2]" — ignored',
    ]);
    expectFixedPoint(src);
  });

  it('reports text between the number and the position', () => {
    const src = 'title T\nannotation 1 Big risk [0.5, 0.5] here';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({ text: 'here' });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Ignored text before the coordinates: "Big risk"',
    ]);
    expectFixedPoint(src);
  });

  it('takes the first position on the line, not a list inside the text', () => {
    const src = 'title T\nannotation 1 [0.5, 0.5] compare [[0.1, 0.2], [0.3, 0.4]]';
    expect(parseDSL(src).elements[0]).toMatchObject({
      positions: [{ visibility: 0.5, evolution: 0.5 }],
      text: 'compare [[0.1, 0.2], [0.3, 0.4]]',
    });
    expectFixedPoint(src);
  });
});

describe('duplicate names', () => {
  it('renames a later duplicate at parse time; links bind to the first', () => {
    const src =
      'title T\ncomponent X [0.8, 0.3]\ncomponent X [0.5, 0.6]\nanchor U [0.9, 0.5]\nU -> X';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.label)).toEqual(['X', 'X 2', 'U']);
    expect(map.elements.map((e) => e.id)).toEqual(['cmp_x', 'cmp_x_2', 'anchor_u']);
    expect(map.edges[0]?.to).toBe('cmp_x');
    expect(diagnostics).toEqual([
      {
        line: 3,
        message: 'Duplicate name "X" — renamed to "X 2"; links bind to the first "X"',
        text: 'component X [0.5, 0.6]',
      },
    ]);
    expectFixedPoint(src);
  });

  it('binds a link to an explicit "X 2" even when a duplicate "X" was renamed', () => {
    const src =
      'title T\nanchor U [0.9, 0.5]\ncomponent X [0.8, 0.3]\ncomponent X [0.5, 0.6]\ncomponent X 2 [0.2, 0.6]\nU -> X 2';
    const map = parseDSL(src);
    expect(map.elements.map((e) => e.label)).toEqual(['U', 'X', 'X 2', 'X 2 2']);
    expect(map.edges[0]?.to).toBe(map.elements[3]!.id);
    expectFixedPoint(src);
  });

  it('binds a link to the new name of a renamed duplicate', () => {
    const src =
      'title T\nanchor U [0.9, 0.5]\ncomponent X [0.8, 0.3]\ncomponent X [0.5, 0.6]\nU -> X 2\nevolve X 2 0.9';
    const map = parseDSL(src);
    const renamed = map.elements[2]!;
    expect(map.edges[0]?.to).toBe(renamed.id);
    expect(renamed.elementType === 'component' && renamed.movement?.targetEvolution).toBe(0.9);
    expectFixedPoint(src);
  });

  it('renames across element kinds and allocates ids from the new name', () => {
    const src = 'title T\nanchor Tea [0.9, 0.5]\ncomponent Tea [0.5, 0.5]\nsubmap Tea [0.3, 0.3]';
    const map = parseDSL(src);
    expect(map.elements.map((e) => [e.id, e.label])).toEqual([
      ['anchor_tea', 'Tea'],
      ['cmp_tea_2', 'Tea 2'],
      ['submap_tea_3', 'Tea 3'],
    ]);
    expectFixedPoint(src);
  });

  it('renames a pipeline block child that repeats a component name', () => {
    const src =
      'title P\ncomponent Solar [0.6, 0.4]\npipeline Power [0.2, 0.8]\n{\n  component Solar [0.4]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.label)).toEqual(['Solar', 'Power', 'Solar 2']);
    expect(diagnostics).toEqual([
      {
        line: 5,
        message: 'Duplicate name "Solar" — renamed to "Solar 2"; links bind to the first "Solar"',
        text: 'component Solar [0.4]',
      },
    ]);
    expectFixedPoint(src);
  });

  it('does not treat a pipeline named like its component as a duplicate', () => {
    const src = 'title P\ncomponent Kettle [0.43, 0.35]\npipeline Kettle [0.1, 0.9]';
    expect(messagesOf(src)).toEqual([]);
  });

  it('renames a name containing "->" the way the serializer writes it', () => {
    const src = 'title T\ncomponent A->B [0.5, 0.5]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]!.label).toBe('A→B');
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Name "A->B" renamed to "A→B" — a name cannot hold link operators ("->", "+>", "+<", "+\'"), comment markers or a leading "{"',
    ]);
    expectFixedPoint(src);
  });
});

describe('evolve names', () => {
  const COMPONENTS =
    'title T\ncomponent Tea (green) [0.6, 0.4]\ncomponent Web 2.0 [0.5, 0.3]\ncomponent Kettle inertia [0.4, 0.2]\n';

  it.each([
    ['evolve Tea (green) 0.8', 'Tea (green)', { targetEvolution: 0.8 }],
    ['evolve Web 2.0 0.9', 'Web 2.0', { targetEvolution: 0.9 }],
    ['evolve Kettle inertia 0.6', 'Kettle inertia', { targetEvolution: 0.6 }],
    [
      'evolve Tea (green)->Matcha 0.7 label [5, 5] (buy)',
      'Tea (green)',
      { targetEvolution: 0.7, newLabel: 'Matcha', method: 'buy', labelOffset: { dx: 5, dy: 5 } },
    ],
    [
      'evolve Web 2.0 0.7 (outsource) label [-5, 5]',
      'Web 2.0',
      { targetEvolution: 0.7, method: 'outsource', labelOffset: { dx: -5, dy: 5 } },
    ],
  ])('reads %s from the end', (evolveLine, name, movement) => {
    const src = COMPONENTS + evolveLine;
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    const element = map.elements.find((e) => e.label === name);
    expect(element?.elementType === 'component' && element.movement).toEqual(movement);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('reports text after the target it cannot read', () => {
    const src = COMPONENTS + 'evolve Web 2.0 0.9 inertia';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    const web = map.elements.find((e) => e.label === 'Web 2.0');
    expect(web?.elementType === 'component' && web.movement).toEqual({ targetEvolution: 0.9 });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Ignored text after the evolve target: "inertia"',
    ]);
    expectFixedPoint(src);
  });
});

describe('names and texts the serializer escapes', () => {
  const BASE = parseDSL(
    'title T\nanchor User [0.9, 0.5]\ncomponent A [0.8, 0.3]\nnote N [0.4, 0.4]\nannotation 1 [0.3, 0.3] Text\npipeline P [0.2, 0.8]\nUser -> A; why\nevolve A 0.9',
  );

  function editedMap(label: string) {
    return {
      ...BASE,
      config: {
        ...BASE.config,
        title: label,
        evolutionLabels: [label, 'b', 'c', 'd'] as const,
        yAxisLabel: label,
      },
      elements: BASE.elements.map((e) => {
        if (e.elementType === 'annotation') return { ...e, label, text: label };
        if (e.elementType === 'component') {
          return { ...e, label, movement: { targetEvolution: 0.9, newLabel: label } };
        }
        return e.elementType === 'anchor' ? e : { ...e, label };
      }),
      edges: BASE.edges.map((edge) => ({ ...edge, label })),
    };
  }

  it('writes comment markers in every name and text so they read back as text', () => {
    const once = serializeDSL(editedMap('a // b /* c */ d'));
    expect(once).not.toMatch(/\/\/|\/\*/);
    expect(once).toContain('component a ∕∕ b ∕* c */ d [0.8, 0.3]');
    const reparsed = parseDSLWithDiagnostics(once);
    expect(reparsed.map.rawPassthrough).toBeUndefined();
    expect(reparsed.map.elements.find((e) => e.elementType === 'note')?.label).toBe(
      'a ∕∕ b ∕* c */ d',
    );
    expect(reparsed.map.edges).toHaveLength(1);
    expectFixedPoint(once);
  });

  it('keeps "//" directly after ":" (addresses) and in flow values', () => {
    const map = parseDSL(
      "title https://example.org\ncomponent A [0.8, 0.3]\ncomponent B [0.5, 0.6]\nA +'http://x'> B",
    );
    const once = serializeDSL(map);
    expect(once).toContain('title https://example.org');
    expect(once).toContain("A +'http://x'> B");
  });

  it('writes a line break in a name or text as a space and keeps the note escape', () => {
    const once = serializeDSL(editedMap('first\nsecond'));
    expect(once).toContain('component first second [0.8, 0.3]');
    expect(once).toContain('note first\\nsecond [0.4, 0.4]');
    expect(once).toContain('annotation 1 [0.3, 0.3] first second');
    expect(once).toContain('title first second');
    expect(once).toContain('User -> first second; first second');
    expectFixedPoint(once);
  });

  it('names url definitions so that a flow operator in the element name does not make them a link', () => {
    const src = "title T\ncomponent A +'5'> B [0.6, 0.4] url(https://example.org/a)";
    const once = serializeDSL(parseDSL(src));
    const reparsed = parseDSLWithDiagnostics(once);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.map.elements[0]).toMatchObject({ url: 'https://example.org/a' });
    expectFixedPoint(src);
  });

  it('names url definitions so that names with brackets or parentheses read back', () => {
    const src =
      'title T\ncomponent Tea (green) [0.6, 0.4] url(https://example.org/tea)\ncomponent Tea green [0.5, 0.4] url(https://example.org/other)';
    const once = serializeDSL(parseDSL(src));
    const reparsed = parseDSLWithDiagnostics(once);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.map.elements.map((e) => e.elementType === 'component' && e.url)).toEqual([
      'https://example.org/tea',
      'https://example.org/other',
    ]);
    expectFixedPoint(src);
  });
});

describe('links whose left name starts with a statement keyword', () => {
  it.each([
    'Title Search',
    'Y-axis Tool',
    'Evolution Engine',
    'Annotation Service',
    'Annotations Hub',
    'Evolve Rate',
    'Line Manager',
    'Style Guide',
    'Size Calc',
  ])('reads "%s -> Index" as a link when both names are declared, even further down', (name) => {
    const src = `title Map\n${name} -> Index; why\ncomponent ${name} [0.6, 0.4]\ncomponent Index [0.4, 0.5]`;
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.config).toEqual({ title: 'Map' });
    expect(map.edges.map((edge) => [edge.from, edge.to, edge.label])).toEqual([
      [map.elements[0]!.id, map.elements[1]!.id, 'why'],
    ]);
    expect(map.rawPassthrough).toBeUndefined();
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('keeps the statement when the names on both sides are not declared', () => {
    const src =
      'title Tea -> Coffee\nevolution Genesis->Custom->Product->Commodity\ncomponent Coffee [0.5, 0.5]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.config).toEqual({
      title: 'Tea -> Coffee',
      evolutionLabels: ['Genesis', 'Custom', 'Product', 'Commodity'],
    });
    expect(map.edges).toEqual([]);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('reads a link to an undeclared name as the statement and says so', () => {
    const src = 'component Title Search [0.6, 0.4]\nTitle Search +> Ghost';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.config.title).toBe('Search +> Ghost');
    expect(diagnostics).toEqual([
      {
        line: 2,
        message: 'Link: "Ghost" not found — read as a "title" statement',
        text: 'Title Search +> Ghost',
      },
    ]);
    expectFixedPoint(src);
  });

  it('does not let a "{" after such a link open the block of the pipeline before it', () => {
    const src =
      'title P\ncomponent Pipeline Monitor [0.6, 0.4]\ncomponent Index [0.4, 0.5]\npipeline Feed [0.2, 0.8]\nPipeline Monitor -> Index\n{\n  component Probe [0.3]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.edges).toHaveLength(1);
    expect(map.elements.find((e) => e.label === 'Probe')).toBeUndefined();
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [6, 'Ignored "{" — a block must directly follow a pipeline line'],
      [7, 'Line could not be interpreted (kept losslessly in rawPassthrough)'],
      [8, 'Ignored "}" — no pipeline block is open'],
    ]);
  });
});

describe('link annotations with coordinates', () => {
  it('reads a link whose annotation holds a tuple, also when its left name starts with a keyword', () => {
    const src =
      'title T\ncomponent Component X [0.6, 0.4]\ncomponent B [0.4, 0.5]\nComponent X -> B; at [0.5, 0.5]\nB +> Component X; peak [0.9, 0.1]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.label)).toEqual(['Component X', 'B']);
    expect(map.edges.map((edge) => edge.label)).toEqual(['at [0.5, 0.5]', 'peak [0.9, 0.1]']);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('keeps a declaration with a link operator before ";" when the link names are not declared', () => {
    const src = 'title T\nnote Risk -> high; see [0.5, 0.5]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => [e.elementType, e.label])).toEqual([
      ['note', 'Risk -> high; see'],
    ]);
    expect(map.edges).toEqual([]);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });
});

describe('comments on lines starting with "url"', () => {
  it('strips a trailing comment from a link whose left name starts with "URL"', () => {
    const src =
      'title T\ncomponent URL Shortener [0.6, 0.4]\ncomponent Index [0.4, 0.5]\nURL Shortener -> Index // why';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.edges).toHaveLength(1);
    expect(map.rawPassthrough).toEqual(['// why']);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('keeps "//" inside the address of a url definition', () => {
    const src = 'title T\nurl Docs [https://example.org//a]\ncomponent A [0.5, 0.5] url(Docs)';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({ url: 'https://example.org//a' });
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('removes a stray "*/" from a url definition, which would end a block comment on save', () => {
    const src = 'title T\nurl Do*/cs [https://example.org/a]\n/* parked';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.rawPassthrough).toEqual(['/* parked', 'url Do cs [https://example.org/a]']);
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [3, 'Block comment "/*" is never closed — the rest of the file is a comment'],
      [2, 'Ignored "*/" — this line is kept after an unclosed "/*" and would end that comment'],
    ]);
    expectFixedPoint(src);
  });

  it('strips a comment after a url definition', () => {
    const src =
      'title T\nurl Docs [https://example.org/a] // the docs\ncomponent A [0.5, 0.5] url(Docs)';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({ url: 'https://example.org/a' });
    expect(map.rawPassthrough).toEqual(['// the docs']);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });
});

describe('apostrophes and comments', () => {
  it('strips comments after a name with an apostrophe', () => {
    const src =
      "title T\ncomponent Bob's Shop [0.6, 0.4] // flagship\ncomponent Index [0.4, 0.5]\nBob's Shop -> Index // why\nnote Bob's plan [0.5, 0.5] /* draft */";
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.label)).toEqual(["Bob's Shop", 'Index', "Bob's plan"]);
    expect(map.edges).toHaveLength(1);
    expect(map.rawPassthrough).toEqual(['// flagship', '// why', '/* draft */']);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('does not open a block comment inside a line comment', () => {
    const src = 'title T\ncomponent A [0.5, 0.5] // see */ and /* here\ncomponent B [0.4, 0.4]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.label)).toEqual(['A', 'B']);
    expect(map.rawPassthrough).toEqual(['// see */ and /* here']);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('still keeps "//" inside a flow value', () => {
    const src =
      "title T\ncomponent Bob's Shop [0.6, 0.4]\ncomponent Index [0.4, 0.5]\nBob's Shop +'http://x/a//b'> Index // why";
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.edges[0]).toMatchObject({ flowValue: 'http://x/a//b' });
    expect(map.rawPassthrough).toEqual(['// why']);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('does not keep a comment in a text after an apostrophe, which a save would escape', () => {
    const src = "title Bob's plan // draft\ncomponent A [0.5, 0.5]\nA -> A; Bob's edge /* why */";
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.config.title).toBe("Bob's plan");
    expect(map.edges[0]?.label).toBe("Bob's edge");
    expect(map.rawPassthrough).toEqual(['// draft', '/* why */']);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });
});

describe('statements that cannot be used are reported', () => {
  it('reports an unknown statement and keeps it', () => {
    const src = 'title T\ncompnent X [0.5, 0.5]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.rawPassthrough).toEqual(['compnent X [0.5, 0.5]']);
    expect(diagnostics).toEqual([
      { line: 2, message: 'Unknown statement "compnent"', text: 'compnent X [0.5, 0.5]' },
    ]);
    expectFixedPoint(src);
  });

  it.each([
    ["A +'5' B", 'Flow +\'5\' has no direction — add ">", "<" or "<>"'],
    ['A ->', 'Link needs a name on both sides'],
    ["+'5'> B", 'Link needs a name on both sides'],
    ["A; see +'5'> B", 'Unknown statement "A;"'],
    ['buy', 'buy: needs a component name — not used'],
    ['annotation 1 Risk', 'Annotation has no position — not drawn; add [visibility, maturity]'],
    ['annotations', 'Annotations box has no position — not used; add [visibility, maturity]'],
  ])('reports "%s" and keeps it', (statement, message) => {
    const src = `title T\ncomponent A [0.5, 0.5]\ncomponent B [0.4, 0.4]\n${statement}`;
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.rawPassthrough).toEqual([statement]);
    expect(diagnostics).toEqual([{ line: 4, message, text: statement }]);
    expectFixedPoint(src);
  });

  it('reports an evolution line without four stages and keeps it', () => {
    const src = 'title T\nevolution A->B->C';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.config.evolutionLabels).toBeUndefined();
    expect(map.rawPassthrough).toEqual(['evolution A->B->C']);
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [2, 'Evolution needs exactly four stages, found 3 — not used'],
    ]);
    expectFixedPoint(src);
  });

  it('removes an unusable evolution or y-axis line when another line sets it, as the serializer does', () => {
    const src = 'title T\nevolution A->B->C\nevolution W->X->Y->Z\ny-axis ->\ny-axis Value';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.config).toMatchObject({
      evolutionLabels: ['W', 'X', 'Y', 'Z'],
      yAxisLabel: 'Value',
    });
    expect(map.rawPassthrough).toBeUndefined();
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [
        2,
        'Evolution needs exactly four stages, found 3 — removed; another "evolution" line sets it',
      ],
      [4, 'y-axis has no label — removed; another "y-axis" line sets it'],
    ]);
    expectFixedPoint(src);
  });

  it.each([
    ['y-axis Value->Low', 'Value'],
    ['y-axis Value->Low->High->Extra', 'Value->Low->High'],
    ['y-axis ->->Top', 'Top'],
  ])('reports what "%s" is read as', (statement, read) => {
    const src = `title T\n${statement}`;
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(serializeDSL(map)).toContain(`y-axis ${read}\n`);
    expect(diagnostics.map((d) => d.message)).toEqual([
      `y-axis takes "Label" or "Label->Bottom->Top" — read as "${read}"`,
    ]);
    expectFixedPoint(src);
  });

  it('reports a url(…) reference without a definition', () => {
    const src =
      'title T\ncomponent A [0.5, 0.5] url(Docs)\nsubmap S [0.4, 0.4] url(mailto:a@b.org)';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).not.toHaveProperty('url');
    expect(map.elements[1]).not.toHaveProperty('urlRef');
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [2, 'url(Docs) has no matching "url Docs [address]" line — ignored'],
      [3, 'url(mailto:a@b.org) has no matching "url mailto:a@b.org [address]" line — ignored'],
    ]);
    expectFixedPoint(src);
  });

  it('reports a config or evolve line that replaces an earlier one', () => {
    const src =
      'title First\ncomponent Kettle [0.4, 0.3] (build)\ny-axis Value->Low->High\nevolve Kettle 0.6\ntitle Second\ny-axis Worth\nevolve Kettle 0.8\nbuy Kettle';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.config).toEqual({ title: 'Second', yAxisLabel: 'Worth' });
    expect(map.elements[0]).toMatchObject({
      movement: { targetEvolution: 0.8 },
      decorators: { method: 'buy' },
    });
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [5, 'Repeated "title" — replaces the one on line 1'],
      [6, 'Repeated "y-axis" — replaces the one on line 3'],
      [7, 'Repeated evolve for "Kettle" — replaces the one on line 4'],
      [8, 'buy: "Kettle" already has the method "build" — replaced'],
    ]);
    expectFixedPoint(src);
  });

  it('reports clamped region corners', () => {
    const src = 'title T\npioneers [1.2, 0.1, 0.7, -0.4]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({
      position: { visibility: 1, evolution: 0 },
      corner2: { visibility: 0.7, evolution: 0.1 },
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Coordinate 1.2 is outside [0,1] and was clamped',
      'Coordinate -0.4 is outside [0,1] and was clamped',
    ]);
  });

  it('reports a block comment that is never closed', () => {
    const src = 'title T\ncomponent A [0.5, 0.5] /* parked\ncomponent B [0.4, 0.4]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.label)).toEqual(['A']);
    expect(diagnostics).toEqual([
      {
        line: 2,
        message: 'Block comment "/*" is never closed — the rest of the file is a comment',
        text: 'component A [0.5, 0.5] /* parked',
      },
    ]);
    expectFixedPoint(src);
  });
});

describe('config lines inside comments', () => {
  it('keeps a commented-out evolution or y-axis line when the map sets its own', () => {
    const src =
      'title T\nevolution A->B->C->D\ny-axis Value\n/*\nevolution Old->Labels\ny-axis Old\n*/';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('evolution Old->Labels\ny-axis Old\n*/');
    expectFixedPoint(src);
  });
});

describe('large inputs', () => {
  it('keeps many unreferenced url definitions without running out of stack', () => {
    const src = Array.from({ length: 200_000 }, (_, i) => `url D${i} [http://x/${i}]`).join('\n');
    expect(parseDSL(src).rawPassthrough).toHaveLength(200_000);
  });

  it('reports one very long decorator group without running out of stack', () => {
    const src = `component A [0.5, 0.5] (market${',x'.repeat(200_000)})`;
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({ decorators: { market: true } });
    expect(diagnostics).toHaveLength(1);
  });
});

describe('comment markers inside flow values', () => {
  it.each([
    ["title Cost +'a//b'", (map: WardleyMap) => map.config.title, "Cost +'a//b'"],
    ["title A +'/*' x", (map: WardleyMap) => map.config.title, "A +'/*' x"],
    ["note see +'a//b' [0.5, 0.5]", (map: WardleyMap) => map.elements[0]?.label, "see +'a//b'"],
    [
      "annotation 1 [0.5, 0.5] see +'x/*y'",
      (map: WardleyMap) => map.elements[0]?.label,
      "see +'x/*y'",
    ],
    ["y-axis +'//'", (map: WardleyMap) => map.config.yAxisLabel, "+'//'"],
    [
      "component A [0.5, 0.5]\ncomponent B [0.4, 0.4]\nA -> B; why +'x//y'",
      (map: WardleyMap) => map.edges[0]?.label,
      "why +'x//y'",
    ],
  ])(
    'keeps "//" and "/*" inside a flow value of "%s" as text, also once saved',
    (src, read, kept) => {
      const { map, diagnostics } = parseDSLWithDiagnostics(src);
      expect(read(map)).toBe(kept);
      expect(diagnostics).toEqual([]);
      expect(read(parseDSL(serializeDSL(map)))).toBe(kept);
      expectFixedPoint(src);
    },
  );

  it('escapes a comment marker that only a flow value opened in another part of the line protects', () => {
    const src = "title T\nevolution a +'x->y//z'->c->d";
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.config.evolutionLabels).toEqual(["a +'x", "y∕∕z'", 'c', 'd']);
    expect(diagnostics.map((d) => d.message)).toEqual([
      `"y//z'" read as "y∕∕z'" — "//" or "/*" there would start a comment once saved`,
    ]);
    expectFixedPoint(src);
  });

  it('renames flow operators in names, so a reversed flow written forward reads the same', () => {
    const src = 'title T\ncomponent A +> B [0.5, 0.5]\ncomponent C [0.4, 0.4]\nC +< A +> B';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]!.label).toBe('A ＋> B');
    expect(map.edges).toHaveLength(1);
    expect(diagnostics.map((d) => d.message)).toEqual([
      `Name "A +> B" renamed to "A ＋> B" — a name cannot hold link operators ("->", "+>", "+<", "+'"), comment markers or a leading "{"`,
    ]);
    expectFixedPoint(src);
  });

  it('renames an unclosed flow value in a name, so it cannot open a comment in a link line', () => {
    const src =
      "title T\ncomponent A +' [0.5, 0.5]\ncomponent B [0.4, 0.4]\ncomponent C [0.3, 0.3]\nB +'/*'< A +'\nB -> C";
    const { map } = parseDSLWithDiagnostics(src);
    expect(map.edges).toHaveLength(2);
    expectFixedPoint(src);
  });
});

describe('"*/" without a block comment', () => {
  it.each([
    [
      'url Docs [https://x.org/api/*/v1]\ncomponent X [0.5, 0.5] url(Docs)',
      (map: WardleyMap) => map.elements[0]?.elementType === 'component' && map.elements[0].url,
      'https://x.org/api/*/v1',
    ],
    [
      'url Docs [https://x.org/files/**/*.md]\nsubmap X [0.5, 0.5] url(Docs)',
      (map: WardleyMap) => map.elements[0]?.elementType === 'submap' && map.elements[0].urlRef,
      'https://x.org/files/**/*.md',
    ],
    [
      "component A [0.5, 0.5]\ncomponent B [0.4, 0.4]\nA +'5 */ unit'> B",
      (map: WardleyMap) => map.edges[0]?.edgeType === 'flow' && map.edges[0].flowValue,
      '5 */ unit',
    ],
    [
      'component A [0.5, 0.5]\ncomponent B [0.4, 0.4]\nA -> B; ratio 5*/2',
      (map: WardleyMap) => map.edges[0]?.label,
      'ratio 5*/2',
    ],
  ])('keeps it as text in "%s", also once saved', (src, read, kept) => {
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(read(map)).toBe(kept);
    expect(diagnostics).toEqual([]);
    expect(read(parseDSL(serializeDSL(map)))).toBe(kept);
    expectFixedPoint(src);
  });

  it('keeps an unknown line holding it unchanged', () => {
    const src = 'title T\nnotes here */';
    expect(parseDSL(src).rawPassthrough).toEqual(['notes here */']);
    expectFixedPoint(src);
  });
});

describe('url definitions', () => {
  it('reads a definition whose address holds "->" or "+>" as a definition', () => {
    for (const address of ['https://x.org/a->b', 'https://x.org/?q=a+>b']) {
      const src = `title T\ncomponent A [0.5, 0.5] url(${address})`;
      const once = serializeDSL(parseDSL(src));
      expect(parseDSL(once).elements[0]).toMatchObject({ url: address });
      expectFixedPoint(src);
    }
  });

  it('still reads a link whose left name starts with "URL" and whose annotation is in brackets', () => {
    const src =
      'title T\ncomponent URL Shortener [0.6, 0.4]\ncomponent Index [0.4, 0.5]\nIndex +< URL Shortener; [9]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.edges).toEqual([
      { id: 'flow_1', edgeType: 'flow', from: 'cmp_url_shortener', to: 'cmp_index', label: '[9]' },
    ]);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('lets a later definition of a name replace an earlier one and keeps the earlier one', () => {
    const src = 'title T\nurl D [http://a]\nurl D [http://b]\ncomponent A [0.5, 0.5] url(D)';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({ url: 'http://b' });
    expect(map.rawPassthrough).toEqual(['url D [http://a]']);
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [3, 'Repeated url definition "D" — replaces the one on line 2, which is kept unused'],
    ]);
    expectFixedPoint(src);
  });

  it('names a written definition apart from one kept unused, so neither replaces the other', () => {
    const src = 'title T\ncomponent A [0.5, 0.5] url(http://y)\nurl A URL [http://x]';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('url A URL 2 [http://y]');
    expect(parseDSL(once).elements[0]).toMatchObject({ url: 'http://y' });
    expectFixedPoint(src);
  });
});

describe('links whose left name starts with a keyword, as the serializer writes them', () => {
  it.each([
    ['component title search [0.1, 0.1]\ncomponent X [0.2, 0.2]\nTITLE search -> X'],
    ['component note A [0.1, 0.1]\ncomponent B [0.2, 0.2]\nNote A -> B; see [0.4, 0.6]'],
  ])('reads "%s" as a link to the name written with that keyword', (declarations) => {
    const { map, diagnostics } = parseDSLWithDiagnostics(`title T\n${declarations}`);
    expect(map.config.title).toBe('T');
    expect(map.edges).toHaveLength(1);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(`title T\n${declarations}`);
  });

  it('reads a buy line with a flow operator in its name as a component that stays one', () => {
    const src =
      'title T\ncomponent component X [0.1, 0.1]\ncomponent Y [0.2, 0.2]\nbuy X +> Y; [0.4, 0.6]';
    const { map } = parseDSLWithDiagnostics(src);
    expect(map.elements[2]).toMatchObject({ label: 'X ＋> Y;', decorators: { method: 'buy' } });
    expect(map.edges).toEqual([]);
    expectFixedPoint(src);
  });

  it('reads a pipeline line with a tuple only after ";" as a link, so its block opens nothing', () => {
    const src =
      'title T\ncomponent pipeline A [0.1, 0.1]\ncomponent B [0.2, 0.2]\ncomponent title X [0.3, 0.3]\npipeline A -> B; [0.4, 0.6]\n{\ncomponent C [0.5]\n}\ntitle X -> C';
    const { map } = parseDSLWithDiagnostics(src);
    expect(map.elements.some((e) => e.elementType === 'pipeline')).toBe(false);
    expect(map.edges).toHaveLength(1);
    expect(map.config.title).toBe('X -> C');
    expectFixedPoint(src);
  });
});

describe('braces at the start of a name', () => {
  it('reads a link from a name starting with "}" while no block is open', () => {
    const src =
      'title T\ncomponent }legacy [0.5, 0.5]\ncomponent B [0.4, 0.4]\n}legacy -> B\nB -> }legacy';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.edges).toHaveLength(2);
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('renames a leading "{", so a link written from that name cannot open a pipeline block', () => {
    const src = 'title T\ncomponent {A [0.5, 0.5]\ncomponent B [0.4, 0.4]\nB +< {A';
    const { map } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]!.label).toBe('｛A');
    expect(map.edges).toHaveLength(1);
    expectFixedPoint(src);
  });

  it('does not let a block bind to a pipeline before a pipeline line that cannot be read', () => {
    const src =
      'title T\npipeline Power [0.2, 0.8]\npipeline [0.3, 0.9]\n{\n  component Solar [0.4]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.find((e) => e.label === 'Solar')).toBeUndefined();
    expect(diagnostics.map((d) => [d.line, d.message])).toContainEqual([
      4,
      'Ignored "{" — a block must directly follow a pipeline line',
    ]);
    expectFixedPoint(src);
  });

  it('gives the source line as the text of every diagnostic', () => {
    const src = 'title T\ncomponent A [0.5, 0.5]\n{ A -> Ghost // why\nevolve Ghost 0.8 junk';
    const { diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics.map((d) => [d.line, d.text])).toEqual([
      [3, '{ A -> Ghost // why'],
      [4, 'evolve Ghost 0.8 junk'],
      [3, '{ A -> Ghost // why'],
    ]);
  });
});

describe('pipeline heights and names', () => {
  it('takes the height only from a component, as the serializer assumes', () => {
    for (const src of [
      'title T\nanchor Customer [0.9, 0.5]\npipeline Customer [0.2, 0.8] (y 0.5)',
      'title T\nanchor X [0.1, 0.1]\nanchor X [0.9, 0.9]\ncomponent X 2 [0.5, 0.5]\npipeline X 2 [0.2, 0.8]',
    ]) {
      const pipeline = parseDSL(src).elements.find((e) => e.elementType === 'pipeline');
      expect(pipeline?.position.visibility).toBe(0.5);
      expectFixedPoint(src);
    }
  });

  it('writes (y …) when the heights as written differ', () => {
    const src = 'title T\ncomponent Tea [0.5125, 0.5]\npipeline Tea [0.2, 0.8] (y 0.512)';
    expect(serializeDSL(parseDSL(src))).toContain('pipeline Tea [0.2, 0.8] (y 0.512)');
    expectFixedPoint(src);
  });

  it('renames a pipeline the way its component is renamed, so they stay a pair', () => {
    const src = 'title T\ncomponent A->B [0.7, 0.5]\npipeline A->B [0.2, 0.8]';
    const { map } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => [e.elementType, e.label, e.position.visibility])).toEqual([
      ['component', 'A→B', 0.7],
      ['pipeline', 'A→B', 0.7],
    ]);
    expect(serializeDSL(map)).toContain('pipeline A→B [0.2, 0.8]\n');
    expectFixedPoint(src);
  });

  it('reads trailing (color …) and (y …) of a pipeline without range after a name ending in "url"', () => {
    const src = 'title T\npipeline Url (y 0.4) (color red)\n{\n  component C [0.3]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({
      label: 'Url',
      color: 'red',
      position: { visibility: 0.4 },
      evolutionStart: 0.3,
      evolutionEnd: 0.35,
    });
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it('reports suffixes written where they are part of the name or text', () => {
    const src =
      'title T\npipeline P (color red) [0.2, 0.8]\npipeline Q (y 0.6) [0.2, 0.8]\nnote Risk (color red) [0.5, 0.5]\nannotation 1 [0.5, 0.5] t (color red)\nnote Legend: (color green) = good [0.4, 0.4]';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.label)).toEqual([
      'Risk (color red)',
      't (color red)',
      'Legend: (color green) = good',
      'P (color red)',
      'Q (y 0.6)',
    ]);
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [2, '"(color red)" before the coordinates is read as part of the name — write it after them'],
      [3, '"(y 0.6)" before the coordinates is read as part of the name — write it after them'],
      [4, '"(color red)" before the coordinates is read as part of the text — write it after them'],
      [
        5,
        '"(color red)" after the annotation text is read as part of the text — write it directly after the position',
      ],
    ]);
    expectFixedPoint(src);
  });
});

describe('diagnostics that only matter for what is kept', () => {
  it('reports nothing about the suffixes of an evolve or pipeline line that is kept whole', () => {
    const src = 'title T\nevolve Ghost 0.8 junk\npipeline Lone (y 2) junk';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.rawPassthrough).toEqual(['pipeline Lone (y 2) junk', 'evolve Ghost 0.8 junk']);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Pipeline "Lone (y 2) junk" has no range — not drawn; add [start, end] or child components',
      'evolve: component "Ghost" not found',
    ]);
  });

  it('derives a range from a single child without a diagnostic', () => {
    const src = 'title T\npipeline P\n{\n  component C [0.3]\n}';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements[0]).toMatchObject({ evolutionStart: 0.3, evolutionEnd: 0.35 });
    expect(diagnostics).toEqual([]);
    expectFixedPoint(src);
  });

  it.each([
    [
      'evolve A inertia 0.9',
      'evolve: component "A inertia" not found — for component "A", write "inertia" on its component line',
    ],
    [
      'evolve A (buy) 0.9',
      'evolve: component "A (buy)" not found — for component "A", write "(buy)" after the target',
    ],
  ])('says how to write "%s"', (line, message) => {
    const src = `title T\ncomponent A [0.5, 0.5]\n${line}`;
    expect(messagesOf(src)).toEqual([message]);
    expectFixedPoint(src);
  });

  it('reports a method decorator that differs from the method keyword', () => {
    const src = 'title T\nbuild A [0.5, 0.5] (buy)\nbuy B [0.4, 0.4] (market, outsource)';
    const { map, diagnostics } = parseDSLWithDiagnostics(src);
    expect(map.elements.map((e) => e.elementType === 'component' && e.decorators)).toEqual([
      { method: 'build' },
      { method: 'buy', market: true },
    ]);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Ignored text after the coordinates: "(buy)"',
      'Ignored text after the coordinates: "outsource"',
    ]);
    expectFixedPoint(src);
  });

  it('quotes ignored text as it stands in the line', () => {
    expect(messagesOf('title T\ncomponent X [0.5, 0.5] url(My Docs (v2))')).toEqual([
      'Ignored text after the coordinates: "url(My Docs (v2))"',
    ]);
  });

  it.each(['titleß', 'anchoré [0.5, 0.5]', 'buyß[0,0]'])(
    'reads "%s", a keyword run into a letter, as an unknown statement',
    (line) => {
      const { map, diagnostics } = parseDSLWithDiagnostics(`title T\n${line}`);
      expect(map.config.title).toBe('T');
      expect(map.elements).toEqual([]);
      expect(map.rawPassthrough).toEqual([line]);
      expect(diagnostics.map((d) => d.message)).toEqual([
        `Unknown statement "${line.split(/\s/)[0]}"`,
      ]);
    },
  );

  it('keeps no carriage return in a comment, which a save would turn into a line ending', () => {
    for (const src of [
      'component A [0.5, 0.5]\n// c\r',
      'component A [0.5, 0.5]\n// c\r\r\ncomponent B [0.4, 0.4]',
    ]) {
      expect(parseDSL(src).rawPassthrough).toEqual(['// c']);
      expectFixedPoint(src);
    }
  });
});
