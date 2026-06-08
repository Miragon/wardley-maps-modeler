import * as vscode from 'vscode';
import { getWebviewHtml } from './webviewHtml.js';
import { exportImageToFile } from './exportImage.js';
import { EMBED_KEYWORD, decodeMap, pngExtractText } from './png.js';
import type { HostToWebview, WebviewToHost } from './protocol.js';

/** Default-Inhalt für eine frisch angelegte (leere) PNG-Map. */
const EMPTY_MAP = 'title New map\n';

/**
 * Wie lange auf das gerasterte PNG der Webview gewartet wird, bevor der Save abbricht. Großzügig
 * bemessen: Rasterung großer Maps auf langsamen Rechnern darf nicht fälschlich abbrechen (ein
 * Timeout lässt das Dokument „dirty" zurück -> der Nutzer kann erneut speichern, nichts geht verloren).
 */
const PNG_TIMEOUT_MS = 60_000;

/**
 * In-Memory-Modell einer `.wmap.png`/`.owm.png`-Datei. Quelle der Wahrheit ist die OWM-DSL
 * (`dsl`); auf der Platte liegt ein gerendertes PNG mit der DSL als eingebettetem tEXt-Chunk.
 */
class WardleyPngDocument implements vscode.CustomDocument {
  /** Aktuelle, im Editor sichtbare DSL. */
  dsl: string;
  /** Aus leerer/neuer Datei entstanden -> beim ersten `ready` einmalig „dirty" markieren. */
  isNew: boolean;
  /** Verhindert mehrfaches Seeden des Dirty-States über Reloads der Webview hinweg. */
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

/** Verbindung Dokument <-> aktive Webview (genau eine, da supportsMultipleEditorsPerDocument=false). */
interface PanelBinding {
  readonly webview: vscode.Webview;
  readonly pending: Map<number, PendingPng>;
  nextId: number;
}

interface PendingPng {
  /** Auflösen/Ablehnen räumen intern auf (Timer, Cancellation-Sub, Map-Eintrag). */
  resolve: (data: string) => void;
  reject: (err: Error) => void;
}

/**
 * Binärer CustomEditor für `*.wmap.png` / `*.owm.png` (eingebettete Wardley-Map, Excalidraw-Idee).
 *
 * Während der Text-Editor (`.wmap`/`.owm`) das TextDocument als Quelle der Wahrheit nutzt, ist die
 * PNG-Datei binär — daher ein eigenes CustomDocument mit selbst verwaltetem Dirty-/Undo-/Save-/
 * Backup-Lebenszyklus. Gerendert/serialisiert wird in DERSELBEN Webview wie der Text-Editor; nur
 * fürs Speichern holt der Host das gerasterte PNG per `requestPng`-Roundtrip ab (Canvas gibt's nur
 * im Browser, nicht im Node-Host).
 */
export class WardleyPngEditorProvider implements vscode.CustomEditorProvider<WardleyPngDocument> {
  public static readonly viewType = 'wardley.pngMapEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      WardleyPngEditorProvider.viewType,
      new WardleyPngEditorProvider(context),
      {
        // Modeler im Speicher halten, solange der Tab existiert: nötig, damit `saveCustomDocument`
        // auch bei verstecktem Editor die Map rastern kann (sonst kein Canvas -> kein Save).
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  private constructor(private readonly context: vscode.ExtensionContext) {}

  /** Aktive Webview je Dokument (für den Save-/Backup-Roundtrip und `update`-Pushes). */
  private readonly bindings = new Map<WardleyPngDocument, PanelBinding>();

  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<WardleyPngDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChange.event;

  // -------------------------------------------------------------------------
  // Öffnen / Auflösen
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

  /** Bytes der Quelle lesen: bevorzugt das Backup (Hot-Exit), sonst die Datei selbst. */
  private async readSource(uri: vscode.Uri, backupId: string | undefined): Promise<Uint8Array> {
    const candidates = backupId ? [vscode.Uri.parse(backupId), uri] : [uri];
    for (const candidate of candidates) {
      try {
        return await vscode.workspace.fs.readFile(candidate);
      } catch {
        /* nächste Quelle versuchen */
      }
    }
    return new Uint8Array(); // existiert (noch) nicht -> als leere/neue Map behandeln
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
          // Neue (leere) Datei: einmalig „dirty" setzen, damit der erste Cmd+S ein echtes PNG
          // materialisiert (eine 0-Byte-Platzhalterdatei liegt sonst bis zum ersten Edit dort).
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
      // Hängende Save-/Backup-Roundtrips dieser (jetzt toten) Webview sauber abbrechen. Snapshot,
      // weil reject() jeweils aus binding.pending löscht (Iterator nicht während der Iteration ändern).
      const closeErr = new Error(
        'The Wardley map editor was closed before the PNG could be rendered.',
      );
      for (const p of [...binding.pending.values()]) p.reject(closeErr);
    });
  }

