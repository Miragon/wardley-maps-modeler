/**
 * Message protocol between the extension host and the webview.
 *
 * Data flow (classic CustomTextEditor pattern):
 *  - Host -> webview: `init`/`update` with the current document text (OWM-DSL).
 *  - Webview -> host: `edit` after every graphical change (the document text with only the changed
 *    statements rewritten) -> minimal WorkspaceEdit.
 *  - Webview -> host: `export` (SVG text or Base64 PNG) -> save dialog + write file.
 *  - Host -> webview: `command` (from the Command Palette or the editor title bar) and
 *    `diagnostics` (the number of parser problems shown in the Problems view).
 *
 * Echo protection: the host suppresses re-import when a document change exactly matches the text
 * last sent by the webview (otherwise every own change would reset the canvas). The webview, in
 * turn, only sends an `edit` when the text actually differs from the last known text.
 */

/** Diagram actions the host can trigger in the webview, keyed to their VS Code command ids. */
export const WEBVIEW_COMMANDS = {
  fitView: 'wardley.fitView',
  exportSvg: 'wardley.exportSvg',
  exportPng: 'wardley.exportPng',
  exportPngTransparent: 'wardley.exportPngTransparent',
} as const;

export type WebviewCommand = keyof typeof WEBVIEW_COMMANDS;

export function isWebviewCommand(name: unknown): name is WebviewCommand {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(WEBVIEW_COMMANDS, name);
}

export type HostToWebview =
  /** Initial population after `ready`. */
  | { type: 'init'; text: string }
  /** External document change (text editor, Git, undo, …) -> re-import. */
  | { type: 'update'; text: string }
  /** Run a diagram action (fit, export). */
  | { type: 'command'; name: WebviewCommand }
  /** Parser problems of the document (0 hides the indicator). */
  | { type: 'diagnostics'; count: number };

export type WebviewToHost =
  | { type: 'ready' }
  /** Graphical change -> apply to the document as a WorkspaceEdit. */
  | { type: 'edit'; text: string }
  /** Trigger an image export (SVG = text, PNG = Base64). */
  | { type: 'export'; format: 'svg' | 'png'; data: string }
  /** Open the Problems view (the webview's problem indicator was clicked). */
  | { type: 'showProblems' }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string };
