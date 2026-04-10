import type { IssueInput, IssuePriority, IssueStatus, IssuesFile, IssueGroup, IssueUpdateInput } from '../models';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '../models';

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function normalizeText(value: unknown): string {
  return isString(value) ? value.trim() : '';
}

export function isIssueStatus(value: unknown): value is IssueStatus {
  return isString(value) && (ISSUE_STATUSES as readonly string[]).includes(value);
}

export function isIssuePriority(value: unknown): value is IssuePriority {
  return isString(value) && (ISSUE_PRIORITIES as readonly string[]).includes(value);
}

export function requireIssueTitle(title: unknown): string {
  const normalized = normalizeText(title);
  if (!normalized) {
    throw new Error('Issue title is required.');
  }

  return normalized;
}

export function requireGroupName(name: unknown): string {
  const normalized = normalizeText(name);
  if (!normalized) {
    throw new Error('Group name is required.');
  }

  return normalized;
}

export function normalizeIssueInput(input: IssueInput): IssueInput {
  return {
    title: requireIssueTitle(input.title),
    description: normalizeText(input.description),
    groupId: requireGroupName(input.groupId),
    status: isIssueStatus(input.status) ? input.status : 'todo',
    priority: isIssuePriority(input.priority) ? input.priority : 'medium',
  };
}

export function normalizeIssueUpdateInput(input: IssueUpdateInput): IssueUpdateInput {
  const result: IssueUpdateInput = {};

  if (input.title !== undefined) {
    result.title = requireIssueTitle(input.title);
  }

  if (input.description !== undefined) {
    result.description = normalizeText(input.description);
  }

  if (input.groupId !== undefined) {
    result.groupId = requireGroupName(input.groupId);
  }

  if (input.status !== undefined) {
    if (!isIssueStatus(input.status)) {
      throw new Error(`Invalid issue status: ${String(input.status)}`);
    }
    result.status = input.status;
  }

  if (input.priority !== undefined) {
    if (!isIssuePriority(input.priority)) {
      throw new Error(`Invalid issue priority: ${String(input.priority)}`);
    }
    result.priority = input.priority;
  }

  return result;
}

export function normalizeGroup(group: unknown): IssueGroup {
  if (!group || typeof group !== 'object') {
    throw new Error('Invalid group entry in issues file.');
  }

  const record = group as Record<string, unknown>;
  const id = normalizeText(record.id);
  const name = normalizeText(record.name);

  if (!id || !name) {
    throw new Error('Each group must have an id and a name.');
  }

  return { id, name };
}

export function normalizeIssuesFile(raw: unknown): IssuesFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('The issues file does not contain valid JSON.');
  }

  const record = raw as Record<string, unknown>;
  const version = typeof record.version === 'number' ? record.version : 1;

  const groups = Array.isArray(record.groups) ? record.groups.map(normalizeGroup) : [];

  const issues = Array.isArray(record.issues)
    ? record.issues.map((issue) => normalizeIssueRecord(issue))
    : [];

  return {
    version,
    groups,
    issues,
  };
}

function normalizeIssueRecord(issue: unknown) {
  if (!issue || typeof issue !== 'object') {
    throw new Error('Invalid issue entry in issues file.');
  }

  const record = issue as Record<string, unknown>;
  const id = normalizeText(record.id);
  const title = requireIssueTitle(record.title);
  const description = normalizeText(record.description);
  const groupId = normalizeText(record.groupId);
  const status = record.status;
  const priority = record.priority;
  const createdAt = normalizeText(record.createdAt);
  const updatedAt = normalizeText(record.updatedAt);

  if (!id || !groupId || !createdAt || !updatedAt) {
    throw new Error(`Invalid issue entry "${id || title}".`);
  }

  if (!isIssueStatus(status)) {
    throw new Error(`Invalid status for issue "${title}".`);
  }

  if (!isIssuePriority(priority)) {
    throw new Error(`Invalid priority for issue "${title}".`);
  }

  return {
    id,
    title,
    description,
    groupId,
    status,
    priority,
    createdAt,
    updatedAt,
  };
}
