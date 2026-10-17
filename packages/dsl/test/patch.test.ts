import { describe, expect, it } from 'vitest';
import type { MapElement, WardleyMap } from '@miragon/wardley-schema-model';
import { parseDSL, patchDSL, serializeDSL } from '../src/index.js';
import { patchDSLWithOutcome } from '../src/patch.js';
import {
  addEdges,
  addElements,
  component,
  deleteElement,
  elementNamed,
  inRendererOrder,
  lineDiff,
  link,
  moveTo,
  rename,
  withElement,
} from './support/map-edits.js';
import { meaningOf } from './support/meaning.js';
import { documentationMap, vscodeExampleMap } from './support/test-fixtures.js';

const HANDWRITTEN = `// Tea shop, maintained by hand
title Tea Shop
style wardley

// --- users
anchor Business [0.95, 0.63]
anchor Public [0.95, 0.78]

// --- value chain
component Cup of Tea [0.79, 0.61] // self-service entry point
component Cup [0.73, 0.78]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.80]
component Water [0.38, 0.82]
component Kettle [0.43, 0.35]
evolve Kettle 0.62
component Power [0.10, 0.71] (outsource)

pipeline Kettle [0.30, 0.65]
note Standard power lets kettles evolve [0.25, 0.30]

/* links */
Business -> Cup of Tea
Public -> Cup of Tea
Cup of Tea -> Cup
Cup of Tea -> Tea
Cup of Tea -> Hot Water
Hot Water -> Water
Hot Water -> Kettle
Kettle -> Power
`;

/** Patches and checks the result means exactly what the canonical serialization means. */
function patch(text: string, map: WardleyMap): string {
  const { text: patched, outcome } = patchDSLWithOutcome(text, map);
  expect(meaningOf(patched)).toEqual(meaningOf(serializeDSL(map)));
  expect(outcome).toBe('patched');
  return patched;
}

function edit(text: string, change: (map: WardleyMap) => WardleyMap) {
  const patched = patch(text, change(parseDSL(text)));
  return { patched, ...lineDiff(text, patched) };
}

