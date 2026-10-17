import * as vscode from 'vscode';
import { WardleyEditorProvider } from './WardleyEditorProvider.js';
import { WEBVIEW_COMMANDS, type WebviewCommand } from './protocol.js';

/** The command ids `registerEditorCommands` contributes (besides the webview actions). */
export const SHOW_SOURCE_COMMAND = 'wardley.showSource';
export const SHOW_DIAGRAM_COMMAND = 'wardley.showDiagram';

const NO_DIAGRAM_MESSAGE = 'Open a Wardley map in the diagram editor first.';

/**
 * Editor title buttons pass the editor's resource; the Command Palette passes nothing, so fall back
 * to the focused diagram or text editor.
 */
function resourceArgument(argument: unknown): vscode.Uri | undefined {
  return argument instanceof vscode.Uri ? argument : undefined;
}

/** Commands for an open map: text/diagram toggle, fit and image export. */
export function registerEditorCommands(provider: WardleyEditorProvider): vscode.Disposable[] {
  const showSource = vscode.commands.registerCommand(SHOW_SOURCE_COMMAND, (argument?: unknown) => {
    const uri = resourceArgument(argument) ?? provider.activeDocumentUri();
    if (!uri) return void vscode.window.showInformationMessage(NO_DIAGRAM_MESSAGE);
    return vscode.commands.executeCommand(
      'vscode.openWith',
      uri,
      'default',
      vscode.ViewColumn.Beside,
    );
  });

  const showDiagram = vscode.commands.registerCommand(
    SHOW_DIAGRAM_COMMAND,
    (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) return undefined;
      return vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        WardleyEditorProvider.viewType,
        vscode.ViewColumn.Beside,
      );
    },
  );

  const diagramActions = (Object.keys(WEBVIEW_COMMANDS) as WebviewCommand[]).map((name) =>
    vscode.commands.registerCommand(WEBVIEW_COMMANDS[name], (argument?: unknown) => {
      if (!provider.runCommand(name, resourceArgument(argument))) {
        void vscode.window.showInformationMessage(NO_DIAGRAM_MESSAGE);
      }
    }),
  );

  return [showSource, showDiagram, ...diagramActions];
}
