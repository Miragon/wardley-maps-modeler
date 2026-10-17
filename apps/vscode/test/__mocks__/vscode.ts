/**
 * Thin in-repo mock of the ambient `vscode` module. Vitest aliases `vscode` to this file (see
 * vitest.config.ts) so the extension-host + protocol logic can be unit-tested in Node without
 * launching VS Code. Only the API surface the host actually uses is implemented.
 *
 * The extension source stays typed against the real `@types/vscode`; tests drive behaviour through
 * the exported `vscodeMock` control surface (which is NOT part of the real API) and the concrete
 * classes below. Because vitest resolves both `'vscode'` (aliased) and a relative import of this
 * file to the same module id, a listener the host registers and an event a test fires share state.
 */

export class Disposable {
  constructor(private readonly _dispose: () => void) {}
  dispose(): void {
    this._dispose();
  }
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(e: T) => void>();
  readonly event = (listener: (e: T) => void): Disposable => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };
  fire(data: T): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class CancellationError extends Error {
  constructor() {
    super('Canceled');
    this.name = 'CancellationError';
  }
}

/** Minimal cancellation source: tests pass `.token` to a provider and call `cancel()` to trip it. */
export class CancellationTokenSource {
  private readonly emitter = new EventEmitter<void>();
  readonly token = {
    isCancellationRequested: false,
    onCancellationRequested: (listener: () => void): Disposable => this.emitter.event(listener),
  };
  get isCancellationRequested(): boolean {
    return this.token.isCancellationRequested;
  }
  cancel(): void {
    this.token.isCancellationRequested = true;
    this.emitter.fire();
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

/** Supports both real constructors: `(start, end)` and `(startLine, startChar, endLine, endChar)`. */
export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(
    startOrLine: Position | number,
    endOrCharacter: Position | number,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (typeof startOrLine === 'number') {
      this.start = new Position(startOrLine, endOrCharacter as number);
      this.end = new Position(endLine ?? startOrLine, endCharacter ?? (endOrCharacter as number));
    } else {
      this.start = startOrLine;
      this.end = endOrCharacter as Position;
    }
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  source?: string;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
}

/** In-memory DiagnosticCollection keyed by `uri.toString()`. */
export class MockDiagnosticCollection {
  readonly entries = new Map<string, readonly Diagnostic[]>();
  disposed = false;
  constructor(readonly name: string) {}
  set(uri: { toString(): string }, diagnostics: readonly Diagnostic[]): void {
    this.entries.set(uri.toString(), diagnostics);
  }
  get(uri: { toString(): string }): readonly Diagnostic[] | undefined {
    return this.entries.get(uri.toString());
  }
  delete(uri: { toString(): string }): void {
    this.entries.delete(uri.toString());
  }
  dispose(): void {
    this.disposed = true;
    this.entries.clear();
  }
}

export class WorkspaceEdit {
  readonly edits: Array<{ uri: unknown; range: unknown; text: string }> = [];
  replace(uri: unknown, range: unknown, text: string): void {
    this.edits.push({ uri, range, text });
  }
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}
  get fsPath(): string {
    return this.path;
  }
  static parse(value: string): Uri {
    const idx = value.indexOf(':');
    return idx >= 0 ? new Uri(value.slice(0, idx), value.slice(idx + 1)) : new Uri('file', value);
  }
  static file(path: string): Uri {
    return new Uri('file', path);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.path.replace(/\/$/, ''), ...segments].join('/');
    return new Uri(base.scheme, joined);
  }
  with(change: { scheme?: string; path?: string }): Uri {
    return new Uri(change.scheme ?? this.scheme, change.path ?? this.path);
  }
  toString(): string {
    return `${this.scheme}:${this.path}`;
  }
}

// The document buses the host subscribes to; tests fire them via `vscodeMock`.
const docChangeEmitter = new EventEmitter<{ document: unknown }>();
const docOpenEmitter = new EventEmitter<unknown>();
const docCloseEmitter = new EventEmitter<unknown>();

