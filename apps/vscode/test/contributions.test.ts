import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDSL, patchDSL, serializeDSL } from '@miragon/wardley-dsl';
import { commands, vscodeMock, Uri, ViewColumn, window } from './__mocks__/vscode';
import { WardleyEditorProvider } from '../src/WardleyEditorProvider.js';
import {
  registerEditorCommands,
  SHOW_DIAGRAM_COMMAND,
  SHOW_SOURCE_COMMAND,
} from '../src/commands.js';
import { isWebviewCommand, WEBVIEW_COMMANDS } from '../src/protocol.js';
import { EMPTY_MAP, EXAMPLE_MAP } from '../src/examples.js';
import { asTextDocument, fakeContext, fakeDocument, fakeToken, fakeWebviewPanel } from './fakes.js';

const appRoot = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, appRoot), 'utf8');

interface Manifest {
  activationEvents: string[];
  contributes: {
    commands: Array<{ command: string; title: string }>;
    grammars: Array<{ language: string; scopeName: string; path: string }>;
    menus: Record<string, Array<{ command: string; when?: string }>>;
  };
}
const manifest = JSON.parse(read('package.json')) as Manifest;

beforeEach(() => vscodeMock.reset());

describe('protocol', () => {
  it('recognises exactly the webview commands', () => {
    for (const name of Object.keys(WEBVIEW_COMMANDS)) expect(isWebviewCommand(name)).toBe(true);
    expect(isWebviewCommand('toString')).toBe(false);
    expect(isWebviewCommand('deleteEverything')).toBe(false);
    expect(isWebviewCommand(42)).toBe(false);
  });
});

describe('commands', () => {
  async function openDiagram(path: string) {
    const { provider } = WardleyEditorProvider.register(fakeContext);
    const panel = fakeWebviewPanel();
    const doc = fakeDocument(path, 'title A\n');
    await provider.resolveCustomTextEditor(asTextDocument(doc), panel.panel, fakeToken);
    registerEditorCommands(provider);
    return { provider, panel, doc };
  }

  it('contributes every registered command, and only shows them for maps', async () => {
    await openDiagram('/a.wmap');
    const contributed = manifest.contributes.commands.map((c) => c.command);
    const palette = new Map(manifest.contributes.menus.commandPalette!.map((m) => [m.command, m]));

    for (const id of vscodeMock.registeredCommandIds()) {
      expect(contributed).toContain(id);
      expect(palette.get(id)?.when, id).toMatch(/wardley/);
    }
  });

  it('posts a diagram action to the focused diagram', async () => {
    const { panel } = await openDiagram('/a.wmap');

    await commands.executeCommand(WEBVIEW_COMMANDS.exportPng);

    expect(panel.posted).toContainEqual({ type: 'command', name: 'exportPng' });
  });

  it('tells the user when no diagram is focused', async () => {
    const { panel } = await openDiagram('/a.wmap');
    panel.setActive(false);

    await commands.executeCommand(WEBVIEW_COMMANDS.fitView);

    expect(panel.posted.some((m) => m.type === 'command')).toBe(false);
    expect(vscodeMock.informationMessages()).toHaveLength(1);
  });

  it('opens the text beside the diagram, and the diagram beside the text', async () => {
    const { doc } = await openDiagram('/a.wmap');

    await commands.executeCommand(SHOW_SOURCE_COMMAND);
    window.activeTextEditor = { document: { uri: Uri.parse('file:/b.owm') } };
    await commands.executeCommand(SHOW_DIAGRAM_COMMAND);

    const openWith = vscodeMock.executedCommands().filter((c) => c.command === 'vscode.openWith');
    expect(openWith.map((c) => [String(c.args[0]), c.args[1], c.args[2]])).toEqual([
      [doc.uri.toString(), 'default', ViewColumn.Beside],
      ['file:/b.owm', WardleyEditorProvider.viewType, ViewColumn.Beside],
    ]);
  });
});

