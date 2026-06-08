import * as vscode from 'vscode';
import { getWebviewHtml } from './webviewHtml.js';
import { exportImageToFile } from './exportImage.js';
import type { HostToWebview, WebviewToHost } from './protocol.js';

/**
 * CustomTextEditor für `.wmap` / `.owm`. Das Dokument (OWM-DSL-Text) bleibt die Quelle der
 * Wahrheit — VS Code übernimmt Dirty-State, Speichern, Git, Diff und Datei-Undo „kostenlos".
 * Die Webview rendert die Map (diagram-js Modeler) und spiegelt grafische Änderungen per
 * WorkspaceEdit zurück ins Dokument.
 */
export class WardleyEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'wardley.mapEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      WardleyEditorProvider.viewType,
      new WardleyEditorProvider(context),
      {
        // Diagramm-Editor: Zustand (Zoom/Auswahl) beim Tab-Wechsel erhalten.
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  private constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    webview.html = getWebviewHtml(webview, this.context.extensionUri);

    const post = (msg: HostToWebview): Thenable<boolean> => webview.postMessage(msg);

    // Texte, die die Webview selbst erzeugt hat — um das Echo (eigene Änderung kommt als
    // onDidChangeTextDocument zurück) zu unterdrücken und die Leinwand NICHT zurückzusetzen.
    // Ein SET (kein Einzelwert): bei schnell aufeinanderfolgenden Edits A,B muss JEDES Echo
    // unterdrückt werden, unabhängig davon, in welcher Reihenfolge die Change-Events eintreffen.
    const suppressEcho = new Set<string>();

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      const text = document.getText();
      if (suppressEcho.has(text)) {
        suppressEcho.delete(text);
        return;
      }
      void post({ type: 'update', text });
    });

    const messageSub = webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
      switch (msg.type) {
        case 'ready':
          await post({ type: 'init', text: document.getText() });
          break;
        case 'edit':
          await this.replaceWholeDocument(document, msg.text, suppressEcho);
          break;
        case 'export':
          await exportImageToFile(document.uri, msg.format, msg.data);
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
      changeSub.dispose();
      messageSub.dispose();
    });
  }

  /** Ersetzt den gesamten Dokumentinhalt (No-op, wenn identisch). */
  private async replaceWholeDocument(
    document: vscode.TextDocument,
    text: string,
    suppressEcho: Set<string>,
  ): Promise<void> {
    if (document.getText() === text) return;
    // Erst registrieren (synchron, vor applyEdit), damit das resultierende Change-Event
    // sicher als Echo erkannt wird. Nur eintragen, wenn wirklich geschrieben wird (kein No-op
    // oben) -> keine verwaisten Set-Einträge.
    suppressEcho.add(text);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length),
    );
    edit.replace(document.uri, fullRange, text);
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) suppressEcho.delete(text); // Schreiben fehlgeschlagen (z.B. read-only) -> kein Echo
  }
}
