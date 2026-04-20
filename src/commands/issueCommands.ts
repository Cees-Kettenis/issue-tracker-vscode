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
    vscode.commands.registerCommand('localIssues.editIssue', async (issueTarget?: unknown) => {
      await openIssueEditor(issueTarget, services);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.selectIssue', async (issueTarget?: unknown) => {
      await openIssueEditor(issueTarget, services);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.createGroup', async () => {
      try {
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
      } catch (error) {
        await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.createPerson', async () => {
      try {
        const name = await vscode.window.showInputBox({
          title: 'Create person',
          prompt: 'Enter a person name.',
          ignoreFocusOut: true,
        });

        if (!name) {
          return;
        }

        await services.repository.createPerson(name);
        await services.refreshViews();
      } catch (error) {
        await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.deleteGroup', async (groupTarget?: unknown) => {
      try {
        const resolvedGroupId = extractGroupId(groupTarget);
        if (!resolvedGroupId || resolvedGroupId === '__ungrouped__') {
          await vscode.window.showInformationMessage('Select a group first.');
          return;
        }

        const file = await services.repository.load();
        const group = file.groups.find((entry) => entry.id === resolvedGroupId);
        if (!group) {
          throw new Error(`Group "${resolvedGroupId}" could not be found.`);
        }

        const groupIssues = file.issues.filter((issue) => issue.groupId === resolvedGroupId);
        const openIssues = groupIssues.filter((issue) => issue.status !== 'done');
        const issueCount = groupIssues.length;
        const issueLabel = issueCount === 1 ? 'issue' : 'issues';

        const message =
          openIssues.length > 0
            ? `Delete "${group.name}" and its ${issueCount} ${issueLabel}? ${openIssues.length} open ${openIssues.length === 1 ? 'issue' : 'issues'} will be deleted too.`
            : `Delete "${group.name}" and its ${issueCount} ${issueLabel}?`;

        const confirmed = await vscode.window.showWarningMessage(message, { modal: true }, 'Delete');
        if (confirmed !== 'Delete') {
          return;
        }

        await services.repository.deleteGroup(resolvedGroupId);

        const currentIssueId = services.detailsProvider.getCurrentIssueId();
        const currentIssue = currentIssueId
          ? file.issues.find((issue) => issue.id === currentIssueId)
          : undefined;

        if (currentIssue && currentIssue.groupId === resolvedGroupId) {
          await services.detailsProvider.showNewIssue();
        }

        await services.refreshViews();
      } catch (error) {
        await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
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
      try {
        const presetGroupId = extractGroupId(target);
        await services.detailsProvider.showNewIssue(presetGroupId);
        await services.refreshViews();
      } catch (error) {
        await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.completeIssue', async (issueTarget?: unknown) => {
      try {
        const resolvedIssueId = await resolveIssueId(issueTarget, services.detailsProvider);
        if (!resolvedIssueId) {
          return;
        }

        await services.repository.updateIssue(resolvedIssueId, { status: 'done' });
        await services.detailsProvider.selectIssue(resolvedIssueId);
        await services.refreshViews();
      } catch (error) {
        await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.toggleHideCompleted', async () => {
      await toggleHideCompleted(services);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.showCompletedIssues', async () => {
      await setHideCompleted(services, false);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.hideCompletedIssues', async () => {
      await setHideCompleted(services, true);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('localIssues.setStatus', async (issueTarget?: unknown) => {
      const resolvedIssueId = await resolveIssueId(issueTarget, services.detailsProvider);
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
    vscode.commands.registerCommand('localIssues.setPriority', async (issueTarget?: unknown) => {
      const resolvedIssueId = await resolveIssueId(issueTarget, services.detailsProvider);
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
    vscode.commands.registerCommand('localIssues.deleteIssue', async (issueTarget?: unknown) => {
      const resolvedIssueId = await resolveIssueId(issueTarget, services.detailsProvider);
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
  issueTarget: unknown,
  detailsProvider: IssueDetailsViewProvider
): Promise<string | undefined> {
  const resolvedIssueId = extractIssueId(issueTarget) ?? detailsProvider.getCurrentIssueId();
  if (!resolvedIssueId) {
    await vscode.window.showInformationMessage('Select an issue first.');
  }

  return resolvedIssueId;
}

async function openIssueEditor(
  issueTarget: unknown,
  services: IssueCommandServices
): Promise<void> {
  const resolvedIssueId = await resolveIssueId(issueTarget, services.detailsProvider);
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

async function setHideCompleted(services: IssueCommandServices, value: boolean): Promise<void> {
  await services.settings.setHideCompleted(value);
  await vscode.commands.executeCommand('setContext', 'localIssues.hideCompleted', value);
  await services.refreshViews();
}

async function toggleHideCompleted(services: IssueCommandServices): Promise<void> {
  const current = await services.settings.getHideCompleted();
  await setHideCompleted(services, !current);
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

function extractIssueId(target: unknown): string | undefined {
  if (typeof target === 'string') {
    return target.trim() || undefined;
  }

  if (!target || typeof target !== 'object') {
    return undefined;
  }

  const candidate = target as { issue?: { id?: unknown }; id?: unknown; contextValue?: unknown };
  if (candidate.issue && typeof candidate.issue.id === 'string') {
    return candidate.issue.id;
  }

  if (typeof candidate.id === 'string' && candidate.contextValue === 'localIssuesIssue') {
    return candidate.id;
  }

  if (typeof candidate.id === 'string') {
    return candidate.id;
  }

  return undefined;
}
