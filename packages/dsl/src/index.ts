export { parseDSL, parseDSLWithDiagnostics } from './parser.js';
export type { ParseDiagnostic, ParseResult } from './parser.js';
export { serializeDSL } from './serializer.js';
export { mapToJSON, mapFromJSON, loadMap } from './json.js';

// Lexer helpers (for advanced consumers / tests)
export { parseCoords, parseDecorators, parseLabelOffset, slug, keywordOf } from './lexer.js';
export type { ParsedCoords, InlineDecorators, LabelOffsetToken } from './lexer.js';
