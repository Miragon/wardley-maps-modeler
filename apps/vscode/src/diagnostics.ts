import * as vscode from 'vscode';
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';

export const WARDLEY_LANGUAGE_ID = 'wardley-owm';
const REFRESH_DELAY_MS = 200;

/** Read-only copies (Git diffs, history) would list every problem a second time. */
const IGNORED_SCHEMES: ReadonlySet<string> = new Set(['git', 'gitlens', 'vscode-scm']);

/** Whether `document` is a Wardley map worth checking (`.wmap`/`.owm` get the language id). */
export function isWardleyDocument(document: vscode.TextDocument): boolean {
  return document.languageId === WARDLEY_LANGUAGE_ID && !IGNORED_SCHEMES.has(document.uri.scheme);
}

/**
 * The parser is lenient: a typo or a dangling link drops the statement instead of failing the
 * whole map. Its findings become warnings, so the text editor shows squiggles and the Problems view
 * lists them even when only the diagram is open.
 */
export function wardleyDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
  const { diagnostics } = parseDSLWithDiagnostics(document.getText());
  const lastLine = Math.max(document.lineCount - 1, 0);
  return diagnostics.map((finding) => {
    const line = document.lineAt(Math.min(Math.max(finding.line - 1, 0), lastLine));
    const range = new vscode.Range(
      line.lineNumber,
      line.firstNonWhitespaceCharacterIndex,
      line.lineNumber,
      line.text.length,
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      finding.message,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = 'wardley';
    return diagnostic;
  });
}

/** Keeps the 'wardley' DiagnosticCollection in step with open map documents. */
export class WardleyDiagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly changeEmitter = new vscode.EventEmitter<{ uri: vscode.Uri; count: number }>();
  private readonly subscriptions: vscode.Disposable[] = [];

  /** Fires after a document's problems were recomputed. */
  readonly onDidChange = this.changeEmitter.event;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('wardley');
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.refresh(document)),
      vscode.workspace.onDidChangeTextDocument((event) => this.scheduleRefresh(event.document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.clear(document.uri)),
    );
    for (const document of vscode.workspace.textDocuments) this.refresh(document);
  }

  refresh(document: vscode.TextDocument): void {
    if (!isWardleyDocument(document)) return;
    this.cancelPending(document.uri);
    const diagnostics = wardleyDiagnostics(document);
    this.collection.set(document.uri, diagnostics);
    this.changeEmitter.fire({ uri: document.uri, count: diagnostics.length });
  }

  /** Typing fires a change per keystroke; parse once the user pauses. */
  scheduleRefresh(document: vscode.TextDocument): void {
    if (!isWardleyDocument(document)) return;
    this.cancelPending(document.uri);
    this.pending.set(
      document.uri.toString(),
      setTimeout(() => this.refresh(document), REFRESH_DELAY_MS),
    );
  }

  count(uri: vscode.Uri): number {
    return this.collection.get(uri)?.length ?? 0;
  }

  clear(uri: vscode.Uri): void {
    this.cancelPending(uri);
    this.collection.delete(uri);
  }

  dispose(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    for (const subscription of this.subscriptions) subscription.dispose();
    this.changeEmitter.dispose();
    this.collection.dispose();
  }

  private cancelPending(uri: vscode.Uri): void {
    const key = uri.toString();
    const timer = this.pending.get(key);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.pending.delete(key);
  }
}
