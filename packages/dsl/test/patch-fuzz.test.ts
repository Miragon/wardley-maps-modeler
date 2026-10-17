import { describe, expect, it } from 'vitest';
import type { MapEdge, MapElement, WardleyMap } from '@miragon/wardley-schema-model';
import { parseDSL, serializeDSL } from '../src/index.js';
import { patchDSLWithOutcome, type PatchOutcome } from '../src/patch.js';
import { generateMapText, seededRandom } from './support/generated-maps.js';
import { lineDiff } from './support/map-edits.js';
import { meaningOf } from './support/meaning.js';
import { collectMapFiles, collectMarkdownExamples } from './support/plugin-examples.js';
import {
  collectParserTestFixtures,
  documentationMap,
  vscodeExampleMap,
} from './support/test-fixtures.js';

type Random = () => number;
type Mutation = (map: WardleyMap, random: Random, serial: number) => WardleyMap;

const pick = <T>(random: Random, list: readonly T[]): T | undefined =>
  list.length ? list[Math.floor(random() * list.length)] : undefined;
const nudge = (random: Random, value: number) =>
  Math.min(1, Math.max(0, Math.round((value + (random() - 0.5) * 0.2) * 1000) / 1000));
const NAMED = new Set(['component', 'anchor', 'submap', 'accelerator']);

function replaceElement(map: WardleyMap, target: MapElement, next: MapElement): WardleyMap {
  return { ...map, elements: map.elements.map((el) => (el === target ? next : el)) };
}

/** Edits the way the modeler makes them, on the map the parser read. */
const MUTATIONS: Record<string, Mutation> = {
  move(map, random) {
    const target = pick(random, map.elements);
    if (!target) return map;
    const position = {
      visibility: nudge(random, target.position.visibility),
      evolution: nudge(random, target.position.evolution),
    };
    switch (target.elementType) {
      case 'pipeline': {
        const start = nudge(random, target.evolutionStart);
        return replaceElement(map, target, {
          ...target,
          evolutionStart: Math.min(start, 0.9),
          evolutionEnd: Math.max(Math.min(start, 0.9) + 0.05, target.evolutionEnd),
        });
      }
      case 'annotation':
        return replaceElement(map, target, {
          ...target,
          position,
          positions: [position, ...target.positions.slice(1)],
        });
      case 'drawing':
        return replaceElement(map, target, {
          ...target,
          position,
          points: [position, ...target.points.slice(1)],
        });
      default:
        return replaceElement(map, target, { ...target, position });
    }
  },
  rename(map, random, serial) {
    const target = pick(
      random,
      map.elements.filter((el) => NAMED.has(el.elementType) || el.elementType === 'note'),
    );
    if (!target) return map;
    return replaceElement(map, target, { ...target, label: `${target.label} v${serial}` });
  },
  delete(map, random) {
    const target = pick(random, map.elements);
    if (!target) return map;
    const elements = map.elements
      .filter((el) => el !== target)
      .map((el): MapElement => {
        if (el.elementType === 'component' && el.pipelineId === target.id) {
          const { pipelineId: _detached, ...rest } = el;
          return rest;
        }
        if (el.elementType === 'pipeline') {
          return { ...el, childIds: el.childIds.filter((id) => id !== target.id) };
        }
        return el;
      });
    const edges = map.edges.filter((edge) => edge.from !== target.id && edge.to !== target.id);
    return { ...map, elements, edges };
  },
  addComponent(map, random, serial) {
    const pipeline =
      random() < 0.3
        ? pick(
            random,
            map.elements.filter((el) => el.elementType === 'pipeline'),
          )
        : undefined;
    const added: MapElement = {
      id: `new_${serial}`,
      elementType: 'component',
      label: `Added ${serial}`,
      position: {
        visibility: pipeline ? pipeline.position.visibility : nudge(random, 0.5),
        evolution: nudge(random, 0.5),
      },
      ...(pipeline ? { pipelineId: pipeline.id } : {}),
    };
    return { ...map, elements: [...map.elements, added] };
  },
  reparent(map, random) {
    const child = pick(
      random,
      map.elements.filter((el) => el.elementType === 'component' && el.pipelineId !== undefined),
    );
    const pipeline = pick(
      random,
      map.elements.filter((el) => el.elementType === 'pipeline'),
    );
    if (child?.elementType !== 'component' || pipeline?.elementType !== 'pipeline') return map;
    const elements = map.elements.map((el): MapElement => {
      if (el === child) {
        return {
          ...child,
          pipelineId: pipeline.id,
          position: { ...child.position, visibility: pipeline.position.visibility },
        };
      }
      if (el.elementType !== 'pipeline') return el;
      const childIds = el.childIds.filter((id) => id !== child.id);
      return { ...el, childIds: el === pipeline ? [...childIds, child.id] : childIds };
    });
    return { ...map, elements };
  },
  addLink(map, random, serial) {
    const named = map.elements.filter((el) => NAMED.has(el.elementType));
    const from = pick(random, named);
    const to = pick(random, named);
    if (!from || !to) return map;
    const edge: MapEdge =
      random() < 0.7
        ? { id: `link_${serial}`, edgeType: 'dependency', from: from.id, to: to.id }
        : { id: `link_${serial}`, edgeType: 'flow', from: from.id, to: to.id, flowValue: '5' };
    return { ...map, edges: [...map.edges, edge] };
  },
  deleteLink(map, random) {
    const target = pick(random, map.edges);
    return target ? { ...map, edges: map.edges.filter((edge) => edge !== target) } : map;
  },
  evolve(map, random) {
    const target = pick(
      random,
      map.elements.filter((el) => el.elementType === 'component'),
    );
    if (target?.elementType !== 'component') return map;
    const { movement: _replaced, ...rest } = target;
    const next: MapElement =
      random() < 0.4 && target.movement
        ? rest
        : { ...rest, movement: { targetEvolution: nudge(random, 0.8) } };
    return replaceElement(map, target, next);
  },
  decorate(map, random) {
    const target = pick(
      random,
      map.elements.filter((el) => el.elementType === 'component'),
    );
    if (target?.elementType !== 'component') return map;
    const method = pick(random, ['build', 'buy', 'outsource'] as const);
    return replaceElement(map, target, {
      ...target,
      decorators: { ...target.decorators, inertia: random() < 0.5, ...(method ? { method } : {}) },
    });
  },
  configure(map, random, serial) {
    const config = { ...map.config };
    const choice = random();
    if (choice < 0.3) return { ...map, config: { ...config, title: `Title ${serial}` } };
    if (choice < 0.6) {
      return { ...map, config: { ...config, size: { width: 800 + serial, height: 600 } } };
    }
    if (choice < 0.8) {
      return { ...map, config: { ...config, evolutionLabels: ['A', 'B', 'C', `D${serial}`] } };
    }
    return { ...map, config: { ...config, yAxisLabel: `Value ${serial}` } };
  },
};