describe('patchDSL: moving', () => {
  it('rewrites exactly the line of the moved element and keeps every other line verbatim', () => {
    const result = edit(HANDWRITTEN, (map) =>
      moveTo(map, 'Hot Water', { visibility: 0.52, evolution: 0.82 }),
    );
    expect(result.removed).toEqual(['component Hot Water [0.52, 0.80]']);
    expect(result.added).toEqual(['component Hot Water [0.52, 0.82]']);
  });

  it('keeps an inline comment on the moved line', () => {
    const result = edit(HANDWRITTEN, (map) =>
      moveTo(map, 'Cup of Tea', { visibility: 0.79, evolution: 0.63 }),
    );
    expect(result.added).toEqual(['component Cup of Tea [0.79, 0.63] // self-service entry point']);
    expect(result.removed).toHaveLength(1);
  });

  it('ignores the element order of the modeler export (layer order, not source order)', () => {
    const result = edit(HANDWRITTEN, (map) =>
      inRendererOrder(moveTo(map, 'Cup', { visibility: 0.7, evolution: 0.78 })),
    );
    expect(result).toMatchObject({
      removed: ['component Cup [0.73, 0.78]'],
      added: ['component Cup [0.7, 0.78]'],
    });
  });

  it('matches elements by name when the edited map carries other ids', () => {
    const result = edit(HANDWRITTEN, (map) => {
      const moved = moveTo(map, 'Tea', { visibility: 0.6, evolution: 0.81 });
      const idOf = (id: string) => `renamed_${id}`;
      return {
        ...moved,
        elements: moved.elements.map((el) => ({ ...el, id: idOf(el.id) }) as MapElement),
        edges: moved.edges.map((e) => ({
          ...e,
          id: idOf(e.id),
          from: idOf(e.from),
          to: idOf(e.to),
        })),
      };
    });
    expect(result.removed).toEqual(['component Tea [0.63, 0.81]']);
    expect(result.added).toEqual(['component Tea [0.6, 0.81]']);
  });

  it('keeps lines in place when the modeler still holds the ids of its first read', () => {
    let text =
      'title T\n// users\ncomponent Tea [0.5, 0.5]\ncomponent Cup [0.40, 0.70]\nCup -> Tea\n';
    let modelerMap = parseDSL(text);
    const writeBack = (change: (map: WardleyMap) => WardleyMap) => {
      modelerMap = change(modelerMap);
      const before = text;
      text = patch(text, modelerMap);
      return lineDiff(before, text);
    };
    writeBack((map) => rename(map, 'Tea', 'Green Tea'));
    // The re-read text now gives the id the modeler holds for "Green Tea" to the new "Tea".
    writeBack((map) => addElements(map, component('Component_new', 'Tea', 0.3, 0.3)));
    expect(writeBack((map) => moveTo(map, 'Cup', { visibility: 0.4, evolution: 0.75 }))).toEqual({
      removed: ['component Cup [0.40, 0.70]'],
      added: ['component Cup [0.4, 0.75]'],
    });
    expect(text).toBe(
      'title T\n// users\ncomponent Green Tea [0.5, 0.5]\ncomponent Cup [0.4, 0.75]\n' +
        'component Tea [0.3, 0.3]\nCup -> Green Tea\n',
    );
  });

  it('turns the one-step nudge of the VS Code example map into a one-line diff', () => {
    const example = vscodeExampleMap();
    const result = edit(example, (map) => moveTo(map, 'Cup', { visibility: 0.73, evolution: 0.8 }));
    expect(result.removed).toEqual(['component Cup [0.73, 0.78]']);
    expect(result.added).toEqual(['component Cup [0.73, 0.8]']);
  });

  it('moves notes, annotations, attitudes, drawings, submaps and accelerators in place', () => {
    const text = [
      'title Kinds',
      'note A note [0.40, 0.20]',
      'annotation 1 [[0.50, 0.50], [0.60, 0.60]] Two places',
      'pioneers [0.90, 0.10, 0.70, 0.30]',
      'line [[0.10, 0.10], [0.20, 0.20]] (dashed)',
      'submap Billing [0.30, 0.30]',
      'accelerator Boost [0.70, 0.70]',
      '',
    ].join('\n');
    const shifted = (map: WardleyMap) => ({
      ...map,
      elements: map.elements.map((el): MapElement => {
        switch (el.elementType) {
          case 'annotation':
            return { ...el, positions: [{ visibility: 0.55, evolution: 0.5 }, el.positions[1]!] };
          case 'attitude':
            return { ...el, corner2: { visibility: 0.6, evolution: 0.3 } };
          case 'drawing':
            return { ...el, points: [el.points[0]!, { visibility: 0.25, evolution: 0.2 }] };
          default:
            return { ...el, position: { visibility: 0.45, evolution: el.position.evolution } };
        }
      }),
    });
    const result = edit(text, shifted);
    expect(result.removed).toHaveLength(6);
    expect(result.added).toEqual([
      'note A note [0.45, 0.2]',
      'annotation 1 [[0.55, 0.5], [0.6, 0.6]] Two places',
      'pioneers [0.9, 0.1, 0.6, 0.3]',
      'line [[0.1, 0.1], [0.25, 0.2]] (dashed)',
      'submap Billing [0.45, 0.3]',
      'accelerator Boost [0.45, 0.7]',
    ]);
  });
});

describe('patchDSL: renaming', () => {
  it('rewrites the element line and only the lines that reference it', () => {
    const result = edit(HANDWRITTEN, (map) => rename(map, 'Hot Water', 'Boiling Water'));
    expect(result.removed).toEqual([
      'component Hot Water [0.52, 0.80]',
      'Cup of Tea -> Hot Water',
      'Hot Water -> Water',
      'Hot Water -> Kettle',
    ]);
    expect(result.added).toEqual([
      'component Boiling Water [0.52, 0.8]',
      'Cup of Tea -> Boiling Water',
      'Boiling Water -> Water',
      'Boiling Water -> Kettle',
    ]);
  });

  it('rewrites evolve lines and keeps a url definition the element references', () => {
    const text = [
      'title Urls',
      'url Docs [https://example.org/docs]',
      'component Wiki [0.5, 0.5] url(Docs)',
      'component Search [0.4, 0.6]',
      'evolve Wiki 0.8',
      'Wiki -> Search',
      '',
    ].join('\n');
    const result = edit(text, (map) => rename(map, 'Wiki', 'Knowledge Base'));
    expect(result.removed).toEqual([
      'component Wiki [0.5, 0.5] url(Docs)',
      'evolve Wiki 0.8',
      'Wiki -> Search',
    ]);
    expect(result.added).toEqual([
      'component Knowledge Base [0.5, 0.5] url(Docs)',
      'evolve Knowledge Base 0.8',
      'Knowledge Base -> Search',
    ]);
  });

  it('rewrites a pipeline child and the links that use it', () => {
    const result = edit(documentationMap(), (map) => rename(map, 'Browser App', 'Web App'));
    expect(result.removed).toEqual([
      '  component Browser App [0.56]',
      'Browser App -> Share Link',
      'Browser App -> Web Browser',
      'Sharing & Discussing -> Browser App',
    ]);
    expect(result.added).toEqual([
      '  component Web App [0.56]',
      'Web App -> Share Link',
      'Web App -> Web Browser',
      'Sharing & Discussing -> Web App',
    ]);
  });
});

