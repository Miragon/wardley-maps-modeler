/**
 * Message protocol between the extension host and the webview.
 *
 * Data flow (classic CustomTextEditor pattern):
 *  - Host -> webview: `init`/`update` with the current document text (OWM-DSL).
 *  - Webview -> host: `edit` after every graphical change (the document text with only the changed
 *    statements rewritten) -> minimal WorkspaceEdit.
 *  - Webview -> host: `export` (SVG text or Base64 PNG) -> save dialog + write file.
 *  - Webview -> host: `showProblems` (the problems pill) and `insertExample` (the empty-file hint).
 *  - Host -> webview: `command` (from the Command Palette or the editor title bar) and `problems`
 *    (the parser's findings shown in the Problems view, for the pill).
 *
 * Echo protection: the host suppresses re-import when a document change exactly matches the text
 * last sent by the webview (otherwise every own change would reset the canvas). The webview, in
 * turn, only sends an `edit` when the text actually differs from the last known text. The modeler
 * shell's `modelerShell.appearance` messages arrive on the same window; the webview ignores types
 * it does not know.
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

/** What an export carries: SVG as text, the PNGs in Base64. */
export type ExportFormat = 'svg' | 'png' | 'png-transparent';

export type HostToWebview =
  /** Initial population after `ready`. */
  | { type: 'init'; text: string }
  /** External document change (text editor, Git, undo, Insert example, …) -> re-import. */
  | { type: 'update'; text: string }
  /** Run a diagram action (fit, export). */
  | { type: 'command'; name: WebviewCommand }
  /** The document's diagnostics, for the problems pill (0 hides it). */
  | { type: 'problems'; count: number; errors: number };

export type WebviewToHost =
  | { type: 'ready' }
  /** Graphical change -> apply to the document as a WorkspaceEdit. */
  | { type: 'edit'; text: string }
  /** Trigger an image export (SVG = text, PNG = Base64). */
  | { type: 'export'; format: ExportFormat; data: string }
  /** The problems pill was activated -> open the Problems view. */
  | { type: 'showProblems' }
  /** "Insert example" of the empty-file hint -> append the example as one document edit. */
  | { type: 'insertExample' }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string };
