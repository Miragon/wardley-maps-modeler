import * as vscode from 'vscode';
import { WardleyEditorProvider } from './WardleyEditorProvider.js';
import { WardleyPngEditorProvider } from './WardleyPngEditorProvider.js';

/** Leere Map (nur Titel) — die Leinwand zeigt das Evolutions-Raster ohne Komponenten. */
const EMPTY_MAP = 'title New map\n';

/** Tea-Shop-Beispiel (identisch zur Demo-Webapp), als Einstieg. */
const EXAMPLE_MAP = `title Tea Shop
anchor Business [0.95, 0.63]
anchor Public [0.95, 0.78]
component Cup of Tea [0.79, 0.61]
component Cup [0.73, 0.78]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.80]
component Water [0.38, 0.82]
component Kettle [0.43, 0.35]
evolve Kettle 0.62
component Power [0.10, 0.71] (outsource)
pipeline Kettle [0.30, 0.65]
Business -> Cup of Tea
Public -> Cup of Tea
Cup of Tea -> Cup
Cup of Tea -> Tea
Cup of Tea -> Hot Water
Hot Water -> Water
Hot Water -> Kettle
Kettle -> Power
`;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    WardleyEditorProvider.register(context),
    WardleyPngEditorProvider.register(context),
    vscode.commands.registerCommand('wardley.newMap', () => createMap(EMPTY_MAP)),
    vscode.commands.registerCommand('wardley.newMapFromExample', () => createMap(EXAMPLE_MAP)),
    vscode.commands.registerCommand('wardley.newPngMap', () => createPngMap()),
  );
}

export function deactivate(): void {
  /* nichts zu tun — alle Ressourcen hängen an context.subscriptions */
}

/**
 * Fragt einen Speicherort ab, schreibt die Start-DSL und öffnet die Datei im Wardley-Editor.
 * (Ein echter Datei-URI statt eines Untitled-Docs ist für CustomTextEditor am robustesten.)
 */
async function createMap(initial: string): Promise<void> {
  const options: vscode.SaveDialogOptions = {
    title: 'New Wardley Map',
    saveLabel: 'Create map',
    filters: { 'Wardley Map': ['wmap', 'owm'] },
  };
  const defaultUri = defaultMapUri();
  if (defaultUri) options.defaultUri = defaultUri;

  const target = await vscode.window.showSaveDialog(options);
  if (!target) return;

  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(initial));
  await vscode.commands.executeCommand('vscode.openWith', target, WardleyEditorProvider.viewType);
}

/** Vorschlag fürs Save-Dialog: `wardley-map.wmap` im ersten Workspace-Ordner (falls vorhanden). */
function defaultMapUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, 'wardley-map.wmap') : undefined;
}

/**
 * Legt eine neue, eingebettete PNG-Map (`*.wmap.png`) an und öffnet sie im PNG-Editor. Die Datei
 * startet als 0-Byte-Platzhalter (Render geht nur in der Webview) und ist sofort „dirty": ein Cmd+S
 * materialisiert das gerenderte PNG mit eingebetteter Map.
 */
async function createPngMap(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const options: vscode.SaveDialogOptions = {
    title: 'New Wardley Map (embedded PNG)',
    saveLabel: 'Create map',
    filters: { 'Wardley Map (PNG)': ['png'] },
  };
  if (folder) options.defaultUri = vscode.Uri.joinPath(folder.uri, 'wardley-map.wmap.png');

  const chosen = await vscode.window.showSaveDialog(options);
  if (!chosen) return;

  // Sicherstellen, dass der Editor die Datei auch beansprucht (er bindet nur *.wmap.png/*.owm.png).
  const target = /\.(wmap|owm)\.png$/i.test(chosen.path)
    ? chosen
    : chosen.with({ path: `${chosen.path.replace(/\.png$/i, '')}.wmap.png` });

  await vscode.workspace.fs.writeFile(target, new Uint8Array());
  await vscode.commands.executeCommand(
    'vscode.openWith',
    target,
    WardleyPngEditorProvider.viewType,
  );
}
