import { describe, expect, it } from 'vitest';
import type { WardleyMap } from '@miragon/wardley-schema-model';
import { mapToJSON, parseDSL, parseDSLWithDiagnostics, serializeDSL } from '../src/index.js';
import { generateMapText } from './support/generated-maps.js';

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
