import * as vscode from 'vscode';
import { revealFileLabel } from '@miragon/modeler-shell/vscode/extension';
import type { ExportFormat } from './protocol.js';

interface ExportKind {
  readonly title: string;
  readonly filters: Record<string, string[]>;
  /** The file name beside the map: `strategy` -> `strategy.png`. */
  fileName(base: string): string;
  readonly base64: boolean;
}

/** The exports of the menu's Export group (guide §5.4), with the same file names as the web app. */
const EXPORT_KINDS: Readonly<Record<ExportFormat, ExportKind>> = {
  png: {
    title: 'Export as PNG',
    filters: { 'PNG image': ['png'] },
    fileName: (base) => `${base}.png`,
    base64: true,
  },
  svg: {
    title: 'Export as SVG',
    filters: { 'SVG image': ['svg'] },
    fileName: (base) => `${base}.svg`,
    base64: false,
  },
  'png-transparent': {
    title: 'Export as PNG (4×, transparent)',
    filters: { 'PNG image': ['png'] },
    fileName: (base) => `${base}-transparent@4x.png`,
    base64: true,
  },
};

/**
 * Image export to disk via a save dialog. Exports are pictures: they carry no map source, the
 * `.wmap`/`.owm` file stays the editable original. The outcome is a host notification (guide
 * §13.5): the file name with the platform's reveal action, or the error.
 */
export async function exportImageToFile(
  sourceUri: vscode.Uri | undefined,
  format: ExportFormat,
  data: string,
): Promise<void> {
  const kind = EXPORT_KINDS[format];
  const options: vscode.SaveDialogOptions = {
    title: kind.title,
    saveLabel: 'Export',
    filters: kind.filters,
  };
  const defaultUri = exportDefaultUri(sourceUri, kind);
  if (defaultUri) options.defaultUri = defaultUri;
  const target = await vscode.window.showSaveDialog(options);
  if (!target) return;

  const fileName = target.path.slice(target.path.lastIndexOf('/') + 1);
  const bytes = kind.base64
    ? new Uint8Array(Buffer.from(data, 'base64'))
    : new TextEncoder().encode(data);
  try {
    await vscode.workspace.fs.writeFile(target, bytes);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Could not export ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const reveal = revealFileLabel(process.platform);
  if ((await vscode.window.showInformationMessage(`Exported ${fileName}.`, reveal)) === reveal) {
    void vscode.commands.executeCommand('revealFileInOS', target);
  }
}

/** `<mapname>.<format>` next to the source file (if no file: in the first workspace folder). */
function exportDefaultUri(
  sourceUri: vscode.Uri | undefined,
  kind: ExportKind,
): vscode.Uri | undefined {
  if (sourceUri && sourceUri.scheme === 'file') {
    // Strip the map extension so `map.wmap` -> `map.svg`.
    const path = sourceUri.path.replace(/\.[^./]+$/i, '');
    const directory = path.slice(0, path.lastIndexOf('/') + 1);
    const base = path.slice(directory.length);
    return sourceUri.with({ path: `${directory}${kind.fileName(base)}` });
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, kind.fileName('wardley-map')) : undefined;
}
