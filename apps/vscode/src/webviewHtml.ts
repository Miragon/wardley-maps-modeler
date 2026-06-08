import * as vscode from 'vscode';
import { getNonce } from './util.js';

/**
 * HTML scaffold of the Wardley webview (identical for the text and PNG editor — both load the same
 * bundle `dist/webview.js` and speak the same protocol). Strict CSP: scripts only via nonce, no
 * external sources (GDPR-compliant, fonts inlined as data: URLs in the CSS).
 */
export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const asset = (file: string): vscode.Uri =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', file));
  const scriptUri = asset('webview.js');
  const styleUri = asset('webview.css');

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>Wardley Map</title>
  </head>
  <body>
    <div id="app">
      <div id="canvas" class="wardley-canvas"></div>
      <div id="toolbar" class="toolbar"></div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