  // -------------------------------------------------------------------------
  // Edits / Undo-Redo (Dirty-State über den Edit-Stack)
  // -------------------------------------------------------------------------

  /** Grafische Änderung aus der Webview -> Edit auf den Stack legen (markiert das Dokument dirty). */
  private onWebviewEdit(document: WardleyPngDocument, text: string): void {
    if (text === document.dsl) return;
    const before = document.dsl;
    const after = text;
    document.dsl = after;
    document.isNew = false;
    // Undo/Redo posten an die AKTUELLE Webview (über `bindings`), nicht an eine beim Anlegen des
    // Edits eingefangene: Wird der Editor in eine andere Gruppe verschoben, ist die ursprüngliche
    // Webview disposed und durch eine neue ersetzt — ein eingefangener `post` liefe sonst ins Leere
    // (sichtbare Map bliebe stehen, ein Save würde den veralteten Stand rastern). Vgl. revertCustomDocument.
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
   * Synthetischer „Create"-Edit für eine neue, leere Datei: kein Inhalts-Delta (der Editor zeigt
   * bereits die leere Map), nur Dirty-State. Undo/Redo sind No-ops — der Stand ist überall EMPTY_MAP,
   * VS Code verschiebt nur den Save-Zeiger.
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
  // Speichern / Backup / Revert
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
    // Der Elternordner des Backup-Ziels (i.d.R. unter storagePath) existiert evtl. noch nicht — die
    // VS-Code-API verlangt, ihn vor dem Schreiben anzulegen, sonst schlägt der Backup (Hot-Exit) fehl.
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(context.destination, '..'));
    await this.writePng(document, context.destination, cancellation);
    return {
      id: context.destination.toString(),
      delete: () => {
        void vscode.workspace.fs.delete(context.destination).then(undefined, () => {
          /* Backup evtl. schon weg -> ignorieren */
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

  /** PNG bei der Webview anfordern (Raster + eingebettete DSL) und an `target` schreiben. */
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
  // PNG-Roundtrip mit der Webview
  // -------------------------------------------------------------------------

  /** Fordert von der zugehörigen Webview das fertige Base64-PNG an (Timeout + Cancellation). */
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
      // Abbruch (z.B. ein neuer Save überholt den alten) sofort durchreichen, statt bis zum Timeout
      // zu blockieren. `cleanup` läuft auch hier, damit eine späte Antwort sauber verworfen wird.
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

  /** Antwort der Webview auf `requestPng` auflösen. */
  private resolvePng(
    binding: PanelBinding,
    msg: Extract<WebviewToHost, { type: 'pngResponse' }>,
  ): void {
    const pending = binding.pending.get(msg.id);
    if (!pending) return; // unbekannte/zu späte id (Timeout/Abbruch/Dispose hat schon aufgeräumt)
    if (msg.error) pending.reject(new Error(msg.error));
    else if (typeof msg.data === 'string' && msg.data.length > 0) pending.resolve(msg.data);
    else pending.reject(new Error('The PNG render returned no data.'));
  }
}

/**
 * Bytes -> DSL. Leere Datei = neue/leere Map (EMPTY_MAP). Nicht-leere Datei OHNE eingebettete Szene
 * ist kein editierbarer Wardley-PNG -> sprechender Fehler (sonst würde ein normales Bild beim
 * Speichern überschrieben).
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
