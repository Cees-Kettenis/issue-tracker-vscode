import * as fs from 'fs/promises';
import * as path from 'path';
import {
  createEmptyIssuesFile,
  type Issue,
  type IssueGroup,
  type IssueInput,
  type IssuePerson,
  type IssuesFile,
  type IssueUpdateInput,
} from '../models';
import { createId } from '../utils/ids';
import { nowIso } from '../utils/time';
import {
  normalizeIssueInput,
  normalizeIssueUpdateInput,
  normalizeIssuesFile,
  requireGroupName,
  requirePersonName,
} from '../utils/validation';
import { slugify } from '../utils/strings';
import { IssuesSettingsService } from './settings';

export class IssuesRepository {
  constructor(
    private readonly settings: IssuesSettingsService,
    private readonly log: (message: string) => void = () => undefined
  ) {}

  async load(): Promise<IssuesFile> {
    const storePath = await this.settings.resolveCurrentStorePath();
    this.log(`repository.load -> ${storePath}`);
    const file = await this.readStoreFile(storePath, true);
    this.log(`repository.load <- ${storePath} (groups=${file.groups.length}, issues=${file.issues.length})`);
    return file;
  }

  async save(file: IssuesFile): Promise<IssuesFile> {
    const storePath = await this.settings.resolveCurrentStorePath();
    this.log(`repository.save -> ${storePath} (groups=${file.groups.length}, issues=${file.issues.length})`);
    await this.writeStoreFile(storePath, file);
    this.log(`repository.save <- ${storePath}`);
    return file;
  }

  async refresh(): Promise<IssuesFile> {
    return this.load();
  }

  async importFromFile(sourcePath: string): Promise<IssuesFile> {
    const imported = await this.readStoreFile(sourcePath, false, 'import');
    await this.save(imported);
    return imported;
  }

  async exportToFile(targetPath: string): Promise<IssuesFile> {
    const current = await this.load();
    await this.writeStoreFile(targetPath, current);
    return current;
  }

  async createGroup(name: string): Promise<IssueGroup> {
    const file = await this.load();
    const groupName = requireGroupName(name);
    this.log(`repository.createGroup -> "${groupName}"`);

    const existing = file.groups.find((group) => group.name.toLowerCase() === groupName.toLowerCase());
    if (existing) {
      this.log(`repository.createGroup <- existing ${existing.id}`);
      return existing;
    }

    const baseId = slugify(groupName) || 'group';
    const groupId = this.ensureUniqueId(baseId, file.groups.map((group) => group.id));
    const group: IssueGroup = { id: groupId, name: groupName };

    file.groups.push(group);
    await this.save(file);
    this.log(`repository.createGroup <- ${group.id}`);
    return group;
  }

  async createPerson(name: string): Promise<IssuePerson> {
    const file = await this.load();
    const personName = requirePersonName(name);
    this.log(`repository.createPerson -> "${personName}"`);

    const existing = file.people.find((person) => person.name.toLowerCase() === personName.toLowerCase());
    if (existing) {
      this.log(`repository.createPerson <- existing ${existing.id}`);
      return existing;
    }

    const baseId = slugify(personName) || 'person';
    const personId = this.ensureUniqueId(baseId, file.people.map((person) => person.id));
    const person: IssuePerson = { id: personId, name: personName };

    file.people.push(person);
    await this.save(file);
    this.log(`repository.createPerson <- ${person.id}`);
    return person;
  }

  async deleteGroup(groupId: string): Promise<void> {
    const file = await this.load();
    this.log(`repository.deleteGroup -> ${groupId}`);

    const groupIndex = file.groups.findIndex((group) => group.id === groupId);
    if (groupIndex < 0) {
      throw new Error(`Group "${groupId}" could not be found.`);
    }

    file.groups.splice(groupIndex, 1);
    file.issues = file.issues.filter((issue) => issue.groupId !== groupId);
    await this.save(file);
    this.log(`repository.deleteGroup <- ${groupId}`);
  }

