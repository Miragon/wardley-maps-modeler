/**
 * Nachrichten-Protokoll zwischen Extension-Host und Webview.
 *
 * Datenfluss (klassisches CustomTextEditor-Muster):
 *  - Host -> Webview: `init`/`update` mit dem aktuellen Dokument-Text (OWM-DSL).
 *  - Webview -> Host: `edit` nach jeder grafischen Änderung (serialisierte DSL) -> WorkspaceEdit.
 *  - Webview -> Host: `export` (SVG-Text bzw. Base64-PNG) -> Save-Dialog + Datei schreiben.
 *
 * Echo-Schutz: Der Host unterdrückt das Re-Import, wenn eine Dokumentänderung exakt der zuletzt
 * von der Webview geschickten DSL entspricht (sonst würde jede Eigen-Änderung die Leinwand
 * zurücksetzen). Die Webview ihrerseits schickt nur dann ein `edit`, wenn sich die DSL gegenüber
 * dem zuletzt bekannten Text wirklich unterscheidet.
 */

export type HostToWebview =
  /** Erstbefüllung nach `ready`. */
  | { type: 'init'; text: string }
  /** Externe Dokumentänderung (Texteditor, Git, …) -> neu importieren. */
  | { type: 'update'; text: string };

export type WebviewToHost =
  /** Webview ist geladen und bereit für `init`. */
  | { type: 'ready' }
  /** Grafische Änderung -> als WorkspaceEdit ins Dokument übernehmen. */
  | { type: 'edit'; text: string }
  /** Bild-Export anstoßen (SVG = Text, PNG = Base64). */
  | { type: 'export'; format: 'svg' | 'png'; data: string }
  /** Hinweis/Fehler an die VS-Code-Notifications durchreichen. */
  | { type: 'info'; message: string }
  | { type: 'error'; message: string };
