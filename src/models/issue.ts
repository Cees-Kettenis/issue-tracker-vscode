export const ISSUE_STATUSES = ['todo', 'in-progress', 'blocked', 'done'] as const;
export const ISSUE_PRIORITIES = ['low', 'medium', 'high'] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export interface IssueGroup {
  id: string;
  name: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  groupId: string;
  status: IssueStatus;
  priority: IssuePriority;
  createdAt: string;
  updatedAt: string;
}

export interface IssueInput {
  title: string;
  description: string;
  groupId: string;
  status: IssueStatus;
  priority: IssuePriority;
}

export interface IssueUpdateInput {
  title?: string;
  description?: string;
  groupId?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
}

export interface IssuesFile {
  version: number;
  groups: IssueGroup[];
  issues: Issue[];
}

export const DEFAULT_ISSUES_FILE_VERSION = 1;

export function createEmptyIssuesFile(): IssuesFile {
  return {
    version: DEFAULT_ISSUES_FILE_VERSION,
    groups: [],
    issues: [],
  };
}
