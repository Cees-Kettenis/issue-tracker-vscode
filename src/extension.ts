import * as vscode from 'vscode';
import { registerIssueCommands } from './commands';
import { AllTasksTreeProvider, IssueDetailsViewProvider, IssuesTreeProvider } from './providers';
import type { IssueTreeNode, AllTasksTreeNode } from './providers';
import { IssuesFileWatcher, IssuesRepository, IssuesSettingsService } from './services';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Local Issues');
  const log = (message: string): void => {
    output.appendLine(`[${new Date().toISOString()}] ${message}`);
  };

  log('activate');
  log(`workspaceFolders=${(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.name).join(', ') || '(none)'}`);
  const settings = new IssuesSettingsService(context);
  const repository = new IssuesRepository(settings, log);
  const treeProvider = new IssuesTreeProvider(repository, settings);
  const allTasksProvider = new AllTasksTreeProvider(repository, settings);
  let detailsProvider: IssueDetailsViewProvider;
  const treeView = vscode.window.createTreeView('localIssues.tree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  const allTasksView = vscode.window.createTreeView('localIssues.allTasks', {
    treeDataProvider: allTasksProvider,
    showCollapseAll: false,
  });
  const fileWatcher = new IssuesFileWatcher(settings, async () => {
    await refreshViews();
  });

  async function refreshViews(): Promise<void> {
    log('refreshViews -> start');
    await treeProvider.refresh();
    await allTasksProvider.refresh();
    await detailsProvider.refresh();

    const selectedIssueId = detailsProvider.getCurrentIssueId();
    if (!selectedIssueId) {
      return;
    }

    const revealTarget: IssueTreeNode | undefined = treeProvider.getRevealTarget(selectedIssueId);
    if (!revealTarget) {
      const allTasksRevealTarget: AllTasksTreeNode | undefined = allTasksProvider.getRevealTarget(selectedIssueId);
      if (allTasksRevealTarget) {
        try {
          await allTasksView.reveal(allTasksRevealTarget, {
            select: true,
            focus: false,
            expand: false,
          });
        } catch {
          // Ignore reveal failures when the tree is not visible yet.
        }
      }
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

    const allTasksRevealTarget: AllTasksTreeNode | undefined = allTasksProvider.getRevealTarget(selectedIssueId);
    if (allTasksRevealTarget) {
      try {
        await allTasksView.reveal(allTasksRevealTarget, {
          select: true,
          focus: false,
          expand: false,
        });
      } catch {
        // Ignore reveal failures when the tree is not visible yet.
      }
    }
    log(`refreshViews <- selected=${selectedIssueId}`);
  }

  detailsProvider = new IssueDetailsViewProvider(repository, treeProvider, settings, refreshViews, log);

  await vscode.commands.executeCommand('setContext', 'localIssues.hideCompleted', await settings.getHideCompleted());

  context.subscriptions.push(
    treeView,
    allTasksView,
    vscode.window.registerWebviewViewProvider('localIssues.details', detailsProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
    fileWatcher,
    output
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await fileWatcher.restart();
      await refreshViews();
    })
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
        await vscode.commands.executeCommand('setContext', 'localIssues.hideCompleted', await settings.getHideCompleted());
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
