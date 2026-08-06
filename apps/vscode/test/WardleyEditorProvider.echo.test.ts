import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type * as vscode from 'vscode';
import { Uri, type WorkspaceEdit, workspace, vscodeMock, Disposable } from './__mocks__/vscode';
import { WardleyEditorProvider } from '../src/WardleyEditorProvider.js';
import type { HostToWebview, WebviewToHost } from '../src/protocol.js';

/**
 * Characterization of the text-editor host's echo protection: graphical edits the webview produces
 * come back as `onDidChangeTextDocument` and MUST be swallowed (not re-imported), while genuinely
 * external edits MUST reach the webview exactly once. Verified black-box via posted messages, since
 * the `suppressEcho` set is a private closure.
 */

interface FakeDoc {
  uri: Uri;
  getText(): string;
  positionAt(offset: number): number;
  set(text: string): void;
}

function fakeDocument(path: string, text: string): FakeDoc {
  let current = text;
  return {
    uri: Uri.parse(`file:${path}`),
    getText: () => current,
    positionAt: (offset: number) => offset,
    set: (t: string) => (current = t),
  };
}

function fakeWebviewPanel(): {
  panel: vscode.WebviewPanel;
  posted: HostToWebview[];
  updates: () => string[];
  receive: (msg: WebviewToHost) => Promise<unknown>;
} {
  const posted: HostToWebview[] = [];
  let onMessage: ((msg: WebviewToHost) => unknown) | undefined;
  const webview = {
    options: {},
    html: '',
    cspSource: 'vscode-webview://unit',
    asWebviewUri: (u: Uri) => u,
    postMessage: (msg: HostToWebview) => {
      posted.push(msg);
      return Promise.resolve(true);
    },
    onDidReceiveMessage: (listener: (msg: WebviewToHost) => unknown) => {
      onMessage = listener;
      return new Disposable(() => {});
    },
  };
  const panel = {
    webview,
    onDidDispose: () => new Disposable(() => {}),
  };
  return {
    panel: panel as unknown as vscode.WebviewPanel,
    posted,
    updates: () =>
      posted
        .filter((m): m is Extract<HostToWebview, { type: 'update' }> => m.type === 'update')
        .map((m) => m.text),
    receive: async (msg: WebviewToHost) => onMessage?.(msg),
  };
}

const context = { extensionUri: Uri.parse('file:/ext') } as unknown as vscode.ExtensionContext;
const token = {} as vscode.CancellationToken;

function newProvider(): WardleyEditorProvider {
  WardleyEditorProvider.register(context);
  return vscodeMock.lastRegisteredProvider<WardleyEditorProvider>();
}

/** Install a realistic `applyEdit`: write the replacement into the doc and fire the echo change. */
function installEchoingApplyEdit(doc: FakeDoc): void {
  workspace.applyEdit = (edit: WorkspaceEdit) => {
    const last = edit.edits[edit.edits.length - 1];
    doc.set(String(last?.text ?? ''));
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
    await newProvider().resolveCustomTextEditor(
      doc as unknown as vscode.TextDocument,
      h.panel,
      token,
    );

    await h.receive({ type: 'ready' });

    expect(h.posted).toContainEqual({ type: 'init', text: 'title A\n' });
  });

  it('swallows the echo of the webview‑s own edit (no `update` posted back)', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    installEchoingApplyEdit(doc);
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(
      doc as unknown as vscode.TextDocument,
      h.panel,
      token,
    );

    await h.receive({ type: 'edit', text: 'title B\n' });

    expect(h.updates()).toEqual([]);
  });

  it('suppresses BOTH echoes for two edits in quick succession', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    installEchoingApplyEdit(doc);
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(
      doc as unknown as vscode.TextDocument,
      h.panel,
      token,
    );

    await h.receive({ type: 'edit', text: 'title B\n' });
    await h.receive({ type: 'edit', text: 'title C\n' });

    expect(h.updates()).toEqual([]);
  });

  it('forwards a genuinely external change as exactly one `update`', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(
      doc as unknown as vscode.TextDocument,
      h.panel,
      token,
    );

    doc.set('title EXTERNAL\n');
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.updates()).toEqual(['title EXTERNAL\n']);
  });

  it('does not applyEdit for a no-op edit (text equals current document)', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    const applyEdit = vi.fn((_edit: WorkspaceEdit) => Promise.resolve(true));
    workspace.applyEdit = applyEdit;
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(
      doc as unknown as vscode.TextDocument,
      h.panel,
      token,
    );

    await h.receive({ type: 'edit', text: 'title A\n' });

    expect(applyEdit).not.toHaveBeenCalled();
  });

  it('does NOT suppress when applyEdit fails (write rejected -> echo still forwarded)', async () => {
    const doc = fakeDocument('/a.wmap', 'title A\n');
    workspace.applyEdit = (_edit: WorkspaceEdit) => Promise.resolve(false); // e.g. read-only file
    const h = fakeWebviewPanel();
    await newProvider().resolveCustomTextEditor(
      doc as unknown as vscode.TextDocument,
      h.panel,
      token,
    );

    await h.receive({ type: 'edit', text: 'title B\n' });
    // The write failed, so the entry was removed; a later change carrying that text is NOT an echo.
    doc.set('title B\n');
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.updates()).toEqual(['title B\n']);
  });
});