describe('patchDSL: deleting', () => {
  it('removes the element line and the lines of its links', () => {
    const result = edit(HANDWRITTEN, (map) => deleteElement(map, 'Water'));
    expect(result.removed).toEqual(['component Water [0.38, 0.82]', 'Hot Water -> Water']);
    expect(result.added).toEqual([]);
  });

  it('removes the evolve line with its component', () => {
    const result = edit(HANDWRITTEN, (map) =>
      deleteElement(
        deleteElement(map, 'Kettle'),
        'Kettle', // the pipeline of the same name
      ),
    );
    expect(result.removed).toEqual([
      'component Kettle [0.43, 0.35]',
      'evolve Kettle 0.62',
      'pipeline Kettle [0.30, 0.65]',
      'Hot Water -> Kettle',
      'Kettle -> Power',
    ]);
    expect(result.added).toEqual([]);
  });

  it('keeps the comment of a deleted line', () => {
    const result = edit(HANDWRITTEN, (map) => deleteElement(map, 'Cup of Tea'));
    expect(result.added).toEqual(['// self-service entry point']);
    expect(result.removed).toContain(
      'component Cup of Tea [0.79, 0.61] // self-service entry point',
    );
  });

  it('removes a link without touching its endpoints', () => {
    const result = edit(HANDWRITTEN, (map) => ({
      ...map,
      edges: map.edges.filter((edge) => edge.to !== elementNamed(map, 'Power').id),
    }));
    expect(result).toMatchObject({ removed: ['Kettle -> Power'], added: [] });
  });

  it('removes a pipeline block with its last child', () => {
    const result = edit(documentationMap(), (map) =>
      deleteElement(deleteElement(map, 'VS Code Extension'), 'Browser App'),
    );
    expect(result.removed).toEqual([
      '{',
      '  component VS Code Extension [0.374]',
      '  component Browser App [0.56]',
      '}',
      'Browser App -> Share Link',
      'Browser App -> Web Browser',
      'VS Code Extension -> VS Code',
      'Sharing & Discussing -> Browser App',
      'Visual Map Editor -> VS Code Extension',
    ]);
    expect(result.added).toEqual([]);
    expect(result.patched).toContain('pipeline Mapping Tools [0.335, 0.619] (y 0.524)\ncomponent');
  });
});

