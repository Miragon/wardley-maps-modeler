import * as vscode from 'vscode';
import { WardleyEditorProvider } from './WardleyEditorProvider.js';
import { WardleyPngEditorProvider } from './WardleyPngEditorProvider.js';

const EMPTY_MAP = 'title New map\n';

/** Tea shop example (identical to the demo webapp), as a starting point. */
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
  /* nothing to do — all resources are tied to context.subscriptions */
}

/** A real file URI rather than an untitled doc is most robust for CustomTextEditor. */
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

function defaultMapUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, 'wardley-map.wmap') : undefined;
}

/**
 * Creates a new, embedded PNG map (`*.wmap.png`) and opens it in the PNG editor. The file starts as
 * a 0-byte placeholder (rendering only works in the webview) and is immediately "dirty": a Cmd+S
 * materializes the rendered PNG with the embedded map.
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

  // Ensure the editor will actually claim the file (it only binds *.wmap.png/*.owm.png).
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
