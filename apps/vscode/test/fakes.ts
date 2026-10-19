import type * as vscode from 'vscode';
import { Disposable, type Range, Uri, type WorkspaceEdit } from './__mocks__/vscode';
import type { HostToWebview, WebviewToHost } from '../src/protocol.js';

/** A TextDocument stand-in with real line semantics (lineCount/lineAt) and a settable text. */
export interface FakeDoc {
  uri: Uri;
  languageId: string;
  getText(): string;
  readonly lineCount: number;
  lineAt(line: number): {
    lineNumber: number;
    text: string;
    firstNonWhitespaceCharacterIndex: number;
  };
  set(text: string): void;
}

export function fakeDocument(path: string, text: string, languageId = 'wardley-owm'): FakeDoc {
  let current = text;
  const lines = () => current.split(/\r\n|\n/);
  return {
    uri: Uri.parse(`file:${path}`),
    languageId,
    getText: () => current,
    get lineCount() {
      return lines().length;
    },
    lineAt: (line: number) => {
      const lineText = lines()[line];
      if (lineText === undefined) throw new Error(`Illegal line ${line}`);
      return {
        lineNumber: line,
        text: lineText,
        firstNonWhitespaceCharacterIndex: lineText.length - lineText.trimStart().length,
      };
    },
    set: (t: string) => (current = t),
  };
}

export function asTextDocument(doc: FakeDoc): vscode.TextDocument {
  return doc as unknown as vscode.TextDocument;
}

/** Applies a range replacement like VS Code: inserted '\n' become the document's line break. */
export function applyRangeEdit(text: string, range: Range, inserted: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r\n|\n/);
  const offsetOf = (position: { line: number; character: number }): number => {
    let offset = 0;
    for (let i = 0; i < position.line; i++) offset += lines[i]!.length + 1;
    return offset + position.character;
  };
  const joined = lines.join('\n');
  const result =
    joined.slice(0, offsetOf(range.start)) + inserted + joined.slice(offsetOf(range.end));
  return result.split('\n').join(eol);
}

export function lastEdit(edit: WorkspaceEdit): { range: Range; text: string } {
  const last = edit.edits[edit.edits.length - 1];
  if (!last) throw new Error('WorkspaceEdit has no edits.');
  return { range: last.range as Range, text: last.text };
}

export interface FakePanel {
  panel: vscode.WebviewPanel;
  /** Everything the host posted, the shell's appearance messages included. */
  posted: HostToWebview[];
  updates: () => string[];
  receive: (msg: WebviewToHost) => Promise<unknown>;
  setActive: (active: boolean) => void;
  dispose: () => void;
}

export function fakeWebviewPanel(): FakePanel {
  const posted: HostToWebview[] = [];
  let onMessage: ((msg: WebviewToHost) => unknown) | undefined;
  let onViewState: (() => void) | undefined;
  let onDispose: (() => void) | undefined;
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
  const viewStateListeners = new Set<(event: { webviewPanel: unknown }) => void>();
  const disposeListeners = new Set<() => void>();
  const panel = {
    webview,
    active: true,
    visible: true,
    onDidChangeViewState: (listener: (event: { webviewPanel: unknown }) => void) => {
      viewStateListeners.add(listener);
      onViewState = () => viewStateListeners.forEach((each) => each({ webviewPanel: panel }));
      return new Disposable(() => viewStateListeners.delete(listener));
    },
    onDidDispose: (listener: () => void) => {
      disposeListeners.add(listener);
      onDispose = () => disposeListeners.forEach((each) => each());
      return new Disposable(() => disposeListeners.delete(listener));
    },
  };
  return {
    panel: panel as unknown as vscode.WebviewPanel,
    posted,
    updates: () =>
      posted
        .filter((m): m is Extract<HostToWebview, { type: 'update' }> => m.type === 'update')
        .map((m) => m.text),
    receive: async (msg: WebviewToHost) => onMessage?.(msg),
    setActive: (active: boolean) => {
      panel.active = active;
      onViewState?.();
    },
    dispose: () => onDispose?.(),
  };
}

export const fakeContext = {
  extensionUri: Uri.parse('file:/ext'),
} as unknown as vscode.ExtensionContext;

export const fakeToken = {} as vscode.CancellationToken;
