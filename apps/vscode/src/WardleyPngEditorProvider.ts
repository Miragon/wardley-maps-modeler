import * as vscode from 'vscode';
import { getWebviewHtml } from './webviewHtml.js';
import { exportImageToFile } from './exportImage.js';
import { EMBED_KEYWORD, decodeMap, pngExtractText } from './png.js';
import type { HostToWebview, WebviewToHost } from './protocol.js';

const EMPTY_MAP = 'title New map\n';

/**
 * How long to wait for the webview's rasterized PNG before the save aborts. Generously sized:
 * rasterizing large maps on slow machines must not abort falsely (a timeout leaves the document
 * "dirty" -> the user can save again, nothing is lost).
 */
const PNG_TIMEOUT_MS = 60_000;

/**
 * In-memory model of a `.wmap.png`/`.owm.png` file. The source of truth is the OWM-DSL (`dsl`);
 * on disk lives a rendered PNG with the DSL embedded as a tEXt chunk.
 */
class WardleyPngDocument implements vscode.CustomDocument {
  dsl: string;
  /** Originated from an empty/new file -> mark "dirty" once on the first `ready`. */
  isNew: boolean;
  /** Prevents seeding the dirty state more than once across webview reloads. */
  seededDirty = false;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  constructor(
    readonly uri: vscode.Uri,
    dsl: string,
    isNew: boolean,
  ) {
    this.dsl = dsl;
    this.isNew = isNew;
  }

  dispose(): void {
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
}

/** Link between document <-> active webview (exactly one, since supportsMultipleEditorsPerDocument=false). */
interface PanelBinding {
  readonly webview: vscode.Webview;
  readonly pending: Map<number, PendingPng>;
  nextId: number;
}

interface PendingPng {
  /** Resolve/reject clean up internally (timer, cancellation subscription, map entry). */
  resolve: (data: string) => void;
  reject: (err: Error) => void;
}

/**
 * Binary CustomEditor for `*.wmap.png` / `*.owm.png` (embedded Wardley map, Excalidraw idea).
 *
 * While the text editor (`.wmap`/`.owm`) uses the TextDocument as its source of truth, the PNG file
 * is binary — hence a dedicated CustomDocument with a self-managed dirty/undo/save/backup lifecycle.
 * Rendering/serialization happens in the SAME webview as the text editor; only for saving does the
 * host fetch the rasterized PNG via a `requestPng` roundtrip (a canvas only exists in the browser,
 * not in the Node host).
 */
export class WardleyPngEditorProvider implements vscode.CustomEditorProvider<WardleyPngDocument> {
  public static readonly viewType = 'wardley.pngMapEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      WardleyPngEditorProvider.viewType,
      new WardleyPngEditorProvider(context),
      {
        // Keep the modeler in memory for as long as the tab exists: needed so `saveCustomDocument`
        // can rasterize the map even with a hidden editor (otherwise no canvas -> no save).
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  private constructor(private readonly context: vscode.ExtensionContext) {}

  private readonly bindings = new Map<WardleyPngDocument, PanelBinding>();

  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<WardleyPngDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChange.event;

  // -------------------------------------------------------------------------
  // Open / Resolve
  // -------------------------------------------------------------------------

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<WardleyPngDocument> {
    const bytes = await this.readSource(uri, openContext.backupId);
    const { dsl, isNew } = loadDsl(bytes);
    return new WardleyPngDocument(uri, dsl, isNew);
  }

  /** Read the source bytes: prefer the backup (hot-exit), otherwise the file itself. */
  private async readSource(uri: vscode.Uri, backupId: string | undefined): Promise<Uint8Array> {
    const candidates = backupId ? [vscode.Uri.parse(backupId), uri] : [uri];
    for (const candidate of candidates) {
      try {
        return await vscode.workspace.fs.readFile(candidate);
      } catch {
        /* try the next source */
      }
    }
    return new Uint8Array(); // does not exist (yet) -> treat as empty/new map
  }

  public async resolveCustomEditor(
    document: WardleyPngDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    webview.html = getWebviewHtml(webview, this.context.extensionUri);

    const binding: PanelBinding = { webview, pending: new Map(), nextId: 1 };
    this.bindings.set(document, binding);

    const post = (msg: HostToWebview): Thenable<boolean> => webview.postMessage(msg);

    const messageSub = webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
      switch (msg.type) {
        case 'ready':
          await post({ type: 'init', text: document.dsl });
          // New (empty) file: set "dirty" once so the first Cmd+S materializes a real PNG
          // (otherwise a 0-byte placeholder file sits there until the first edit).
          if (document.isNew && !document.seededDirty) {
            document.seededDirty = true;
            this.markCreated(document);
          }
          break;
        case 'edit':
          this.onWebviewEdit(document, msg.text);
          break;
        case 'export':
          await exportImageToFile(document.uri, msg.format, msg.data);
          break;
        case 'pngResponse':
          this.resolvePng(binding, msg);
          break;
        case 'info':
          void vscode.window.showInformationMessage(msg.message);
          break;
        case 'error':
          void vscode.window.showErrorMessage(msg.message);
          break;
      }
    });

    webviewPanel.onDidDispose(() => {
      messageSub.dispose();
      if (this.bindings.get(document) === binding) this.bindings.delete(document);
      // Cleanly abort pending save/backup roundtrips of this (now dead) webview. Snapshot first,
      // because reject() deletes from binding.pending (don't mutate the iterator during iteration).
      const closeErr = new Error(
        'The Wardley map editor was closed before the PNG could be rendered.',
      );
      for (const p of [...binding.pending.values()]) p.reject(closeErr);
    });
  }

