/**
 * Message protocol between the extension host and the webview.
 *
 * Data flow (classic CustomTextEditor pattern):
 *  - Host -> webview: `init`/`update` with the current document text (OWM-DSL).
 *  - Webview -> host: `edit` after every graphical change (serialized DSL) -> WorkspaceEdit.
 *  - Webview -> host: `export` (SVG text or Base64 PNG) -> save dialog + write file.
 *
 * Echo protection: the host suppresses re-import when a document change exactly matches the DSL
 * last sent by the webview (otherwise every own change would reset the canvas). The webview, in
 * turn, only sends an `edit` when the DSL actually differs from the last known text.
 */

export type HostToWebview =
  /** Initial population after `ready`. */
  | { type: 'init'; text: string }
  /** External document change (text editor, Git, …) -> re-import. */
  | { type: 'update'; text: string };

export type WebviewToHost =
  | { type: 'ready' }
  /** Graphical change -> apply to the document as a WorkspaceEdit. */
  | { type: 'edit'; text: string }
  /** Trigger an image export (SVG = text, PNG = Base64). */
  | { type: 'export'; format: 'svg' | 'png'; data: string }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string };
