import { describe, expect, it } from 'vitest';
import type { WardleyMap } from '@miragon/wardley-schema-model';
import { mapToJSON, parseDSL, parseDSLWithDiagnostics, serializeDSL } from '../src/index.js';

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const HUGE_NUMBER = '9'.repeat(320);

const VOCABULARY = {
  keywords: [
    'title',
    'style',
    'size',
    'evolution',
    'y-axis',
    'annotations',
    'annotation',
    'evolve',
    'line',
    'anchor',
    'component',
    'market',
    'ecosystem',
    'note',
    'pipeline',
    'build',
    'buy',
    'outsource',
    'accelerator',
    'deaccelerator',
    'submap',
    'url',
    'pioneers',
    'settlers',
    'townplanners',
    'Component',
    'Title',
    'TITLE',
    'Note',
    'compnent',
  ],
  names: [
    'A',
    'B',
    'Tea',
    'Hot Water',
    'Kettle',
    "Bob's",
    'Tea (green)',
    'inertia',
    'Component',
    'X 2',
    'Web 2.0',
    'Line Manager',
    'Title Search',
    'Y-axis Tool',
    'URL Shortener',
    "Bob's Shop",
    '}legacy',
    '{tenant} DB',
    'A +> B',
    "A +'",
    'Url',
  ],
  tuples: [
    '[0.5, 0.5]',
    '[0.2, 0.8]',
    '[0.8, 0.2]',
    '[1, 1]',
    '[1.3, 0.5]',
    '[-0.1, 2]',
    '[0.3]',
    '[0.95]',
    '[1]',
    '[0.4.1, 0.5]',
    `[${HUGE_NUMBER}, 0.5]`,
    '[[0.1, 0.2], [0.3, 0.4]]',
    '[[0.38, 0.44]]',
    '[0.1, 0.2, 0.3, 0.4]',
    '[]',
    '[',
    '[0.12345, 0.12346]',
    '[0.9996, 1]',
    '[0, 1]',
  ],
  suffixes: [
    '(market)',
    '(ecosystem)',
    '(buy)',
    '(build, market)',
    'inertia',
    '(color red)',
    '(color #b45309)',
    '(y 0.4)',
    '(y 0.4.1)',
    '(y 1.5)',
    `(y ${HUGE_NUMBER})`,
    'label [5, 5]',
    'label [-40, 5]',
    `label [${HUGE_NUMBER}, 5]`,
    'label [0.4.1, 5]',
    'url(Docs)',
    'url(https://example.org/x)',
    '(closed)',
    '(dashed)',
  ],
  braces: ['{', '}', '{ component A [0.3] }', '{}', '{ component B [0.6]', 'component C [0.7] }'],
  comments: ['//', '// note', '/*', '*/', '/* inline */', "' // it's"],
  operators: [
    '->',
    '+>',
    '+<>',
    '+<',
    "+'5'>",
    "+'http://x'>",
    "+'a//b'>",
    "+'x/*y'>",
    ';',
    '; limited by',
    '; at [0.5, 0.5]',
  ],
  quotes: ["'", '"'],
  numbers: ['0.8', '0.62', '2.0', '99999999999999999999', '1e3', '-1', HUGE_NUMBER],
  misc: [
    '\\n',
    '→',
    'A->B',
    'Shortener',
    'Evolution',
    'Engine',
    'url Docs [https://example.org//a]',
    'url Docs [https://x.org/a->b]',
    'url Docs [https://x.org/*/v1]',
    "+'a//b'",
    "+'x/*y'",
    '0.5125',
    '\r',
    '->->Top',
  ],
} as const;

function generateMapText(seed: number): string {
  const random = seededRandom(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const sometimes = (probability: number, produce: () => string): string =>
    random() < probability ? produce() : '';
  const anyToken: readonly string[] = Object.values(VOCABULARY).flat();
  const words = (...parts: string[]) => parts.filter(Boolean).join(' ');

  const lineShapes: ReadonlyArray<() => string> = [
    () =>
      Array.from({ length: 1 + Math.floor(random() * 6) }, () => pick(anyToken)).join(
        pick([' ', ' ', '', '  ']),
      ),
    () =>
      words(
        pick(VOCABULARY.keywords),
        pick(VOCABULARY.names),
        sometimes(0.85, () => pick(VOCABULARY.tuples)),
        sometimes(0.5, () => pick(VOCABULARY.suffixes)),
        sometimes(0.3, () => pick(VOCABULARY.suffixes)),
        sometimes(0.15, () => pick(VOCABULARY.comments)),
      ),
    () =>
      words(
        pick(VOCABULARY.names),
        pick(VOCABULARY.operators),
        pick(VOCABULARY.names),
        sometimes(0.2, () => pick(VOCABULARY.operators)),
        sometimes(0.2, () => pick(anyToken)),
        sometimes(0.15, () => pick(VOCABULARY.comments)),
      ),
    () =>
      words(
        'evolve',
        pick(VOCABULARY.names) + sometimes(0.2, () => `->${pick(VOCABULARY.names)}`),
        pick(VOCABULARY.numbers),
        sometimes(0.3, () => pick(VOCABULARY.suffixes)),
        sometimes(0.3, () => pick(VOCABULARY.suffixes)),
      ),
    () => pick(VOCABULARY.braces),
    () =>
      words(
        'pipeline',
        pick(VOCABULARY.names),
        sometimes(0.6, () => pick(VOCABULARY.tuples)),
        sometimes(0.3, () => pick(VOCABULARY.suffixes)),
        sometimes(0.3, () => '{'),
      ),
    () =>
      words(
        '  component',
        pick(VOCABULARY.names),
        pick(VOCABULARY.tuples),
        sometimes(0.3, () => pick(VOCABULARY.suffixes)),
        sometimes(0.2, () => '}'),
      ),
  ];
  const lineCount = 1 + Math.floor(random() * 8);
  return Array.from({ length: lineCount }, () => pick(lineShapes)()).join('\n');
}

const MAP_TEXTS = Array.from({ length: 3000 }, (_, index) => generateMapText(index + 1));

function throwsWhileParsing(text: string): boolean {
  try {
    parseDSLWithDiagnostics(text);
    return false;
  } catch {
    return true;
  }
}

function isFixedPoint(firstMap: WardleyMap): boolean {
  const once = serializeDSL(firstMap);
  const secondMap = parseDSL(once);
  return serializeDSL(secondMap) === once && mapToJSON(secondMap) === mapToJSON(firstMap);
}

describe('parser fuzzing (seeded, generated from a token vocabulary)', () => {
  it('never throws', () => {
    expect(MAP_TEXTS.filter(throwsWhileParsing).slice(0, 3)).toEqual([]);
  });

  it('reaches a fixed point after one save (text and model)', () => {
    expect(MAP_TEXTS.filter((text) => !isFixedPoint(parseDSL(text))).slice(0, 3)).toEqual([]);
  });
});
