import * as vscode from 'vscode';
import * as path from 'path';
import type { IssuePriority, IssueStatus } from '../models';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '../models';
import { IssuesRepository } from '../services/issuesRepository';
import { IssuesSettingsService } from '../services/settings';
import { IssuesTreeProvider } from '../providers/issuesTreeProvider';
import { IssueDetailsViewProvider } from '../providers/issueDetailsViewProvider';

export interface IssueCommandServices {
  repository: IssuesRepository;
  treeProvider: IssuesTreeProvider;
  detailsProvider: IssueDetailsViewProvider;
  settings: IssuesSettingsService;
  refreshViews: () => Promise<void>;
}

export function registerIssueCommands(
  context: vscode.ExtensionContext,
  services: IssueCommandServices
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('localIssues.refresh', async () => {
      await services.refreshViews();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.editIssue', async (issueId?: string) => {
      await openIssueEditor(issueId, services);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.selectIssue', async (issueId?: string) => {
      await openIssueEditor(issueId, services);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.createGroup', async () => {
      const name = await vscode.window.showInputBox({
        title: 'Create group',
        prompt: 'Enter a group name.',
        ignoreFocusOut: true,
      });

      if (!name) {
        return;
      }

      await services.repository.createGroup(name);
      await services.refreshViews();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.importIssues', async () => {
      try {
        const selected = await vscode.window.showOpenDialog({
          title: 'Import issues',
          canSelectFiles: true,
          canSelectMany: false,
          canSelectFolders: false,
          openLabel: 'Import',
          filters: {
            JSON: ['json'],
          },
        });

        const source = selected?.[0];
        if (!source) {
          return;
        }

        const imported = await services.repository.importFromFile(source.fsPath);

        if (imported.issues.length) {
          await services.detailsProvider.selectIssue(imported.issues[0].id);
        } else {
          await services.detailsProvider.showNewIssue();
        }

        await services.refreshViews();

        await vscode.window.showInformationMessage(
          `Imported ${imported.issues.length} issue${imported.issues.length === 1 ? '' : 's'} and ${imported.groups.length} group${imported.groups.length === 1 ? '' : 's'}.`
        );
      } catch (error) {
        await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.exportIssues', async () => {
      try {
        const defaultUri = await getDefaultExportUri(services);
        const target = await vscode.window.showSaveDialog({
          title: 'Export issues',
          defaultUri,
          saveLabel: 'Export',
          filters: {
            JSON: ['json'],
          },
        });

        if (!target) {
          return;
        }

        const exported = await services.repository.exportToFile(target.fsPath);
        await vscode.window.showInformationMessage(
          `Exported ${exported.issues.length} issue${exported.issues.length === 1 ? '' : 's'} to ${target.fsPath}.`
        );
      } catch (error) {
        await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.createIssue', async (target?: unknown) => {
      const presetGroupId = extractGroupId(target);
      const issue = await promptForNewIssue(services, presetGroupId);
      if (!issue) {
        return;
      }

      const created = await services.repository.createIssue(issue);
      await services.detailsProvider.selectIssue(created.id);
      await services.refreshViews();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.toggleHideCompleted', async () => {
      const current = await services.settings.getHideCompleted();
      await services.settings.setHideCompleted(!current);
      await services.refreshViews();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.setStatus', async (issueId?: string) => {
      const resolvedIssueId = await resolveIssueId(issueId, services.detailsProvider);
      if (!resolvedIssueId) {
        return;
      }

      const status = await promptForStatus();
      if (!status) {
        return;
      }

      const updated = await services.repository.updateIssue(resolvedIssueId, { status });
      await services.detailsProvider.selectIssue(updated.id);
      await services.refreshViews();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.setPriority', async (issueId?: string) => {
      const resolvedIssueId = await resolveIssueId(issueId, services.detailsProvider);
      if (!resolvedIssueId) {
        return;
      }

      const priority = await promptForPriority();
      if (!priority) {
        return;
      }

      const updated = await services.repository.updateIssue(resolvedIssueId, { priority });
      await services.detailsProvider.selectIssue(updated.id);
      await services.refreshViews();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.deleteIssue', async (issueId?: string) => {
      const resolvedIssueId = await resolveIssueId(issueId, services.detailsProvider);
      if (!resolvedIssueId) {
        return;
      }

      const confirmed = await vscode.window.showWarningMessage(
        'Delete this issue?',
        { modal: true },
        'Delete'
      );

      if (confirmed !== 'Delete') {
        return;
      }

      await services.repository.deleteIssue(resolvedIssueId);
      await services.detailsProvider.showNewIssue();
      await services.refreshViews();
    })
  );

  context.subscriptions.push(...disposables);
  return disposables;
}

async function resolveIssueId(
  issueId: string | undefined,
  detailsProvider: IssueDetailsViewProvider
): Promise<string | undefined> {
  const resolvedIssueId = issueId ?? detailsProvider.getCurrentIssueId();
  if (!resolvedIssueId) {
    await vscode.window.showInformationMessage('Select an issue first.');
  }

  return resolvedIssueId;
}

async function openIssueEditor(
  issueId: string | undefined,
  services: IssueCommandServices
): Promise<void> {
  const resolvedIssueId = await resolveIssueId(issueId, services.detailsProvider);
  if (!resolvedIssueId) {
    return;
  }

  await services.detailsProvider.selectIssue(resolvedIssueId);
}

async function promptForStatus(): Promise<IssueStatus | undefined> {
  const selected = await vscode.window.showQuickPick(
    ISSUE_STATUSES.map((status) => ({ label: status })),
    {
      title: 'Change issue status',
      placeHolder: 'Select a status',
    }
  );

  return selected?.label as IssueStatus | undefined;
}

async function promptForPriority(): Promise<IssuePriority | undefined> {
  const selected = await vscode.window.showQuickPick(
    ISSUE_PRIORITIES.map((priority) => ({ label: priority })),
    {
      title: 'Change issue priority',
      placeHolder: 'Select a priority',
    }
  );

  return selected?.label as IssuePriority | undefined;
}

async function getDefaultExportUri(services: IssueCommandServices): Promise<vscode.Uri> {
  const storePath = await services.settings.resolveCurrentStorePath();
  const directory = path.dirname(storePath);
  return vscode.Uri.file(path.join(directory, 'issues-export.json'));
}

async function promptForNewIssue(
  services: IssueCommandServices,
  presetGroupId?: string
): Promise<{
  title: string;
  description: string;
  groupId: string;
  status: IssueStatus;
  priority: IssuePriority;
} | undefined> {
  const file = await services.repository.load();
  let groupId = presetGroupId && file.groups.some((group) => group.id === presetGroupId) ? presetGroupId : '';

  if (groupId) {
    // A group was supplied from a tree context menu or found as the default group.
  } else if (file.groups.length) {
    const groupChoice = await vscode.window.showQuickPick(
      [
        ...file.groups.map((group) => ({ label: group.name, description: group.id, value: group.id })),
        { label: 'Create new group...', description: 'Add a new group first', value: '__create__' },
      ],
      {
        title: 'Choose a group',
        placeHolder: 'Select a group for the new issue',
      }
    );

    if (!groupChoice) {
      return undefined;
    }

    if (groupChoice.value === '__create__') {
      const name = await vscode.window.showInputBox({
        title: 'Create group',
        prompt: 'Enter a group name for the new issue.',
        ignoreFocusOut: true,
      });

      if (!name) {
        return undefined;
      }

      const group = await services.repository.createGroup(name);
      groupId = group.id;
    } else {
      groupId = groupChoice.value;
    }
  } else {
    const name = await vscode.window.showInputBox({
      title: 'Create group',
      prompt: 'Enter a group name for the new issue.',
      ignoreFocusOut: true,
    });

    if (!name) {
      return undefined;
    }

    const group = await services.repository.createGroup(name);
    groupId = group.id;
  }

  const title = await vscode.window.showInputBox({
    title: 'Create issue',
    prompt: 'Enter a title for the issue.',
    ignoreFocusOut: true,
  });

  if (!title) {
    return undefined;
  }

  const description = await vscode.window.showInputBox({
    title: 'Issue description',
    prompt: 'Optional. Add a short description or notes.',
    ignoreFocusOut: true,
  });

  const status = (await promptForStatus()) ?? 'todo';
  const priority = (await promptForPriority()) ?? 'medium';

  return {
    title,
    description: description ?? '',
    groupId,
    status,
    priority,
  };
}

function extractGroupId(target: unknown): string | undefined {
  if (!target || typeof target !== 'object') {
    return undefined;
  }

  const candidate = target as { group?: { id?: unknown }; id?: unknown; contextValue?: unknown };
  if (candidate.group && typeof candidate.group.id === 'string') {
    return candidate.group.id;
  }

  if (typeof candidate.id === 'string' && candidate.contextValue === 'localIssuesGroup') {
    return candidate.id;
  }

  return undefined;
}
