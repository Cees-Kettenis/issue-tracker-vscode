import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { Issue, IssuePerson, IssuesFile } from '../models';
import { createEmptyIssuesFile } from '../models';
import { formatDueDate } from '../utils/dates';
import { renderMarkdown } from '../utils/markdown';
import { escapeHtml } from '../utils/strings';
import { sortIssuesByDueDate } from '../utils/sorting';
import { IssuesRepository } from '../services/issuesRepository';
import { IssuesSettingsService } from '../services/settings';

type AllTasksViewMessage =
  | { type: 'save'; payload: Record<string, unknown> }
  | { type: 'refresh' }
  | { type: 'trace'; payload?: { message?: unknown } }
  | { type: 'webviewError'; payload?: { message?: unknown } };

interface AllTasksViewState {
  issuesFile: IssuesFile;
  storePath?: string;
  error?: string;
}

export class AllTasksViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private issuesFile: IssuesFile = createEmptyIssuesFile();
  private errorMessage: string | undefined;

  constructor(
    private readonly repository: IssuesRepository,
    private readonly settings: IssuesSettingsService,
    private readonly refreshViews: () => Promise<void>,
    private readonly log: (message: string) => void = () => undefined
  ) {}

  async refresh(): Promise<void> {
    try {
      this.issuesFile = await this.repository.load();
      this.errorMessage = undefined;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }

    if (this.view) {
      this.view.webview.html = this.getHtml(await this.buildState());
    }
  }

  resolveWebviewView(view: vscode.WebviewView): void | Thenable<void> {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
    };

    view.webview.onDidReceiveMessage(async (message: AllTasksViewMessage) => {
      try {
        this.log(`allTasks.message -> ${String(message?.type ?? 'unknown')}`);
        switch (message?.type) {
          case 'save':
            await this.saveIssue(message.payload);
            break;
          case 'refresh':
            await this.refresh();
            break;
          case 'trace':
            this.log(`allTasks.trace -> ${String(message?.payload?.message ?? 'unknown')}`);
            break;
          case 'webviewError':
            this.log(`allTasks.error -> ${String(message?.payload?.message ?? 'unknown')}`);
            break;
          default:
            break;
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(messageText);
      }
    });

    void this.render();
  }

  private async render(): Promise<void> {
    if (!this.view) {
      return;
    }

    this.view.webview.html = this.getHtml(await this.buildState());
  }

  private async buildState(): Promise<AllTasksViewState> {
    if (this.errorMessage) {
      return {
        issuesFile: this.issuesFile,
        storePath: undefined,
        error: this.errorMessage,
      };
    }

    try {
      const file = await this.repository.load();
      this.issuesFile = file;
      return {
        issuesFile: file,
        storePath: await this.settings.resolveCurrentStorePath(),
      };
    } catch (error) {
      return {
        issuesFile: this.issuesFile,
        storePath: undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async saveIssue(payload: Record<string, unknown>): Promise<void> {
    const issueId = String(payload.issueId ?? '').trim();
    if (!issueId) {
      throw new Error('Missing issue id.');
    }

    const title = String(payload.title ?? '').trim();
    const description = String(payload.description ?? '').trim();
    const groupId = String(payload.groupId ?? '').trim();
    const status = String(payload.status ?? 'todo');
    const priority = String(payload.priority ?? 'medium');
    const dueDate = String(payload.dueDate ?? '').trim();
    const personId = String(payload.personId ?? '').trim();

    if (!title) {
      throw new Error('Issue title is required.');
    }

    if (!groupId) {
      throw new Error('Choose a group before saving the issue.');
    }

    const updated = await this.repository.updateIssue(issueId, {
      title,
      description,
      groupId,
      status: status as Issue['status'],
      priority: priority as Issue['priority'],
      dueDate,
      personId,
    });

    this.log(`allTasks.save -> ${updated.id}`);
    await this.refreshViews();
    await this.render();
  }

  private getHtml(state: AllTasksViewState): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const webviewScript = this.getWebviewScript();
    const issueRows = sortIssuesByDueDate(state.issuesFile.issues).map((issue) => this.renderIssueRow(issue, state.issuesFile));
    const errorBanner = state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : '';

    return /* html */ `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta
            http-equiv="Content-Security-Policy"
            content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
          />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style nonce="${nonce}">
            :root {
              color-scheme: light dark;
              --bg: var(--vscode-editor-background);
              --fg: var(--vscode-foreground);
              --muted: var(--vscode-descriptionForeground);
              --border: var(--vscode-editorWidget-border);
              --input: var(--vscode-input-background);
              --input-fg: var(--vscode-input-foreground);
              --button: var(--vscode-button-background);
              --button-fg: var(--vscode-button-foreground);
              --button-hover: var(--vscode-button-hoverBackground);
            }
            body {
              margin: 0;
              padding: 12px;
              background: var(--bg);
              color: var(--fg);
              font-family: var(--vscode-font-family);
              font-size: var(--vscode-font-size);
            }
            h2 {
              margin: 0 0 8px;
              font-size: 1.1rem;
            }
            p {
              margin: 0 0 12px;
              color: var(--muted);
            }
            .error {
              padding: 10px 12px;
              border-radius: 6px;
              background: color-mix(in srgb, var(--vscode-errorForeground) 14%, transparent);
              color: var(--vscode-errorForeground);
              margin-bottom: 12px;
            }
            .empty {
              padding: 16px;
              border: 1px dashed var(--border);
              border-radius: 8px;
              color: var(--muted);
            }
            .summary {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              margin-bottom: 12px;
              flex-wrap: wrap;
            }
            .summary .count {
              color: var(--muted);
              font-size: 0.9rem;
            }
            .list {
              display: grid;
              gap: 12px;
            }
            .issue-row {
              border: 1px solid var(--border);
              border-radius: 10px;
              background: color-mix(in srgb, var(--bg) 88%, var(--fg) 12%);
              display: grid;
              gap: 0;
              overflow: hidden;
            }
            .issue-row-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              padding: 12px;
              border-bottom: 1px solid var(--border);
            }
            .issue-row-title {
              font-weight: 600;
              margin: 0;
            }
            .issue-row-meta {
              color: var(--muted);
              font-size: 0.85rem;
            }
            .issue-row-status {
              width: 10px;
              height: 10px;
              border-radius: 999px;
              flex: 0 0 auto;
              background: var(--priority-color);
              box-shadow: 0 0 0 2px color-mix(in srgb, var(--priority-color) 22%, transparent);
            }
            .issue-row-status.priority-low {
              --priority-color: var(--vscode-charts-green);
            }
            .issue-row-status.priority-medium {
              --priority-color: var(--vscode-charts-orange);
            }
            .issue-row-status.priority-high {
              --priority-color: var(--vscode-charts-red);
            }
            .issue-row-body {
              display: grid;
              gap: 10px;
              padding: 12px;
            }
            .grid {
              display: grid;
              gap: 10px;
              grid-template-columns: repeat(3, minmax(0, 1fr));
            }
            .grid.two {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            label {
              display: grid;
              gap: 6px;
              font-size: 0.9rem;
            }
            input,
            select,
            textarea {
              width: 100%;
              box-sizing: border-box;
              border: 1px solid var(--border);
              background: var(--input);
              color: var(--input-fg);
              border-radius: 6px;
              padding: 8px 10px;
              font: inherit;
            }
            textarea {
              min-height: 88px;
              resize: vertical;
            }
            .actions {
              display: flex;
              justify-content: flex-end;
            }
            button {
              border: 0;
              border-radius: 6px;
              padding: 8px 12px;
              font: inherit;
              background: var(--button);
              color: var(--button-fg);
              cursor: pointer;
            }
            button:hover {
              background: var(--button-hover);
            }
            .description {
              color: var(--muted);
              font-size: 0.9rem;
              line-height: 1.45;
            }
            .description .markdown > :first-child {
              margin-top: 0;
            }
            .description .markdown > :last-child {
              margin-bottom: 0;
            }
            .description .markdown p,
            .description .markdown ul,
            .description .markdown ol,
            .description .markdown blockquote,
            .description .markdown pre {
              margin: 0;
            }
            .description .markdown ul,
            .description .markdown ol {
              padding-left: 20px;
            }
          </style>
        </head>
        <body>
          <h2>All Tasks</h2>
          <p>Tasks are ordered by due date. Edit existing rows and save them in place.</p>
          ${errorBanner}
          <div class="summary">
            <div class="count">${issueRows.length} task${issueRows.length === 1 ? '' : 's'}</div>
            <div class="count">${escapeHtml(state.storePath ?? '')}</div>
          </div>
          ${
            issueRows.length
              ? `<div class="list">${issueRows.join('')}</div>`
              : `<div class="empty">No tasks yet. Create a few issues in the details view first.</div>`
          }
          <script nonce="${nonce}">${webviewScript}</script>
        </body>
      </html>
    `;
  }

  private renderIssueRow(issue: Issue, file: IssuesFile): string {
    const groupSelectOptions = [
      '<option value="">Choose group</option>',
      ...file.groups.map(
        (group) => `<option value="${escapeHtml(group.id)}"${group.id === issue.groupId ? ' selected' : ''}>${escapeHtml(group.name)}</option>`
      ),
    ].join('');
    const personOptions = [
      `<option value=""${!issue.personId ? ' selected' : ''}>N/A</option>`,
      ...file.people.map(
        (person) =>
          `<option value="${escapeHtml(person.id)}"${person.id === issue.personId ? ' selected' : ''}>${escapeHtml(person.name)}</option>`
      ),
    ];
    if (issue.personId && !file.people.some((person) => person.id === issue.personId)) {
      personOptions.splice(
        1,
        0,
        `<option value="${escapeHtml(issue.personId)}" selected>Unknown person (${escapeHtml(issue.personId)})</option>`
      );
    }
    const selectedDueDate = issue.dueDate ?? '';
    const description = issue.description.trim()
      ? renderMarkdown(issue.description)
      : '<p class="empty">No description yet.</p>';

    return /* html */ `
      <form class="issue-row" data-issue-id="${escapeHtml(issue.id)}">
        <div class="issue-row-header">
          <div>
            <div class="issue-row-title">
              <span class="issue-row-status priority-${issue.priority}" aria-hidden="true"></span>
              ${escapeHtml(issue.title)}
            </div>
            <div class="issue-row-meta">${escapeHtml(issue.status)} · ${escapeHtml(this.resolvePersonName(issue.personId, file.people))}</div>
          </div>
          <div class="issue-row-meta">${escapeHtml(formatDueDate(issue.dueDate))}</div>
        </div>
        <div class="issue-row-body">
          <div class="grid">
            <label>
              Title
              <input name="title" type="text" value="${escapeHtml(issue.title)}" />
            </label>
            <label>
              Status
              <select name="status">
                ${this.renderStatusOptions(issue.status)}
              </select>
            </label>
            <label>
              Priority
              <select name="priority">
                ${this.renderPriorityOptions(issue.priority)}
              </select>
            </label>
          </div>
          <div class="grid two">
            <label>
              Group
              <select name="groupId">
                ${groupSelectOptions}
              </select>
            </label>
            <label>
              Assigned To
              <select name="personId">
                ${personOptions.join('')}
              </select>
            </label>
          </div>
          <div class="grid two">
            <label>
              Due date
              <input name="dueDate" type="date" value="${escapeHtml(selectedDueDate)}" />
            </label>
            <div class="description">
              <div class="markdown">${description}</div>
            </div>
          </div>
          <label>
            Description
            <textarea name="description">${escapeHtml(issue.description)}</textarea>
          </label>
          <div class="actions">
            <button type="submit">Save</button>
          </div>
        </div>
      </form>
    `;
  }

  private renderStatusOptions(selectedStatus: Issue['status']): string {
    return ['todo', 'in-progress', 'blocked', 'done']
      .map((status) => `<option value="${status}"${status === selectedStatus ? ' selected' : ''}>${status}</option>`)
      .join('');
  }

  private renderPriorityOptions(selectedPriority: Issue['priority']): string {
    return ['low', 'medium', 'high']
      .map((priority) => `<option value="${priority}"${priority === selectedPriority ? ' selected' : ''}>${priority}</option>`)
      .join('');
  }

  private resolvePersonName(personId: string | undefined, people: IssuePerson[]): string {
    if (!personId) {
      return 'Unassigned';
    }

    return people.find((person) => person.id === personId)?.name ?? 'Unknown person';
  }

  private getWebviewScript(): string {
    return String.raw`
const vscode = acquireVsCodeApi();

function trace(message) {
  vscode.postMessage({ type: 'trace', payload: { message } });
}

function postSave(form) {
  const data = new FormData(form);
  vscode.postMessage({
    type: 'save',
    payload: {
      issueId: form.dataset.issueId,
      title: data.get('title'),
      description: data.get('description'),
      groupId: data.get('groupId'),
      status: data.get('status'),
      priority: data.get('priority'),
      dueDate: data.get('dueDate'),
      personId: data.get('personId')
    }
  });
}

trace('script-start');

window.addEventListener('error', (event) => {
  vscode.postMessage({
    type: 'webviewError',
    payload: {
      message: event.message || 'Unknown script error',
    }
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
  vscode.postMessage({ type: 'webviewError', payload: { message: reason } });
});

document.addEventListener('DOMContentLoaded', () => {
  trace('ready');
  for (const form of document.querySelectorAll('form.issue-row')) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      trace('submit:' + form.dataset.issueId);
      postSave(form);
    });
  }
});
`;
  }
}
