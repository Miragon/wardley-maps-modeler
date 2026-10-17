import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', "'": "'", '"': '"', '`': '`' };

function unescape(body: string): string {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|[\s\S])/g, (_, escape: string) => {
    if (escape.startsWith('u{')) return String.fromCodePoint(parseInt(escape.slice(2, -1), 16));
    if (escape.length === 5 && escape.startsWith('u')) {
      return String.fromCharCode(parseInt(escape.slice(1), 16));
    }
    return ESCAPES[escape] ?? escape;
  });
}

const STATEMENT_START_RE =
  /^\s*(title|component|anchor|note|pipeline|evolve|style|size|evolution|y-axis|annotation|annotations|line|pioneers|settlers|townplanners|url|build|buy|outsource|market|ecosystem|accelerator|deaccelerator|submap|\/\/|\/\*)/i;

/**
 * The map texts the parser tests feed in: every template literal without interpolation and every
 * quoted string with a line break that starts like a DSL statement.
 */
export function collectParserTestFixtures(): string[] {
  const testFile = fileURLToPath(new URL('../dsl.test.ts', import.meta.url));
  const source = readFileSync(testFile, 'utf8');
  const fixtures = new Set<string>();
  for (const match of source.matchAll(/`((?:[^`\\$]|\\[\s\S]|\$(?!\{))*)`/g)) {
    const text = unescape(match[1]!);
    if (STATEMENT_START_RE.test(text)) fixtures.add(text);
  }
  for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*\\n(?:[^'\\\n]|\\.)*)'/g)) {
    const text = unescape(match[1]!);
    if (STATEMENT_START_RE.test(text)) fixtures.add(text);
  }
  return [...fixtures];
}

/** The example map the VS Code extension offers for a new file. */
export function vscodeExampleMap(): string {
  const extensionFile = fileURLToPath(
    new URL('../../../../apps/vscode/src/extension.ts', import.meta.url),
  );
  const match = /const EXAMPLE_MAP = `([^`]*)`/.exec(readFileSync(extensionFile, 'utf8'));
  if (!match) throw new Error('EXAMPLE_MAP not found in apps/vscode/src/extension.ts');
  return unescape(match[1]!);
}

/** The repository's own documentation map. */
export function documentationMap(): string {
  return readFileSync(
    fileURLToPath(new URL('../../../../docs/tool-landscape.wmap', import.meta.url)),
    'utf8',
  );
}
