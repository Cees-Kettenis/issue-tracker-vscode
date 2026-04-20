import * as vscode from 'vscode';
import type { Issue, IssuesFile } from '../models';
import { createEmptyIssuesFile } from '../models';
import { IssuesRepository } from '../services/issuesRepository';
import { IssuesSettingsService } from '../services/settings';
import { formatDueDate } from '../utils/dates';
import { sortIssuesByDueDate } from '../utils/sorting';

type AllTasksTreeNode = AllTasksIssueTreeItem | TreeMessageItem;
export type { AllTasksTreeNode };

export class AllTasksTreeProvider implements vscode.TreeDataProvider<AllTasksTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<AllTasksTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private issuesFile: IssuesFile = createEmptyIssuesFile();
  private errorMessage: string | undefined;

  constructor(
    private readonly repository: IssuesRepository,
    private readonly settings: IssuesSettingsService
  ) {}

  async refresh(): Promise<void> {
    try {
      this.issuesFile = await this.repository.load();
      this.errorMessage = undefined;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }

    this.onDidChangeTreeDataEmitter.fire();
  }

  getRevealTarget(issueId: string): AllTasksTreeNode | undefined {
    if (this.errorMessage) {
      return undefined;
    }

    const issue = this.issuesFile.issues.find((entry) => entry.id === issueId);
    return issue ? new AllTasksIssueTreeItem(issue, this.issuesFile.people) : undefined;
  }

  getTreeItem(element: AllTasksTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AllTasksTreeNode): Promise<AllTasksTreeNode[]> {
    if (this.errorMessage) {
      return [
        new TreeMessageItem(
          'Unable to load tasks',
          this.errorMessage,
          new vscode.ThemeIcon('error')
        ),
      ];
    }

    if (element) {
      return [];
    }

    const hideCompleted = await this.settings.getHideCompleted();
    return this.getRootItems(hideCompleted);
  }

  private getRootItems(hideCompleted: boolean): AllTasksTreeNode[] {
    const issues = sortIssuesByDueDate(
      hideCompleted ? this.issuesFile.issues.filter((issue) => issue.status !== 'done') : [...this.issuesFile.issues]
    );

    if (!issues.length) {
      return [
        new TreeMessageItem(
          'No tasks yet',
          'Create an issue in the Issues view first.',
          new vscode.ThemeIcon('add'),
          {
            command: 'localIssues.createIssue',
            title: 'Add Issue',
          }
        ),
      ];
    }

    return issues.map((issue) => new AllTasksIssueTreeItem(issue, this.issuesFile.people));
  }
}

class AllTasksIssueTreeItem extends vscode.TreeItem {
  constructor(public readonly issue: Issue, private readonly people: { id: string; name: string }[]) {
    super(
      `${priorityIndicator(issue.priority)} · ${getPersonLabel(issue.personId, people)} · ${formatDueDate(issue.dueDate)} · ${issue.title}`,
      vscode.TreeItemCollapsibleState.None
    );

    this.id = issue.id;
    this.contextValue = 'localIssuesAllTasksIssue';
    this.command = {
      command: 'localIssues.editIssue',
      title: 'Edit Issue',
      arguments: [issue.id],
    };
    this.tooltip = buildIssueTooltip(issue);
    this.iconPath = new vscode.ThemeIcon(issueStatusIcon(issue.status), issueStatusColor(issue.status));
  }
}

class TreeMessageItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    iconPath: vscode.ThemeIcon,
    command?: vscode.Command
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = iconPath;
    this.contextValue = 'localIssuesMessage';
    this.command = command;
  }
}

function issueStatusIcon(status: Issue['status']): string {
  switch (status) {
    case 'in-progress':
      return 'play-circle';
    case 'blocked':
      return 'error';
    case 'done':
      return 'check';
    case 'todo':
    default:
      return 'clock';
  }
}

function issueStatusColor(status: Issue['status']): vscode.ThemeColor {
  switch (status) {
    case 'in-progress':
      return new vscode.ThemeColor('charts.blue');
    case 'blocked':
      return new vscode.ThemeColor('charts.red');
    case 'done':
      return new vscode.ThemeColor('charts.green');
    case 'todo':
    default:
      return new vscode.ThemeColor('charts.yellow');
  }
}

function buildIssueTooltip(issue: Issue): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.supportThemeIcons = true;

  if (issue.description.trim()) {
    tooltip.appendMarkdown(issue.description);
  } else {
    tooltip.appendMarkdown('_No description yet._');
  }

  return tooltip;
}

function priorityIndicator(priority: Issue['priority']): string {
  switch (priority) {
    case 'low':
      return '🟢';
    case 'high':
      return '🔴';
    case 'medium':
    default:
      return '🟠';
  }
}

function getPersonLabel(personId: string | undefined, people: { id: string; name: string }[]): string {
  if (!personId) {
    return 'N/A';
  }

  return people.find((person) => person.id === personId)?.name ?? 'Unknown person';
}
