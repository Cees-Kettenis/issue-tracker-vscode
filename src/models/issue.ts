export const ISSUE_STATUSES = ['todo', 'in-progress', 'blocked', 'done'] as const;
export const ISSUE_PRIORITIES = ['low', 'medium', 'high'] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

/**
 * Local Issues persists a single JSON document per workspace.
 *
 * Schema notes:
 * - `version` tracks the file format and currently uses `1`
 * - `groups` always contains `{ id, name }` entries
 * - `issues` always contains the full issue records below
 * - `status` is limited to `todo`, `in-progress`, `blocked`, or `done`
 * - `priority` is limited to `low`, `medium`, or `high`
 *
 * Future schema changes should keep older versions readable through a
 * migration step in the repository/validation layer.
 */
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

/**
 * Seed value used when a workspace does not yet have an issues file.
 */
export const DEFAULT_ISSUES_FILE_VERSION = 1;

export function createEmptyIssuesFile(): IssuesFile {
  return {
    version: DEFAULT_ISSUES_FILE_VERSION,
    groups: [],
    issues: [],
  };
}