describe('patchDSL: adding', () => {
  it('inserts a component after the last component and a link after the last link', () => {
    const result = edit(HANDWRITTEN, (map) => {
      const withMilk = addElements(map, component('cmp_milk', 'Milk', 0.6, 0.7));
      return addEdges(withMilk, link(withMilk, 'dep_milk', 'Cup of Tea', 'Milk'));
    });
    expect(result.removed).toEqual([]);
    expect(result.added).toEqual(['component Milk [0.6, 0.7]', 'Cup of Tea -> Milk']);
    const lines = result.patched.split('\n');
    expect(lines[lines.indexOf('component Milk [0.6, 0.7]') - 1]).toBe(
      'component Power [0.10, 0.71] (outsource)',
    );
    expect(lines[lines.indexOf('Cup of Tea -> Milk') - 1]).toBe('Kettle -> Power');
  });

  it('inserts an evolve line after the last evolve line', () => {
    const result = edit(HANDWRITTEN, (map) =>
      withElement(
        map,
        'Tea',
        (el) => ({ ...el, movement: { targetEvolution: 0.9 } }) as MapElement,
      ),
    );
    expect(result).toMatchObject({ removed: [], added: ['evolve Tea 0.9'] });
    const lines = result.patched.split('\n');
    expect(lines[lines.indexOf('evolve Tea 0.9') - 1]).toBe('evolve Kettle 0.62');
  });

  it('adds a child at the end of the existing pipeline block', () => {
    const result = edit(documentationMap(), (map) => {
      const pipeline = elementNamed(map, 'Mapping Tools');
      const child = {
        ...component('cmp_desktop', 'Desktop App', pipeline.position.visibility, 0.45),
        pipelineId: pipeline.id,
      } as MapElement;
      return addElements(map, child);
    });
    expect(result).toMatchObject({ removed: [], added: ['  component Desktop App [0.45]'] });
    expect(result.patched).toContain(
      '  component Browser App [0.56]\n  component Desktop App [0.45]\n}',
    );
  });

  it('moves a child that changed pipelines into the block of its new pipeline', () => {
    const text = [
      'title T',
      '// first',
      'component P [0.6, 0.5]',
      'pipeline P [0.20, 0.80]',
      '{',
      '  component A [0.30]',
      '  component B [0.70]',
      '}',
      '// second',
      'component Q [0.3, 0.5]',
      'pipeline Q [0.20, 0.80]',
      '{',
      '  component C [0.40]',
      '}',
      '',
    ].join('\n');
    const result = edit(text, (map) => {
      const target = elementNamed(map, 'Q');
      const pipelineQ = map.elements.find(
        (el) => el.elementType === 'pipeline' && el.label === 'Q',
      )!;
      return withElement(
        map,
        'A',
        (el) =>
          ({
            ...el,
            pipelineId: pipelineQ.id,
            position: { ...el.position, visibility: target.position.visibility },
          }) as MapElement,
      );
    });
    expect(result).toMatchObject({
      removed: ['  component A [0.30]'],
      added: ['  component A [0.3]'],
    });
    expect(result.patched).toContain('  component C [0.40]\n  component A [0.3]\n}');
  });

  it('writes out the range of a pipeline whose children no longer span it', () => {
    const text =
      'title T\n// kettles\npipeline K\n{\n  component K1 [0.20]\n  component K2 [0.70]\n}\n';
    const result = edit(text, (map) =>
      withElement(
        map,
        'K1',
        (el) => ({ ...el, position: { ...el.position, evolution: 0.3 } }) as MapElement,
      ),
    );
    expect(result).toMatchObject({
      removed: ['pipeline K', '  component K1 [0.20]'],
      added: ['pipeline K [0.2, 0.7]', '  component K1 [0.3]'],
    });
  });

  it('opens a block under a pipeline that had none', () => {
    const result = edit(HANDWRITTEN, (map) => {
      const pipeline = map.elements.find((el) => el.elementType === 'pipeline')!;
      return addElements(map, {
        ...component('cmp_electric', 'Electric Kettle', 0.43, 0.6),
        pipelineId: pipeline.id,
      } as MapElement);
    });
    expect(result.removed).toEqual([]);
    expect(result.patched).toContain(
      'pipeline Kettle [0.30, 0.65]\n{\n  component Electric Kettle [0.6]\n}\nnote Standard',
    );
  });

  it('writes a whole new map into an empty file', () => {
    const map = parseDSL(HANDWRITTEN);
    const patched = patch('', map);
    expect(patched).toBe(serializeDSL(map));
  });
});

