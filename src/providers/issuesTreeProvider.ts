import * as vscode from 'vscode';
import type { Issue, IssueGroup, IssuesFile } from '../models';
import { createEmptyIssuesFile } from '../models';
import { compareIssues } from '../utils/sorting';
import { IssuesRepository } from '../services/issuesRepository';
import { IssuesSettingsService } from '../services/settings';

type IssueTreeNode = IssueGroupTreeItem | IssueTreeItem | TreeMessageItem;
export type { IssueTreeNode };

export class IssuesTreeProvider implements vscode.TreeDataProvider<IssueTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<IssueTreeNode | undefined | void>();
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

  getRevealTarget(issueId: string): IssueTreeNode | undefined {
    if (this.errorMessage) {
      return undefined;
    }

    const issue = this.issuesFile.issues.find((entry) => entry.id === issueId);
    return issue ? new IssueTreeItem(issue) : undefined;
  }

  getTreeItem(element: IssueTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: IssueTreeNode): Promise<IssueTreeNode[]> {
    if (this.errorMessage) {
      return [
        new TreeMessageItem(
          'Unable to load issues',
          this.errorMessage,
          new vscode.ThemeIcon('error')
        ),
      ];
    }

    if (!element) {
      return this.getRootItems();
    }

    if (element instanceof IssueGroupTreeItem) {
      return this.getIssuesForGroup(element.group.id);
    }

    return [];
  }

  private async getRootItems(): Promise<IssueTreeNode[]> {
    const hideCompleted = await this.settings.getHideCompleted();
    const issues = hideCompleted
      ? this.issuesFile.issues.filter((issue) => issue.status !== 'done')
      : [...this.issuesFile.issues];

    if (!this.issuesFile.groups.length && !issues.length) {
      return [
        new TreeMessageItem(
          'No groups yet',
          'Create a group to start tracking issues.',
          new vscode.ThemeIcon('symbol-folder')
        ),
      ];
    }

    const knownGroupIds = new Set(this.issuesFile.groups.map((group) => group.id));
    const orphans = issues.filter((issue) => !knownGroupIds.has(issue.groupId));
    const groupItems = this.issuesFile.groups.map((group) => new IssueGroupTreeItem(group, issues));

    if (orphans.length) {
      groupItems.push(new IssueGroupTreeItem({ id: '__ungrouped__', name: 'Ungrouped' }, issues, orphans));
    }

    return groupItems;
  }

  private async getIssuesForGroup(groupId: string): Promise<IssueTreeNode[]> {
    const hideCompleted = await this.settings.getHideCompleted();
    const issues = this.issuesFile.issues.filter((issue) => issue.groupId === groupId);
    const filtered = hideCompleted ? issues.filter((issue) => issue.status !== 'done') : issues;

    if (!filtered.length) {
      return [
        new TreeMessageItem(
          'No issues in this group',
          'Create a new issue or move one here.',
          new vscode.ThemeIcon('note')
        ),
      ];
    }

    return sortIssues(filtered).map((issue) => new IssueTreeItem(issue));
  }
}

class IssueGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly group: IssueGroup,
    private readonly allIssues: Issue[],
    private readonly overrideIssues?: Issue[]
  ) {
    const issues = overrideIssues ?? allIssues.filter((issue) => issue.groupId === group.id);
    super(
      `${group.name} (${issues.length})`,
      issues.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.id = group.id;
    this.contextValue = 'localIssuesGroup';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.description = issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Empty';
  }
}

class IssueTreeItem extends vscode.TreeItem {
  constructor(public readonly issue: Issue) {
    super(
      issue.title,
      vscode.TreeItemCollapsibleState.None
    );

    this.id = issue.id;
    this.contextValue = 'localIssuesIssue';
    this.command = {
      command: 'localIssues.selectIssue',
      title: 'Open Issue',
      arguments: [issue.id],
    };
    this.tooltip = `${issue.title}\n${issue.status} · ${issue.priority}\nUpdated ${issue.updatedAt}`;
    this.description = `${issue.status}${issue.priority === 'medium' ? '' : ` · ${issue.priority}`}`;
    this.iconPath = new vscode.ThemeIcon(issueStatusIcon(issue.status));
  }
}

class TreeMessageItem extends vscode.TreeItem {
  constructor(label: string, description: string, iconPath: vscode.ThemeIcon) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = iconPath;
    this.contextValue = 'localIssuesMessage';
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
      return 'circle-large-outline';
  }
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(compareIssues);
}
