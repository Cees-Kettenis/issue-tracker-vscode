import * as fs from 'fs/promises';
import * as path from 'path';
import { createEmptyIssuesFile, type Issue, type IssueGroup, type IssuesFile, type IssueInput, type IssueUpdateInput } from '../models';
import { createId } from '../utils/ids';
import { nowIso } from '../utils/time';
import { normalizeIssueInput, normalizeIssueUpdateInput, normalizeIssuesFile, requireGroupName } from '../utils/validation';
import { slugify } from '../utils/strings';
import { IssuesSettingsService } from './settings';

export class IssuesRepository {
  constructor(private readonly settings: IssuesSettingsService) {}

  async load(): Promise<IssuesFile> {
    const storePath = await this.settings.resolveCurrentStorePath();
    await this.ensureSeedFile(storePath);

    try {
      const raw = await fs.readFile(storePath, 'utf8');
      return normalizeIssuesFile(JSON.parse(raw));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Local Issues could not parse "${storePath}" because it contains invalid JSON. Fix the file or delete it to recreate an empty store.`
        );
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Local Issues could not read the issues file.');
    }
  }

  async save(file: IssuesFile): Promise<IssuesFile> {
    const storePath = await this.settings.resolveCurrentStorePath();
    await this.writeAtomic(storePath, JSON.stringify(file, null, 2) + '\n');
    return file;
  }

  async refresh(): Promise<IssuesFile> {
    return this.load();
  }

  async createGroup(name: string): Promise<IssueGroup> {
    const file = await this.load();
    const groupName = requireGroupName(name);

    const existing = file.groups.find((group) => group.name.toLowerCase() === groupName.toLowerCase());
    if (existing) {
      return existing;
    }

    const baseId = slugify(groupName) || 'group';
    const groupId = this.ensureUniqueId(baseId, file.groups.map((group) => group.id));
    const group: IssueGroup = { id: groupId, name: groupName };

    file.groups.push(group);
    await this.save(file);
    return group;
  }

  async createIssue(input: IssueInput): Promise<Issue> {
    const file = await this.load();
    const normalized = normalizeIssueInput(input);
    const group = file.groups.find((entry) => entry.id === normalized.groupId);

    if (!group) {
      throw new Error(`Unknown group id "${normalized.groupId}". Create the group first.`);
    }

    const timestamp = nowIso();
    const issue: Issue = {
      id: createId('iss'),
      title: normalized.title,
      description: normalized.description,
      groupId: normalized.groupId,
      status: normalized.status,
      priority: normalized.priority,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    file.issues.push(issue);
    await this.save(file);
    return issue;
  }

  async updateIssue(issueId: string, patch: IssueUpdateInput): Promise<Issue> {
    const file = await this.load();
    const index = file.issues.findIndex((issue) => issue.id === issueId);

    if (index < 0) {
      throw new Error(`Issue "${issueId}" could not be found.`);
    }

    const normalized = normalizeIssueUpdateInput(patch);
    const current = file.issues[index];

    if (normalized.groupId) {
      const groupExists = file.groups.some((group) => group.id === normalized.groupId);
      if (!groupExists) {
        throw new Error(`Unknown group id "${normalized.groupId}".`);
      }
    }

    const updated: Issue = {
      ...current,
      ...normalized,
      updatedAt: nowIso(),
    };

    file.issues[index] = updated;
    await this.save(file);
    return updated;
  }

  async deleteIssue(issueId: string): Promise<void> {
    const file = await this.load();
    const filtered = file.issues.filter((issue) => issue.id !== issueId);

    if (filtered.length === file.issues.length) {
      throw new Error(`Issue "${issueId}" could not be found.`);
    }

    file.issues = filtered;
    await this.save(file);
  }

  async getIssue(issueId: string): Promise<Issue | undefined> {
    const file = await this.load();
    return file.issues.find((issue) => issue.id === issueId);
  }

  private async ensureSeedFile(storePath: string): Promise<void> {
    try {
      await fs.access(storePath);
    } catch {
      await this.writeAtomic(storePath, JSON.stringify(createEmptyIssuesFile(), null, 2) + '\n');
    }
  }

  private ensureUniqueId(baseId: string, existingIds: string[]): string {
    if (!existingIds.includes(baseId)) {
      return baseId;
    }

    let suffix = 2;
    while (existingIds.includes(`${baseId}-${suffix}`)) {
      suffix += 1;
    }

    return `${baseId}-${suffix}`;
  }

  private async writeAtomic(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');

    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.rm(filePath, { force: true });
      await fs.rename(tempPath, filePath);
    }
  }
}
