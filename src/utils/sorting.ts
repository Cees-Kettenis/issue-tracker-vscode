import type { Issue } from '../models';

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

export function sortIssues<T extends Issue>(issues: T[]): T[] {
  return [...issues].sort(compareIssues);
}