describe('patchDSL: configuration', () => {
  it('changes the title in place', () => {
    const result = edit(HANDWRITTEN, (map) => ({
      ...map,
      config: { ...map.config, title: 'Tea Shop 2' },
    }));
    expect(result).toMatchObject({ removed: ['title Tea Shop'], added: ['title Tea Shop 2'] });
  });

  it('adds a size line after the other config lines and then edits only that line', () => {
    const sized = edit(HANDWRITTEN, (map) => ({
      ...map,
      config: { ...map.config, size: { width: 1440, height: 900 } },
    }));
    expect(sized).toMatchObject({ removed: [], added: ['size [1440, 900]'] });
    expect(sized.patched).toContain('style wardley\nsize [1440, 900]\n');

    const resized = edit(sized.patched, (map) => ({
      ...map,
      config: { ...map.config, size: { width: 1760, height: 720 } },
    }));
    expect(resized).toMatchObject({ removed: ['size [1440, 900]'], added: ['size [1760, 720]'] });
  });

  it('adds a title on top when the file has none', () => {
    const text = 'component A [0.5, 0.5]\n';
    const patched = patch(text, { ...parseDSL(text), config: { title: 'Named' } });
    expect(patched).toBe('title Named\ncomponent A [0.5, 0.5]\n');
  });

  it('edits the evolution and y-axis labels in place', () => {
    const text = 'title T\nevolution A->B->C->D\ny-axis Value\ncomponent X [0.5, 0.5]\n';
    const result = edit(text, (map) => ({
      ...map,
      config: { ...map.config, evolutionLabels: ['G', 'C', 'P', 'U'], yAxisLabel: 'Visibility' },
    }));
    expect(result).toMatchObject({
      removed: ['evolution A->B->C->D', 'y-axis Value'],
      added: ['evolution G->C->P->U', 'y-axis Visibility'],
    });
  });

  it('removes a size line kept as unknown text once the size is set', () => {
    const text = 'title T\nsize [wide]\ncomponent X [0.5, 0.5]\n';
    const map = parseDSL(text);
    const result = lineDiff(
      text,
      patch(text, {
        ...map,
        config: { ...map.config, size: { width: 800, height: 600 } },
        rawPassthrough: [],
      }),
    );
    expect(result).toEqual({ removed: ['size [wide]'], added: ['size [800, 600]'] });
  });
});

describe('patchDSL: source layout', () => {
  it('preserves CRLF line breaks and a missing final line break', () => {
    const crlf = HANDWRITTEN.replace(/\n/g, '\r\n').replace(/\r\n$/, '');
    const map = moveTo(parseDSL(crlf), 'Water', { visibility: 0.4, evolution: 0.82 });
    const patched = patch(crlf, addElements(map, component('cmp_milk', 'Milk', 0.6, 0.7)));
    expect(patched).not.toMatch(/[^\r]\n/);
    expect(patched.endsWith('Kettle -> Power')).toBe(true);
    expect(patched).toContain('\r\ncomponent Water [0.4, 0.82]\r\n');
    expect(patched).toContain('\r\ncomponent Milk [0.6, 0.7]\r\n');
  });

  it('keeps comments, blank lines and number formatting through a series of edits', () => {
    let text = HANDWRITTEN;
    text = patch(text, moveTo(parseDSL(text), 'Water', { visibility: 0.4, evolution: 0.82 }));
    text = patch(text, rename(parseDSL(text), 'Tea', 'Green Tea'));
    text = patch(text, deleteElement(parseDSL(text), 'Public'));
    for (const kept of [
      '// Tea shop, maintained by hand',
      '// --- users',
      '/* links */',
      'component Power [0.10, 0.71] (outsource)',
      'component Hot Water [0.52, 0.80]',
    ]) {
      expect(text).toContain(kept);
    }
    expect(text.split('\n').filter((line) => line === '')).toHaveLength(5);
  });

  it('rewrites a legacy method line into the component line', () => {
    const text = 'title T\ncomponent Kettle [0.4, 0.3]\nbuy Kettle\n';
    const result = edit(text, (map) =>
      withElement(
        map,
        'Kettle',
        (el) => ({ ...el, decorators: { method: 'build' } }) as MapElement,
      ),
    );
    expect(result).toEqual({
      patched: 'title T\ncomponent Kettle [0.4, 0.3] (build)\n',
      removed: ['component Kettle [0.4, 0.3]', 'buy Kettle'],
      added: ['component Kettle [0.4, 0.3] (build)'],
    });
  });
});