describe('the editor title menu (guide §13.5)', () => {
  it('lists Fit, then the exports with PNG first', () => {
    const title = manifest.contributes.menus['editor/title']!.filter(
      (entry) => (entry as { group?: string }).group !== 'navigation',
    );
    expect(title.map((entry) => [entry.command, (entry as { group?: string }).group])).toEqual([
      ['wardley.fitView', '1_wardley@1'],
      ['wardley.exportPng', '2_wardley_export@1'],
      ['wardley.exportSvg', '2_wardley_export@2'],
      ['wardley.exportPngTransparent', '2_wardley_export@3'],
    ]);
  });

  it('titles the commands in Title Case as VS Code does', () => {
    const titles = Object.fromEntries(
      manifest.contributes.commands.map((c) => [c.command, c.title]),
    );
    expect(titles).toMatchObject({
      'wardley.fitView': 'Fit to View',
      'wardley.exportPng': 'Export as PNG',
      'wardley.exportSvg': 'Export as SVG',
      'wardley.showSource': 'Open Source to the Side',
    });
  });

  it('walks through creating a map, opening the source to the side and the basics', () => {
    const walkthrough = (
      manifest.contributes as unknown as {
        walkthroughs: Array<{ steps: Array<{ id: string; completionEvents: string[] }> }>;
      }
    ).walkthroughs[0]!;
    expect(walkthrough.steps.map((step) => step.id)).toEqual(['create', 'source', 'learn']);
    expect(walkthrough.steps[1]!.completionEvents).toEqual(['onCommand:wardley.showSource']);
  });
});

describe('language support', () => {
  const grammar = JSON.parse(read('syntaxes/wardley.tmLanguage.json')) as {
    scopeName: string;
    repository: { keywords: { match: string } };
  };

  it('contributes the grammar and activates for the language', () => {
    expect(manifest.contributes.grammars).toContainEqual({
      language: 'wardley-owm',
      scopeName: grammar.scopeName,
      path: './syntaxes/wardley.tmLanguage.json',
    });
    expect(manifest.activationEvents).toContain('onLanguage:wardley-owm');
  });

  it('highlights every statement keyword the parser reads', () => {
    const parser = readFileSync(
      new URL('../../../packages/dsl/src/parser.ts', import.meta.url),
      'utf8',
    );
    const table = /private readStatement[\s\S]*?switch \(kw\) \{([\s\S]*?)default:/.exec(parser);
    expect(table, 'statement table in parser.ts').not.toBeNull();
    const parserKeywords = [...table![1]!.matchAll(/case '([^']+)':/g)].map((m) => m[1]!);
    const alternation = /\^\\s\*\(([^)]*)\)/.exec(grammar.repository.keywords.match)![1]!;
    const grammarKeywords = alternation.split('|');

    expect(parserKeywords.length).toBeGreaterThan(20);
    expect([...grammarKeywords].sort()).toEqual([...new Set(parserKeywords)].sort());
  });

  it('declares // and /* */ comments for Toggle Comment', () => {
    const config = JSON.parse(read('language-configuration.json')) as {
      comments: { lineComment: string; blockComment: [string, string] };
    };
    expect(config.comments).toEqual({ lineComment: '//', blockComment: ['/*', '*/'] });
  });
});

describe('templates', () => {
  it.each([
    ['example', EXAMPLE_MAP],
    ['empty', EMPTY_MAP],
  ])('the %s map is already in the modeler’s own format', (_name, text) => {
    const map = parseDSL(text);
    expect(serializeDSL(map)).toBe(text);
    expect(patchDSL(text, map)).toBe(text);
  });
});

describe('docs', () => {
  it('no longer promises that exported images reopen as maps', () => {
    for (const file of ['README.md', 'media/walkthrough/learn.md', 'media/walkthrough/create.md']) {
      expect(read(file), file).not.toMatch(/embed/i);
    }
  });
});
