export const EMPTY_MAP = 'title New map\n';

/**
 * Tea shop example. Kept in the modeler's own statement order and number format, so the first
 * canvas edit changes only the lines it touches (unit tests here and in packages/dsl guard this).
 */
export const EXAMPLE_MAP = `title Tea Shop
anchor Business [0.95, 0.63]
anchor Public [0.95, 0.78]
component Cup of Tea [0.79, 0.61]
component Cup [0.73, 0.78]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.8]
component Water [0.38, 0.82]
component Kettle [0.43, 0.35]
component Power [0.1, 0.71] (outsource)
pipeline Kettle [0.3, 0.65]
evolve Kettle 0.62
Business -> Cup of Tea
Public -> Cup of Tea
Cup of Tea -> Cup
Cup of Tea -> Tea
Cup of Tea -> Hot Water
Hot Water -> Water
Hot Water -> Kettle
Kettle -> Power
`;

/** The example without its title: a document keeps its own (guide §13.5). */
const EXAMPLE_CONTENT = EXAMPLE_MAP.replace(/^title [^\n]*\n/, '');

/**
 * The document with the example's elements and links appended, for "Insert example" on an empty
 * map. What the file already holds (its title, comments, size or axis lines) stays, so the
 * insertion needs no confirmation and the map keeps one title line; the line break style follows
 * the document.
 */
export function withExampleInserted(documentText: string): string {
  const lineBreak = documentText.includes('\r\n') ? '\r\n' : '\n';
  const content = EXAMPLE_CONTENT.replace(/\n/g, lineBreak);
  if (documentText.trim() === '') return `${documentText}${content}`;
  const terminated = /\r?\n$/.test(documentText) ? documentText : `${documentText}${lineBreak}`;
  return `${terminated}${content}`;
}
