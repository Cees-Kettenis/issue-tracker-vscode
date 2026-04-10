import * as vscode from 'vscode';
import { registerIssueCommands } from './commands';
import { IssueDetailsViewProvider, IssuesTreeProvider } from './providers';
import { IssuesRepository, IssuesSettingsService } from './services';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settings = new IssuesSettingsService(context);
  const repository = new IssuesRepository(settings);
  const treeProvider = new IssuesTreeProvider(repository, settings);
  const detailsProvider = new IssueDetailsViewProvider(repository, treeProvider, settings);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('localIssues.tree', treeProvider),
    vscode.window.registerWebviewViewProvider('localIssues.details', detailsProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  registerIssueCommands(context, {
    repository,
    treeProvider,
    detailsProvider,
    settings,
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('localIssues.filePath') || event.affectsConfiguration('localIssues.hideCompleted')) {
        await treeProvider.refresh();
        await detailsProvider.refresh();
      }
    })
  );

  await treeProvider.refresh();
  await detailsProvider.refresh();
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
