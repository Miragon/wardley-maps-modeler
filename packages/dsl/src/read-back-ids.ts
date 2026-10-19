import type { WardleyMap } from '@miragon/wardley-schema-model';
import { parseDSLWithSourceMap } from './parser.js';
import { serializeKeyedLines } from './serializer.js';

/** The statement keys of an element line: a top-level element or a pipeline block's child. */
const ELEMENT_KEY = /^(?:element|child):(.*)$/s;

function elementIdOf(key: string): string | undefined {
  return ELEMENT_KEY.exec(key)?.[1];
}

/**
 * The id each element of `map` carries once `serializeDSL(map)` is read back, keyed by its id in
 * `map`. The OWM DSL writes no ids: the parser derives them from names, texts and the order of the
 * lines, so an element created or renamed in an editor has another id in memory than in the
 * document until the text is read again. Elements the text does not write (none today) are
 * missing from the result.
 */
export function readBackIds(map: WardleyMap): Map<string, string> {
  const lines = serializeKeyedLines(map);
  const { sourceMap } = parseDSLWithSourceMap([...lines.map((line) => line.text), ''].join('\n'));
  const readIdByLine = new Map<number, string>();
  for (const [key, line] of sourceMap.primaryLineOf) {
    const id = elementIdOf(key);
    if (id !== undefined) readIdByLine.set(line, id);
  }
  const ids = new Map<string, string>();
  lines.forEach((line, index) => {
    const id = elementIdOf(line.key);
    const readId = readIdByLine.get(index + 1);
    if (id !== undefined && readId !== undefined) ids.set(id, readId);
  });
  return ids;
}
