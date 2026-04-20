import type { Issue } from '../models';

const PRIORITY_ORDER: Record<Issue['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const STATUS_ORDER: Record<Issue['status'], number> = {
  'in-progress': 0,
  blocked: 1,
  todo: 2,
  done: 3,
};

export function compareIssues(a: Issue, b: Issue): number {
  const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (statusDiff !== 0) {
    return statusDiff;
  }

  const updatedDiff = b.updatedAt.localeCompare(a.updatedAt);
  if (updatedDiff !== 0) {
    return updatedDiff;
  }

  return a.title.localeCompare(b.title);
}

export function compareIssuesByPriority(a: Issue, b: Issue): number {
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const updatedDiff = b.updatedAt.localeCompare(a.updatedAt);
  if (updatedDiff !== 0) {
    return updatedDiff;
  }

  return a.title.localeCompare(b.title);
}

export function compareIssuesByDueDate(a: Issue, b: Issue): number {
  const aHasDueDate = Boolean(a.dueDate);
  const bHasDueDate = Boolean(b.dueDate);

  if (aHasDueDate !== bHasDueDate) {
    return aHasDueDate ? -1 : 1;
  }

  if (a.dueDate && b.dueDate) {
    const dueDateDiff = a.dueDate.localeCompare(b.dueDate);
    if (dueDateDiff !== 0) {
      return dueDateDiff;
    }
  }

  return a.title.localeCompare(b.title);
}

export function sortIssues<T extends Issue>(issues: T[]): T[] {
  return [...issues].sort(compareIssues);
}

export function sortIssuesByPriority<T extends Issue>(issues: T[]): T[] {
  return [...issues].sort(compareIssuesByPriority);
}

export function sortIssuesByDueDate<T extends Issue>(issues: T[]): T[] {
  return [...issues].sort(compareIssuesByDueDate);
}