const MUTATION_NAMES = Object.keys(MUTATIONS);

function mutate(map: WardleyMap, random: Random, count: number, serial: number): WardleyMap {
  let mutated = map;
  for (let step = 0; step < count; step++) {
    mutated = MUTATIONS[pick(random, MUTATION_NAMES)!]!(mutated, random, serial * 10 + step);
  }
  return mutated;
}

interface Run {
  readonly outcome: PatchOutcome;
  readonly meaningMatches: boolean;
  readonly text: string;
  readonly patched: string;
}

function run(
  text: string,
  random: Random,
  serial: number,
  edits = 1 + Math.floor(random() * 3),
): Run {
  const mutated = mutate(parseDSL(text), random, edits, serial);
  const { text: patched, outcome } = patchDSLWithOutcome(text, mutated);
  return {
    outcome,
    meaningMatches:
      JSON.stringify(meaningOf(patched)) === JSON.stringify(meaningOf(serializeDSL(mutated))),
    text,
    patched,
  };
}

const wellFormedMaps = [
  ...collectMarkdownExamples().map((example) => example.text),
  ...collectMapFiles().map((example) => example.text),
  vscodeExampleMap(),
  documentationMap(),
];

describe('patchDSL under random edits (seeded)', () => {
  it('always means exactly what serializeDSL would write, on corner-case maps', () => {
    const random = seededRandom(7);
    const texts = [
      ...collectParserTestFixtures(),
      ...Array.from({ length: 1500 }, (_, index) => generateMapText(index + 1)),
    ];
    const mismatches = texts
      .map((text, index) => run(text, random, index))
      .filter((result) => !result.meaningMatches);
    expect(mismatches.slice(0, 3)).toEqual([]);
  });

  it('patches well-formed maps in place without falling back to a full rewrite', () => {
    const random = seededRandom(11);
    const results = wellFormedMaps.flatMap((text, mapIndex) =>
      Array.from({ length: 40 }, (_, index) => run(text, random, mapIndex * 100 + index)),
    );
    expect(results.filter((result) => !result.meaningMatches).slice(0, 3)).toEqual([]);
    const fallbacks = results.filter((result) => result.outcome === 'serialized');
    expect(fallbacks.slice(0, 3)).toEqual([]);
    const minimal = results.filter((result) => result.outcome === 'patched').length;
    expect(minimal / results.length).toBeGreaterThan(0.9);
  });

  it('keeps every comment and blank line of a well-formed map through single edits', () => {
    const random = seededRandom(23);
    for (const [mapIndex, text] of wellFormedMaps.entries()) {
      const commented = `// header\n\n${text.replace(/\n(?=component)/, '\n\n// section\n')}`;
      for (let index = 0; index < 20; index++) {
        const result = run(commented, random, mapIndex * 100 + index, 1);
        if (result.outcome !== 'patched') continue;
        const { removed } = lineDiff(commented, result.patched);
        expect(removed.filter((line) => line.trim() === '' || line.startsWith('//'))).toEqual([]);
      }
    }
  });
});
