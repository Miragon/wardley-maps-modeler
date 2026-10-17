import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { type WorkspaceEdit, workspace, vscodeMock } from './__mocks__/vscode';
import { WardleyEditorProvider } from '../src/WardleyEditorProvider.js';
import {
  applyRangeEdit,
  asTextDocument,
  fakeContext,
  fakeDocument,
  fakeToken,
  fakeWebviewPanel,
  lastEdit,
  type FakeDoc,
} from './fakes.js';

/**
 * Characterization of the text-editor host's echo protection: graphical edits the webview produces
 * come back as `onDidChangeTextDocument` and MUST be swallowed (not re-imported), while genuinely
 * external edits MUST reach the webview exactly once. Verified black-box via posted messages, since
 * the `suppressEcho` set is a private closure.
 */

function newProvider(): WardleyEditorProvider {
  return WardleyEditorProvider.register(fakeContext).provider;
}

/** Install a realistic `applyEdit`: apply the range replacement and fire the echo change. */
function installEchoingApplyEdit(doc: FakeDoc): void {
  workspace.applyEdit = (edit: WorkspaceEdit) => {
    const { range, text } = lastEdit(edit);
    doc.set(applyRangeEdit(doc.getText(), range, text));
    vscodeMock.fireDidChangeTextDocument(doc);
    return Promise.resolve(true);
  };
}

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  workspace.applyEdit = (_edit: WorkspaceEdit) => Promise.resolve(true);
  vi.restoreAllMocks();
});

describe('WardleyEditorProvider — echo protection', () => {
  it('posts init with the document text on `ready`', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    await h.receive({ type: 'ready' });

    expect(h.posted).toContainEqual({ type: 'init', text: 'title A\n' });
  });

  it('swallows the echo of the webview‑s own edit (no `update` posted back)', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    installEchoingApplyEdit(doc);
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    await h.receive({ type: 'edit', text: 'title B\n' });

    expect(doc.getText()).toBe('title B\n');
    expect(h.updates()).toEqual([]);
  });

  it('suppresses BOTH echoes for two edits in quick succession', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    installEchoingApplyEdit(doc);
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    await h.receive({ type: 'edit', text: 'title B\n' });
    await h.receive({ type: 'edit', text: 'title C\n' });

    expect(h.updates()).toEqual([]);
  });

  it('swallows the echo in a CRLF document, whose line breaks VS Code keeps', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\r\ncomponent X [0.5, 0.5]\r\n');
    installEchoingApplyEdit(doc);
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    await h.receive({ type: 'edit', text: 'title A\ncomponent X [0.6, 0.5]\n' });

    expect(doc.getText()).toBe('title A\r\ncomponent X [0.6, 0.5]\r\n');
    expect(h.updates()).toEqual([]);
  });

  it('forwards a genuinely external change as exactly one `update`', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    doc.set('title EXTERNAL\n');
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.updates()).toEqual(['title EXTERNAL\n']);
  });

  it('does not applyEdit for a no-op edit (text equals current document)', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    const applyEdit = vi.fn((_edit: WorkspaceEdit) => Promise.resolve(true));
    workspace.applyEdit = applyEdit;
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    await h.receive({ type: 'edit', text: 'title A\n' });

    expect(applyEdit).not.toHaveBeenCalled();
  });

  it('does NOT suppress when applyEdit fails (write rejected -> echo still forwarded)', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    workspace.applyEdit = (_edit: WorkspaceEdit) => Promise.resolve(false); // e.g. read-only file
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    await h.receive({ type: 'edit', text: 'title B\n' });
    // The canvas shows B but the document kept A: the webview is resynced to the document.
    expect(h.updates()).toEqual(['title A\n']);
    // The write failed, so the entry was removed; a later change carrying that text is NOT an echo.
    doc.set('title B\n');
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.updates()).toEqual(['title A\n', 'title B\n']);
  });

  it('resyncs the webview when applyEdit rejects, and keeps writing later edits', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    let reject = true;
    workspace.applyEdit = (edit: WorkspaceEdit) => {
      if (reject) return Promise.reject(new Error('model changed in the meantime'));
      const { range, text } = lastEdit(edit);
      doc.set(applyRangeEdit(doc.getText(), range, text));
      vscodeMock.fireDidChangeTextDocument(doc);
      return Promise.resolve(true);
    };
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    await h.receive({ type: 'edit', text: 'title B\n' });
    reject = false;
    await h.receive({ type: 'edit', text: 'title C\n' });

    expect(doc.getText()).toBe('title C\n');
    expect(h.updates()).toEqual(['title A\n']);
  });
});

describe('WardleyEditorProvider — edits in quick succession', () => {
  it('diffs each edit against the document the previous edit produced', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\ncomponent X [0.5, 0.5]\n');
    // Like VS Code: the document changes only once the write has gone through the main thread.
    const writes: Array<() => void> = [];
    workspace.applyEdit = (edit: WorkspaceEdit) =>
      new Promise<boolean>((resolve) => {
        writes.push(() => {
          const { range, text } = lastEdit(edit);
          doc.set(applyRangeEdit(doc.getText(), range, text));
          vscodeMock.fireDidChangeTextDocument(doc);
          resolve(true);
        });
      });
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    const added = 'title A\ncomponent Y [0.4, 0.4]\ncomponent X [0.5, 0.5]\n';
    const moved = 'title A\ncomponent Y [0.4, 0.4]\ncomponent X [0.6, 0.5]\n';
    const nudged = 'title A\ncomponent Y [0.4, 0.4]\ncomponent X [0.7, 0.5]\n';
    const first = h.receive({ type: 'edit', text: added });
    const second = h.receive({ type: 'edit', text: moved });
    const third = h.receive({ type: 'edit', text: nudged });
    const settled = Promise.all([first, second, third]);
    let done = false;
    void settled.then(() => (done = true));
    while (!done) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      writes.shift()?.();
    }

    expect(doc.getText()).toBe(nudged);
    expect(h.updates()).toEqual([]);
  });
});

describe('WardleyEditorProvider — minimal write-back', () => {
  const MAP = [
    'title Tea Shop',
    '// users',
    'anchor Business [0.95, 0.63]',
    '',
    'component Cup [0.73, 0.78]',
    'component Tea [0.63, 0.81]',
    'Business -> Cup',
    '',
  ].join('\n');

  it('replaces only the changed line, so a side-by-side cursor elsewhere stays put', async () => {
    const doc = fakeDocument('/a.wmap', MAP);
    const applyEdit = vi.fn((edit: WorkspaceEdit) => {
      const { range, text } = lastEdit(edit);
      doc.set(applyRangeEdit(doc.getText(), range, text));
      return Promise.resolve(true);
    });
    workspace.applyEdit = applyEdit;
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);

    const moved = MAP.replace('component Tea [0.63, 0.81]', 'component Tea [0.64, 0.81]');
    await h.receive({ type: 'edit', text: moved });

    expect(applyEdit).toHaveBeenCalledTimes(1);
    const { range, text } = lastEdit(applyEdit.mock.calls[0]![0]);
    expect(range.start).toEqual({ line: 5, character: 0 });
    expect(range.end).toEqual({ line: 6, character: 0 });
    expect(text).toBe('component Tea [0.64, 0.81]\n');
    expect(doc.getText()).toBe(moved);
  });
});