export const workspace = {
  workspaceFolders: undefined as ReadonlyArray<{ uri: Uri }> | undefined,
  textDocuments: [] as unknown[],
  onDidChangeTextDocument(listener: (e: { document: unknown }) => void): Disposable {
    return docChangeEmitter.event(listener);
  },
  onDidOpenTextDocument(listener: (document: unknown) => void): Disposable {
    return docOpenEmitter.event(listener);
  },
  onDidCloseTextDocument(listener: (document: unknown) => void): Disposable {
    return docCloseEmitter.event(listener);
  },
  applyEdit(_edit: WorkspaceEdit): Promise<boolean> {
    return Promise.resolve(true);
  },
  fs: {
    readFile(_uri: Uri): Promise<Uint8Array> {
      return Promise.resolve(new Uint8Array());
    },
    writeFile(_uri: Uri, _content: Uint8Array): Promise<void> {
      return Promise.resolve();
    },
    createDirectory(_uri: Uri): Promise<void> {
      return Promise.resolve();
    },
    delete(_uri: Uri): Promise<void> {
      return Promise.resolve();
    },
  },
};

interface RegisteredEditor {
  readonly viewType: string;
  readonly provider: unknown;
  readonly options: unknown;
}

const registeredEditors: RegisteredEditor[] = [];
const diagnosticCollections: MockDiagnosticCollection[] = [];
const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
const executedCommands: Array<{ command: string; args: unknown[] }> = [];
const informationMessages: string[] = [];

export const languages = {
  createDiagnosticCollection(name: string): MockDiagnosticCollection {
    const collection = new MockDiagnosticCollection(name);
    diagnosticCollections.push(collection);
    return collection;
  },
};

export const window = {
  activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
  showInformationMessage(message: string, ..._items: string[]): Promise<string | undefined> {
    informationMessages.push(message);
    return Promise.resolve(undefined);
  },
  showErrorMessage(_message: string, ..._items: string[]): Promise<string | undefined> {
    return Promise.resolve(undefined);
  },
  showSaveDialog(_options: unknown): Promise<Uri | undefined> {
    return Promise.resolve(undefined);
  },
  registerCustomEditorProvider(viewType: string, provider: unknown, options?: unknown): Disposable {
    registeredEditors.push({ viewType, provider, options });
    return new Disposable(() => {});
  },
};

export const commands = {
  registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable {
    registeredCommands.set(command, callback);
    return new Disposable(() => registeredCommands.delete(command));
  },
  executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    executedCommands.push({ command, args });
    const callback = registeredCommands.get(command);
    return Promise.resolve(callback?.(...args));
  },
};

/**
 * Test control surface — NOT part of the real `vscode` API. Import from the relative mock path
 * (never from `'vscode'`) so the extension source stays typed against `@types/vscode`.
 */
export const vscodeMock = {
  /** Simulate an editor change event (echo or external edit) for the given document. */
  fireDidChangeTextDocument(document: unknown): void {
    docChangeEmitter.fire({ document });
  },
  fireDidOpenTextDocument(document: unknown): void {
    docOpenEmitter.fire(document);
  },
  fireDidCloseTextDocument(document: unknown): void {
    docCloseEmitter.fire(document);
  },
  /** The collections `languages.createDiagnosticCollection` handed out (newest last). */
  diagnosticCollections(): readonly MockDiagnosticCollection[] {
    return diagnosticCollections;
  },
  registeredCommandIds(): string[] {
    return [...registeredCommands.keys()];
  },
  /** Every `commands.executeCommand` call, including the ones the host made itself. */
  executedCommands(): ReadonlyArray<{ command: string; args: unknown[] }> {
    return executedCommands;
  },
  informationMessages(): readonly string[] {
    return informationMessages;
  },
  /** The provider instance a `register(...)` call handed to `registerCustomEditorProvider`. */
  lastRegisteredProvider<T>(): T {
    const last = registeredEditors[registeredEditors.length - 1];
    if (!last) throw new Error('No custom editor provider has been registered.');
    return last.provider as T;
  },
  registeredEditors(): readonly RegisteredEditor[] {
    return registeredEditors;
  },
  /** Reset shared state between tests. */
  reset(): void {
    registeredEditors.length = 0;
    diagnosticCollections.length = 0;
    registeredCommands.clear();
    executedCommands.length = 0;
    informationMessages.length = 0;
    docChangeEmitter.dispose();
    docOpenEmitter.dispose();
    docCloseEmitter.dispose();
    workspace.workspaceFolders = undefined;
    workspace.textDocuments = [];
    window.activeTextEditor = undefined;
  },
};
