import * as vscode from 'vscode';

export async function resolveWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];

  if (!folders.length) {
    await vscode.window.showWarningMessage('Local Issues requires an open workspace folder.');
    return undefined;
  }

  if (folders.length > 1) {
    await vscode.window.showWarningMessage(
      `Local Issues only supports a single workspace folder for now. Using "${folders[0].name}".`
    );
  }

  return folders[0];
}
