import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { DiagnosticSeverity, vscodeMock, workspace } from './__mocks__/vscode';
import { WardleyDiagnostics, wardleyDiagnostics } from '../src/diagnostics.js';
import { WardleyEditorProvider } from '../src/WardleyEditorProvider.js';
import { asTextDocument, fakeContext, fakeDocument, fakeToken, fakeWebviewPanel } from './fakes.js';

const VALID = 'title Tea\ncomponent Water [0.4, 0.8]\ncomponent Tea [0.6, 0.7]\nTea -> Water\n';
const TYPO = VALID.replace('component Water', 'compnent Water');

function collection() {
  const all = vscodeMock.diagnosticCollections();
  const last = all[all.length - 1];
  if (!last) throw new Error('No diagnostic collection created.');
  return last;
}

beforeEach(() => {
  vscodeMock.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('wardleyDiagnostics', () => {
  it('reports a typo as a warning on its own line', () => {
    const doc = fakeDocument('/a.wmap', TYPO);
    const diagnostics = wardleyDiagnostics(asTextDocument(doc));

    const typo = diagnostics.find((d) => d.message.includes('compnent'));
    expect(typo).toBeDefined();
    expect(typo!.severity).toBe(DiagnosticSeverity.Warning);
    expect(typo!.source).toBe('wardley');
    expect(typo!.range.start).toEqual({ line: 1, character: 0 });
    expect(typo!.range.end).toEqual({ line: 1, character: 'compnent Water [0.4, 0.8]'.length });
  });

  it('reports nothing for a valid map', () => {
    expect(wardleyDiagnostics(asTextDocument(fakeDocument('/a.wmap', VALID)))).toEqual([]);
  });
});

describe('WardleyDiagnostics', () => {
  it("creates the 'wardley' collection and checks already open maps", () => {
    workspace.textDocuments = [fakeDocument('/open.wmap', TYPO)];
    const diagnostics = new WardleyDiagnostics();

    expect(collection().name).toBe('wardley');
    expect(diagnostics.count(asTextDocument(fakeDocument('/open.wmap', '')).uri)).toBeGreaterThan(
      0,
    );
  });

  it('refreshes on open, debounces changes and clears on close', () => {
    const diagnostics = new WardleyDiagnostics();
    const doc = fakeDocument('/a.wmap', TYPO);

    vscodeMock.fireDidOpenTextDocument(doc);
    expect(diagnostics.count(asTextDocument(doc).uri)).toBeGreaterThan(0);

    doc.set(VALID);
    vscodeMock.fireDidChangeTextDocument(doc);
    expect(diagnostics.count(asTextDocument(doc).uri)).toBeGreaterThan(0); // not yet: debounced
    vi.advanceTimersByTime(250);
    expect(diagnostics.count(asTextDocument(doc).uri)).toBe(0);

    doc.set(TYPO);
    vscodeMock.fireDidChangeTextDocument(doc);
    vi.advanceTimersByTime(250);
    expect(diagnostics.count(asTextDocument(doc).uri)).toBeGreaterThan(0);

    vscodeMock.fireDidCloseTextDocument(doc);
    expect(collection().get(doc.uri)).toBeUndefined();
  });

  it('ignores other languages', () => {
    const diagnostics = new WardleyDiagnostics();
    const doc = fakeDocument('/notes.md', 'compnent X', 'markdown');

    vscodeMock.fireDidOpenTextDocument(doc);

    expect(diagnostics.count(asTextDocument(doc).uri)).toBe(0);
    expect(collection().get(doc.uri)).toBeUndefined();
  });

  it('checks the document when the diagram editor opens and tells the webview the count', async () => {
    const diagnostics = new WardleyDiagnostics();
    const { provider } = WardleyEditorProvider.register(fakeContext, diagnostics);
    const doc = fakeDocument('/a.wmap', TYPO);
    const panel = fakeWebviewPanel();

    await provider.resolveCustomTextEditor(asTextDocument(doc), panel.panel, fakeToken);
    expect(diagnostics.count(asTextDocument(doc).uri)).toBeGreaterThan(0);

    await panel.receive({ type: 'ready' });
    const counts = panel.posted.filter((m) => m.type === 'diagnostics');
    expect(counts[counts.length - 1]).toEqual({
      type: 'diagnostics',
      count: diagnostics.count(asTextDocument(doc).uri),
    });
  });

  it('opens the Problems view when the webview asks for it', async () => {
    const { provider } = WardleyEditorProvider.register(fakeContext, new WardleyDiagnostics());
    const panel = fakeWebviewPanel();
    await provider.resolveCustomTextEditor(
      asTextDocument(fakeDocument('/a.wmap', VALID)),
      panel.panel,
      fakeToken,
    );

    await panel.receive({ type: 'showProblems' });

    expect(vscodeMock.executedCommands().map((c) => c.command)).toContain(
      'workbench.actions.view.problems',
    );
  });
});