  // -------------------------------------------------------------------------
  // Edits / Undo-Redo (dirty state via the edit stack)
  // -------------------------------------------------------------------------

  private onWebviewEdit(document: WardleyPngDocument, text: string): void {
    if (text === document.dsl) return;
    const before = document.dsl;
    const after = text;
    document.dsl = after;
    document.isNew = false;
    // Undo/Redo post to the CURRENT webview (via `bindings`), not one captured when the edit was
    // created: if the editor is moved to another group, the original webview is disposed and
    // replaced by a new one — a captured `post` would otherwise go nowhere (the visible map would
    // stay stale, and a save would rasterize the outdated state). Cf. revertCustomDocument.
    this._onDidChange.fire({
      document,
      label: 'Edit map',
      undo: () => {
        document.dsl = before;
        void this.bindings.get(document)?.webview.postMessage({ type: 'update', text: before });
      },
      redo: () => {
        document.dsl = after;
        void this.bindings.get(document)?.webview.postMessage({ type: 'update', text: after });
      },
    });
  }

  /**
   * Synthetic "Create" edit for a new, empty file: no content delta (the editor already shows the
   * empty map), only dirty state. Undo/Redo are no-ops — the state is EMPTY_MAP everywhere, VS Code
   * merely moves the save pointer.
   */
  private markCreated(document: WardleyPngDocument): void {
    this._onDidChange.fire({
      document,
      label: 'Create map',
      undo: () => {},
      redo: () => {},
    });
  }

  // -------------------------------------------------------------------------
  // Save / Backup / Revert
  // -------------------------------------------------------------------------

  public async saveCustomDocument(
    document: WardleyPngDocument,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await this.writePng(document, document.uri, cancellation);
    document.isNew = false;
  }

  public async saveCustomDocumentAs(
    document: WardleyPngDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await this.writePng(document, destination, cancellation);
  }

  public async backupCustomDocument(
    document: WardleyPngDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    // The parent folder of the backup target (usually under storagePath) may not exist yet — the
    // VS Code API requires creating it before writing, otherwise the backup (hot-exit) fails.
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(context.destination, '..'));
    await this.writePng(document, context.destination, cancellation);
    return {
      id: context.destination.toString(),
      delete: () => {
        void vscode.workspace.fs.delete(context.destination).then(undefined, () => {
          /* backup may already be gone -> ignore */
        });
      },
    };
  }

  public async revertCustomDocument(
    document: WardleyPngDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const bytes = await this.readSource(document.uri, undefined);
    const { dsl } = loadDsl(bytes);
    document.dsl = dsl;
    document.isNew = false;
    document.seededDirty = false;
    await this.bindings.get(document)?.webview.postMessage({ type: 'update', text: dsl });
  }

  private async writePng(
    document: WardleyPngDocument,
    target: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const base64 = await this.requestPng(document, cancellation);
    if (cancellation.isCancellationRequested) return;
    await vscode.workspace.fs.writeFile(target, new Uint8Array(Buffer.from(base64, 'base64')));
  }

  // -------------------------------------------------------------------------
  // PNG roundtrip with the webview
  // -------------------------------------------------------------------------

  private requestPng(
    document: WardleyPngDocument,
    cancellation: vscode.CancellationToken,
  ): Promise<string> {
    const binding = this.bindings.get(document);
    if (!binding) {
      return Promise.reject(
        new Error('Cannot save this Wardley map: its editor view is not available.'),
      );
    }
    if (cancellation.isCancellationRequested) {
      return Promise.reject(new vscode.CancellationError());
    }
    const id = binding.nextId++;
    return new Promise<string>((resolve, reject) => {
      const cleanup = (): void => {
        binding.pending.delete(id);
        clearTimeout(timer);
        cancelSub.dispose();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out while rendering the PNG.'));
      }, PNG_TIMEOUT_MS);
      // Propagate cancellation (e.g. a new save overtakes the old one) immediately, instead of
      // blocking until the timeout. `cleanup` runs here too, so a late response is cleanly discarded.
      const cancelSub = cancellation.onCancellationRequested(() => {
        cleanup();
        reject(new vscode.CancellationError());
      });
      binding.pending.set(id, {
        resolve: (data) => {
          cleanup();
          resolve(data);
        },
        reject: (err) => {
          cleanup();
          reject(err);
        },
      });
      void binding.webview.postMessage({ type: 'requestPng', id });
    });
  }

  private resolvePng(
    binding: PanelBinding,
    msg: Extract<WebviewToHost, { type: 'pngResponse' }>,
  ): void {
    const pending = binding.pending.get(msg.id);
    if (!pending) return; // unknown/too-late id (timeout/cancellation/dispose already cleaned up)
    if (msg.error) pending.reject(new Error(msg.error));
    else if (typeof msg.data === 'string' && msg.data.length > 0) pending.resolve(msg.data);
    else pending.reject(new Error('The PNG render returned no data.'));
  }
}

/**
 * Bytes -> DSL. Empty file = new/empty map (EMPTY_MAP). A non-empty file WITHOUT an embedded scene
 * is not an editable Wardley PNG -> a descriptive error (otherwise a normal image would be
 * overwritten on save).
 */
function loadDsl(bytes: Uint8Array): { dsl: string; isNew: boolean } {
  if (bytes.length === 0) return { dsl: EMPTY_MAP, isNew: true };
  const embedded = pngExtractText(bytes, EMBED_KEYWORD);
  if (!embedded) {
    throw new Error(
      'This PNG file does not contain an embedded Wardley map. ' +
        'Only PNGs exported from the Wardley editor (with an embedded map) can be edited here.',
    );
  }
  return { dsl: decodeMap(embedded), isNew: false };
}