  async createIssue(input: IssueInput): Promise<Issue> {
    const file = await this.load();
    const normalized = normalizeIssueInput(input);
    this.log(
      `repository.createIssue -> title="${normalized.title}" groupId=${normalized.groupId} status=${normalized.status} priority=${normalized.priority} dueDate=${normalized.dueDate ?? '(none)'} personId=${normalized.personId ?? '(none)'}`
    );
    const group = file.groups.find((entry) => entry.id === normalized.groupId);

    if (!group) {
      throw new Error(`Unknown group id "${normalized.groupId}". Create the group first.`);
    }

    if (normalized.personId) {
      const personExists = file.people.some((person) => person.id === normalized.personId);
      if (!personExists) {
        throw new Error(`Unknown person id "${normalized.personId}". Create the person first.`);
      }
    }

    const timestamp = nowIso();
    const issue: Issue = {
      id: createId('iss'),
      title: normalized.title,
      description: normalized.description,
      groupId: normalized.groupId,
      status: normalized.status,
      priority: normalized.priority,
      dueDate: normalized.dueDate,
      personId: normalized.personId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    file.issues.push(issue);
    await this.save(file);
    this.log(`repository.createIssue <- ${issue.id}`);
    return issue;
  }

  async updateIssue(issueId: string, patch: IssueUpdateInput): Promise<Issue> {
    const file = await this.load();
    this.log(`repository.updateIssue -> ${issueId}`);
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

    if (normalized.personId) {
      const personExists = file.people.some((person) => person.id === normalized.personId);
      if (!personExists) {
        throw new Error(`Unknown person id "${normalized.personId}".`);
      }
    }

    const updated: Issue = {
      ...current,
      ...normalized,
      updatedAt: nowIso(),
    };

    file.issues[index] = updated;
    await this.save(file);
    this.log(`repository.updateIssue <- ${updated.id}`);
    return updated;
  }

  async deleteIssue(issueId: string): Promise<void> {
    const file = await this.load();
    this.log(`repository.deleteIssue -> ${issueId}`);
    const filtered = file.issues.filter((issue) => issue.id !== issueId);

    if (filtered.length === file.issues.length) {
      throw new Error(`Issue "${issueId}" could not be found.`);
    }

    file.issues = filtered;
    await this.save(file);
    this.log(`repository.deleteIssue <- ${issueId}`);
  }

  async getIssue(issueId: string): Promise<Issue | undefined> {
    const file = await this.load();
    this.log(`repository.getIssue -> ${issueId}`);
    return file.issues.find((issue) => issue.id === issueId);
  }

  private async readStoreFile(
    storePath: string,
    seedIfMissing: boolean,
    actionLabel: 'load' | 'import' = 'load'
  ): Promise<IssuesFile> {
    if (seedIfMissing) {
      await this.ensureSeedFile(storePath);
    }

    try {
      const raw = await fs.readFile(storePath, 'utf8');
      return normalizeIssuesFile(JSON.parse(raw));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Local Issues could not ${actionLabel} "${storePath}" because it contains invalid JSON. Fix the file or delete it to recreate an empty store.`
        );
      }

      if (error instanceof Error) {
        if ('code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          if (actionLabel === 'import') {
            throw new Error(`Local Issues could not import "${storePath}" because the file does not exist.`);
          }

          throw new Error(`Local Issues could not load "${storePath}" because the file does not exist.`);
        }

        throw error;
      }

      throw new Error(`Local Issues could not ${actionLabel} the issues file.`);
    }
  }

  private async ensureSeedFile(storePath: string): Promise<void> {
    try {
      await fs.access(storePath);
    } catch {
      await this.writeStoreFile(storePath, createEmptyIssuesFile());
    }
  }

  private async writeStoreFile(filePath: string, file: IssuesFile): Promise<void> {
    await this.writeAtomic(filePath, JSON.stringify(file, null, 2) + '\n');
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
