import * as vscode from 'vscode';
import { registerIssueCommands } from './commands';
import { IssueDetailsViewProvider, IssuesTreeProvider } from './providers';
import type { IssueTreeNode } from './providers';
import { IssuesFileWatcher, IssuesRepository, IssuesSettingsService } from './services';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settings = new IssuesSettingsService(context);
  const repository = new IssuesRepository(settings);
  const treeProvider = new IssuesTreeProvider(repository, settings);
  const detailsProvider = new IssueDetailsViewProvider(repository, treeProvider);
  const treeView = vscode.window.createTreeView('localIssues.tree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  const fileWatcher = new IssuesFileWatcher(settings, async () => {
    await refreshViews();
  });

  async function refreshViews(): Promise<void> {
    await treeProvider.refresh();
    await detailsProvider.refresh();

    const selectedIssueId = detailsProvider.getCurrentIssueId();
    if (!selectedIssueId) {
      return;
    }

    const revealTarget: IssueTreeNode | undefined = treeProvider.getRevealTarget(selectedIssueId);
    if (!revealTarget) {
      return;
    }

    try {
      await treeView.reveal(revealTarget, {
        select: true,
        focus: false,
        expand: true,
      });
    } catch {
      // Ignore reveal failures when the tree is not visible yet.
    }
  }

  context.subscriptions.push(
    treeView,
    vscode.window.registerWebviewViewProvider('localIssues.details', detailsProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
    fileWatcher
  );

  registerIssueCommands(context, {
    repository,
    treeProvider,
    detailsProvider,
    settings,
    refreshViews,
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('localIssues.filePath') || event.affectsConfiguration('localIssues.hideCompleted')) {
        await fileWatcher.restart();
        await refreshViews();
      }
    })
  );

  await refreshViews();
  await fileWatcher.restart();
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
