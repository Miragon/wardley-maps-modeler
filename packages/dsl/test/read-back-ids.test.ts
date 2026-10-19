import { describe, expect, it } from 'vitest';
import type { MapElement, WardleyMap } from '@miragon/wardley-schema-model';
import { parseDSL, readBackIds, serializeDSL } from '../src/index.js';
import { generateMapText } from './support/generated-maps.js';
import { collectParserTestFixtures } from './support/test-fixtures.js';

const TEA_SHOP = `title Tea Shop
anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61]
component Kettle [0.43, 0.35]
pipeline Kettle [0.3, 0.65]
note Ask the customer [0.5, 0.2]
annotation 1 [0.4, 0.4] Check the supplier
pioneers [0.6, 0.05, 0.45, 0.25]
line [[0.2, 0.2], [0.3, 0.3]]
Business -> Cup of Tea
Cup of Tea -> Kettle
`;

function withElement(map: WardleyMap, element: MapElement): WardleyMap {
  return { ...map, elements: [...map.elements, element] };
}

function renamed(map: WardleyMap, id: string, label: string): WardleyMap {
  return {
    ...map,
    elements: map.elements.map((element) => (element.id === id ? { ...element, label } : element)),
  };
}

/** What a re-read gives each element, by its id in `map`, matched by line order of a re-read. */
function expectReadBack(map: WardleyMap): void {
  const ids = readBackIds(map);
  const reread = parseDSL(serializeDSL(map));
  const byId = new Map(reread.elements.map((element) => [element.id, element]));
  expect([...ids.values()].sort()).toEqual(reread.elements.map((element) => element.id).sort());
  for (const element of map.elements) {
    const read = byId.get(ids.get(element.id) ?? '');
    expect(read?.elementType, element.id).toBe(element.elementType);
    if (element.elementType !== 'drawing') expect(read?.label, element.id).toBe(element.label);
  }
}

describe('readBackIds', () => {
  it('maps every element of a parsed map to itself', () => {
    const map = parseDSL(TEA_SHOP);
    const ids = readBackIds(map);
    expect(map.elements.length).toBeGreaterThan(6);
    for (const element of map.elements) expect(ids.get(element.id)).toBe(element.id);
  });

  it('gives an element created in memory the id the document gives it', () => {
    const map = parseDSL(TEA_SHOP);
    const created = withElement(map, {
      id: 'shape_42',
      elementType: 'component',
      label: 'Hot Water',
      position: { visibility: 0.5, evolution: 0.5 },
    });
    expect(readBackIds(created).get('shape_42')).toBe('cmp_hot_water');
  });

  it('gives a renamed element the id of its new name', () => {
    const map = renamed(parseDSL(TEA_SHOP), 'cmp_cup_of_tea', 'Pot of Tea');
    expect(readBackIds(map).get('cmp_cup_of_tea')).toBe('cmp_pot_of_tea');
  });

  it('follows pipeline children into their block', () => {
    const map = parseDSL(`title Blocks
component Kettle [0.43, 0.35]
pipeline Kettle {
  component Electric [0.6]
  component Gas [0.4]
}
`);
    const ids = readBackIds(map);
    for (const element of map.elements) expect(ids.get(element.id)).toBe(element.id);
    expect(map.elements.some((element) => element.id === 'cmp_electric')).toBe(true);
  });

  it('agrees with a re-read for the parser fixtures and generated maps', () => {
    const texts = [
      ...collectParserTestFixtures(),
      ...Array.from({ length: 40 }, (_, seed) => generateMapText(seed)),
    ];
    for (const text of texts) expectReadBack(parseDSL(text));
  });
});