describe('patchDSL: safety net', () => {
  it('falls back to the canonical text when a changed line cannot be edited around its comment', () => {
    const text = 'title T\ncomponent A /* first */ [0.1, 0.2]\n';
    const map = moveTo(parseDSL(text), 'A', { visibility: 0.3, evolution: 0.2 });
    const { text: patched, outcome } = patchDSLWithOutcome(text, map);
    expect(outcome).toBe('serialized');
    expect(patched).toBe(serializeDSL(map));
  });

  it('rewrites every statement in place when a minimal patch would change a meaning', () => {
    // Deleting the first "X" turns the second one (read as "X 2") into "X" on a minimal patch.
    const text = 'title T\n// keep me\ncomponent X [0.1, 0.1]\ncomponent X [0.2, 0.2]\n';
    const map = parseDSL(text);
    const { text: patched, outcome } = patchDSLWithOutcome(text, deleteElement(map, 'X'));
    expect(outcome).toBe('rewritten');
    expect(patched).toBe('title T\n// keep me\ncomponent X 2 [0.2, 0.2]\n');
  });

  it('never throws, whatever it is given', () => {
    const map = parseDSL(HANDWRITTEN);
    const broken = { ...map, elements: [null] } as unknown as WardleyMap;
    expect(() => patchDSL(HANDWRITTEN, broken)).not.toThrow();
    expect(patchDSL(HANDWRITTEN, broken)).toBe(HANDWRITTEN);
    expect(patchDSL(undefined as unknown as string, map)).toBe(serializeDSL(map));
    expect(patchDSL(42 as unknown as string, map)).toBe(serializeDSL(map));
  });
});

describe('patchDSL: an editor that keeps the ids of its first read', () => {
  function renameAll(map: WardleyMap, label: string, newLabel: string): WardleyMap {
    return {
      ...map,
      elements: map.elements.map((el) =>
        'label' in el && el.label === label ? ({ ...el, label: newLabel } as MapElement) : el,
      ),
    };
  }

  it.each([
    ['a component with an inline comment', 'Cup of Tea'],
    ['a note', 'Standard power lets kettles evolve'],
    ['an evolving component and the pipeline it anchors', 'Kettle'],
  ])('keeps %s in place when it is renamed twice', (_case, label) => {
    const firstRead = parseDSL(HANDWRITTEN);
    const typo = renameAll(firstRead, label, `${label}x`);
    const afterTypo = patchDSL(HANDWRITTEN, typo, { previous: firstRead });
    expect(lineDiff(HANDWRITTEN, afterTypo).removed).toHaveLength(
      lineDiff(HANDWRITTEN, afterTypo).added.length,
    );

    const fixed = renameAll(typo, `${label}x`, label);
    const before = HANDWRITTEN.split('\n');
    const after = patchDSL(afterTypo, fixed, { previous: typo }).split('\n');
    // Same lines in the same places; only the renamed statements are rewritten (number format).
    expect(after).toHaveLength(before.length);
    after.forEach((line, index) => {
      if (line !== before[index]) expect(line).toContain(label);
    });
  });

  it('still inserts a new element that takes over a renamed name', () => {
    const firstRead = parseDSL(HANDWRITTEN);
    const renamed = rename(firstRead, 'Tea', 'Green Tea');
    const text = patchDSL(HANDWRITTEN, renamed, { previous: firstRead });
    const withNewTea = addElements(renamed, component('cmp_new', 'Tea', 0.6, 0.85));
    const { removed, added } = lineDiff(text, patchDSL(text, withNewTea, { previous: renamed }));
    expect(removed).toEqual([]);
    expect(added).toEqual(['component Tea [0.6, 0.85]']);
  });
});

describe('patchDSL: a statement after the end of a block comment', () => {
  const SOURCE = `// header
title B
component A [0.5, 0.5] /* starts
still comment */ component B [0.4, 0.4]
component C [0.3, 0.3]

// footer
`;

  it.each([
    ['moved', (map: WardleyMap) => moveTo(map, 'B', { visibility: 0.33, evolution: 0.44 })],
    ['renamed', (map: WardleyMap) => rename(map, 'B', 'Bee')],
  ])('rewrites only that statement when it is %s', (_case, change) => {
    const { removed, added } = edit(SOURCE, change);
    expect(removed).toEqual(['still comment */ component B [0.4, 0.4]']);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^still comment \*\/ component (B|Bee) \[0\.\d+, 0\.\d+\]$/u);
  });

  it('keeps the end of the comment when the statement is deleted', () => {
    const { patched } = edit(SOURCE, (map) => deleteElement(map, 'B'));
    expect(patched).toBe(SOURCE.replace(' component B [0.4, 0.4]', ''));
  });
});
