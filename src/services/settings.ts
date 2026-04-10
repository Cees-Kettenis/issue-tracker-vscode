import * as path from 'path';
import * as vscode from 'vscode';
import { resolveWorkspaceFolder } from './workspace';

export const DEFAULT_ISSUES_FILE_PATH = '.vscode/issues.json';
const HIDE_COMPLETED_KEY = 'localIssues.hideCompleted';

export class IssuesSettingsService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('localIssues');
  }

  getFilePathSetting(): string {
    const configured = this.getConfiguration().get<string>('filePath', DEFAULT_ISSUES_FILE_PATH).trim();
    return configured || DEFAULT_ISSUES_FILE_PATH;
  }

  getHideCompletedDefault(): boolean {
    return this.getConfiguration().get<boolean>('hideCompleted', false);
  }

  async getHideCompleted(): Promise<boolean> {
    return this.context.workspaceState.get<boolean>(HIDE_COMPLETED_KEY, this.getHideCompletedDefault());
  }

  async setHideCompleted(value: boolean): Promise<void> {
    await this.context.workspaceState.update(HIDE_COMPLETED_KEY, value);
  }

  resolveStorePath(workspaceFolder: vscode.WorkspaceFolder): string {
    const configured = this.getFilePathSetting();
    return path.isAbsolute(configured) ? configured : path.join(workspaceFolder.uri.fsPath, configured);
  }

  async resolveCurrentStorePath(): Promise<string> {
    const workspaceFolder = await resolveWorkspaceFolder();
    if (!workspaceFolder) {
      throw new Error('Open a workspace folder before using Local Issues.');
    }

    return this.resolveStorePath(workspaceFolder);
  }
}
