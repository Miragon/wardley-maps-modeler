import { describe, expect, it } from 'vitest';
import { parseDSL, patchDSL } from '../src/index.js';
import { generateMapText } from './support/generated-maps.js';
import { collectMapFiles, collectMarkdownExamples } from './support/plugin-examples.js';
import {
  collectParserTestFixtures,
  documentationMap,
  vscodeExampleMap,
} from './support/test-fixtures.js';

/**
 * An unedited map must write back as exactly the text it was read from — whatever its order,
 * comments, number formatting or line breaks.
 */
function expectUnchanged(text: string): void {
  expect(patchDSL(text, parseDSL(text))).toBe(text);
}

const parserFixtures = collectParserTestFixtures();
const pluginExamples = [...collectMarkdownExamples(), ...collectMapFiles()];

describe('patchDSL without edits returns the source text verbatim', () => {
  it('finds the fixtures (guards against a silently empty suite)', () => {
    expect(parserFixtures.length).toBeGreaterThan(50);
    expect(pluginExamples.length).toBeGreaterThan(5);
  });

  it.each(parserFixtures.map((text, index) => ({ index, text })))(
    'parser test fixture #$index',
    ({ text }) => expectUnchanged(text),
  );

  it.each(pluginExamples)('plugin example $name', ({ text }) => expectUnchanged(text));

  it('the VS Code example map', () => expectUnchanged(vscodeExampleMap()));

  it('the documentation map', () => expectUnchanged(documentationMap()));

  it('every fixture with CRLF line breaks and without a final line break', () => {
    for (const text of [...parserFixtures, vscodeExampleMap()]) {
      const crlf = text.replace(/\r?\n/g, '\r\n');
      expectUnchanged(crlf);
      expectUnchanged(crlf.replace(/(\r\n)+$/, ''));
      expectUnchanged(`${text.replace(/\n+$/, '')}\n`);
    }
  });

  it('3000 generated maps full of corner cases', () => {
    const changed = Array.from({ length: 3000 }, (_, index) => generateMapText(index + 1)).filter(
      (text) => patchDSL(text, parseDSL(text)) !== text,
    );
    expect(changed.slice(0, 3)).toEqual([]);
  });
});
