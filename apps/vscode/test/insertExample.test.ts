import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';
import { type WorkspaceEdit, workspace, vscodeMock } from './__mocks__/vscode';
import { WardleyEditorProvider } from '../src/WardleyEditorProvider.js';
import { EMPTY_MAP, EXAMPLE_MAP, withExampleInserted } from '../src/examples.js';
import {
  applyRangeEdit,
  asTextDocument,
  fakeContext,
  fakeDocument,
  fakeToken,
  fakeWebviewPanel,
  lastEdit,
} from './fakes.js';

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  workspace.applyEdit = (_edit: WorkspaceEdit) => Promise.resolve(true);
});

describe('withExampleInserted', () => {
  it('keeps the title of a new map, so the map has one title line (guide §13.5)', () => {
    const text = withExampleInserted(EMPTY_MAP);
    expect(text.match(/^title /gm)).toEqual(['title ']);
    expect(text.startsWith(EMPTY_MAP)).toBe(true);
    const { map, diagnostics } = parseDSLWithDiagnostics(text);
    expect(diagnostics).toEqual([]);
    expect(map.config.title).toBe('New map');
    expect(map.elements.length).toBe(parseDSLWithDiagnostics(EXAMPLE_MAP).map.elements.length);
  });

  it('keeps comments, other config lines and the line break style', () => {
    const document = 'title Strategy\r\n// draft\r\nsize [1440, 900]';
    const text = withExampleInserted(document);
    expect(text.startsWith('title Strategy\r\n// draft\r\nsize [1440, 900]\r\nanchor')).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/);
  });

  it('fills a blank document with the elements only', () => {
    expect(withExampleInserted('')).toBe(EXAMPLE_MAP.replace(/^title [^\n]*\n/, ''));
  });
});

describe('Insert example from the empty-file hint', () => {
  it('writes the example as ONE edit and sends it back as an update to import', async () => {
    const doc = fakeDocument('/a.wmap', EMPTY_MAP);
    const edits: WorkspaceEdit[] = [];
    workspace.applyEdit = (edit: WorkspaceEdit) => {
      edits.push(edit);
      const { range, text } = lastEdit(edit);
      doc.set(applyRangeEdit(doc.getText(), range, text));
      vscodeMock.fireDidChangeTextDocument(doc);
      return Promise.resolve(true);
    };
    const { provider } = WardleyEditorProvider.register(fakeContext);
    const panel = fakeWebviewPanel();
    await provider.resolveCustomTextEditor(asTextDocument(doc), panel.panel, fakeToken);

    await panel.receive({ type: 'insertExample' });

    expect(edits).toHaveLength(1);
    expect(doc.getText()).toBe(withExampleInserted(EMPTY_MAP));
    expect(panel.updates()).toEqual([doc.getText()]);
  });
});
