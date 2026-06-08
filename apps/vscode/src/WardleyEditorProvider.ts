import * as vscode from 'vscode';
import { getWebviewHtml } from './webviewHtml.js';
import { exportImageToFile } from './exportImage.js';
import type { HostToWebview, WebviewToHost } from './protocol.js';

/**
 * CustomTextEditor for `.wmap` / `.owm`. The document (OWM-DSL text) remains the source of truth —
 * VS Code handles dirty state, saving, Git, diff, and file undo "for free". The webview renders the
 * map (diagram-js modeler) and mirrors graphical changes back into the document via WorkspaceEdit.
 */
export class WardleyEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'wardley.mapEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      WardleyEditorProvider.viewType,
      new WardleyEditorProvider(context),
      {
        // Diagram editor: preserve state (zoom/selection) across tab switches.
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

    // Texts the webview itself produced — to suppress the echo (an own change comes back as
    // onDidChangeTextDocument) and NOT reset the canvas. A SET (not a single value): for edits A,B
    // in quick succession, EVERY echo must be suppressed, regardless of the order in which the
    // change events arrive.
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

  private async replaceWholeDocument(
    document: vscode.TextDocument,
    text: string,
    suppressEcho: Set<string>,
  ): Promise<void> {
    if (document.getText() === text) return;
    // Register first (synchronously, before applyEdit), so the resulting change event is reliably
    // recognized as an echo. Only add when a write actually happens (not a no-op above) -> no
    // orphaned set entries.
    suppressEcho.add(text);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length),
    );
    edit.replace(document.uri, fullRange, text);
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) suppressEcho.delete(text); // write failed (e.g. read-only) -> no echo
  }
}
