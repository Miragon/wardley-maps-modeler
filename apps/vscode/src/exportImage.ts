import * as vscode from 'vscode';

/**
 * Bild-Export (SVG/PNG) über einen Save-Dialog auf die Platte — die Szene (OWM-DSL) ist in der
 * Datei eingebettet, sodass exportierte Bilder später wieder als Map geöffnet werden können.
 * Geteilt von Text- und PNG-Editor (deshalb generisch über die Quell-URI statt einem Dokument-Typ).
 */
export async function exportImageToFile(
  sourceUri: vscode.Uri | undefined,
  format: 'svg' | 'png',
  data: string,
): Promise<void> {
  const options: vscode.SaveDialogOptions = {
    filters: format === 'svg' ? { 'SVG image': ['svg'] } : { 'PNG image': ['png'] },
  };
  const defaultUri = exportDefaultUri(sourceUri, format);
  if (defaultUri) options.defaultUri = defaultUri;
  const target = await vscode.window.showSaveDialog(options);
  if (!target) return;

  const bytes =
    format === 'svg' ? new TextEncoder().encode(data) : new Uint8Array(Buffer.from(data, 'base64'));
  await vscode.workspace.fs.writeFile(target, bytes);

  const action = await vscode.window.showInformationMessage(
    `Wardley map exported as ${format.toUpperCase()}.`,
    'Reveal',
  );
  if (action === 'Reveal') void vscode.commands.executeCommand('revealFileInOS', target);
}

/** `<mapname>.<format>` neben der Quelldatei (bei fehlender Datei: im ersten Workspace-Ordner). */
function exportDefaultUri(
  sourceUri: vscode.Uri | undefined,
  format: 'svg' | 'png',
): vscode.Uri | undefined {
  if (sourceUri && sourceUri.scheme === 'file') {
    // Doppelendungen wie `.wmap.png` mit abräumen, damit `map.wmap.png` -> `map.svg` wird.
    const path = sourceUri.path.replace(/(\.(wmap|owm))?\.[^./]+$/i, '');
    return sourceUri.with({ path: `${path}.${format}` });
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, `wardley-map.${format}`) : undefined;
}
