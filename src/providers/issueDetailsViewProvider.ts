import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { Issue, IssueGroup, IssuePriority, IssueStatus } from '../models';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '../models';
import { renderMarkdown } from '../utils/markdown';
import { escapeHtml } from '../utils/strings';
import { IssuesRepository } from '../services/issuesRepository';
import { IssuesTreeProvider } from './issuesTreeProvider';

interface IssueFormState {
  mode: 'create' | 'edit';
  issue: Issue | undefined;
  groups: IssueGroup[];
  error?: string;
}

export class IssueDetailsViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private selectedIssueId: string | undefined;
  private mode: 'create' | 'edit' = 'create';

  constructor(
    private readonly repository: IssuesRepository,
    private readonly treeProvider: IssuesTreeProvider
  ) {}

  getCurrentIssueId(): string | undefined {
    return this.selectedIssueId;
  }

  async selectIssue(issueId: string | undefined): Promise<void> {
    this.selectedIssueId = issueId;
    this.mode = issueId ? 'edit' : 'create';
    await this.render();
  }

  async showNewIssue(): Promise<void> {
    this.selectedIssueId = undefined;
    this.mode = 'create';
    await this.render();
  }

  async refresh(): Promise<void> {
    await this.render();
  }

  resolveWebviewView(view: vscode.WebviewView): void | Thenable<void> {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
    };

    view.webview.onDidReceiveMessage(async (message) => {
      try {
        switch (message?.type) {
          case 'save':
            await this.saveFromWebview(message.payload as Record<string, unknown>);
            break;
          case 'delete':
            await this.deleteSelectedIssue();
            break;
          case 'newIssue':
            await this.showNewIssue();
            break;
          case 'refresh':
            await this.refresh();
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

    const viewModel = await this.buildState();
    this.view.webview.html = this.getHtml(viewModel);
  }

  private async buildState(): Promise<IssueFormState> {
    try {
      const file = await this.repository.load();
      const issue = this.selectedIssueId
        ? file.issues.find((entry) => entry.id === this.selectedIssueId)
        : undefined;

      if (this.mode === 'edit' && this.selectedIssueId && !issue) {
        this.selectedIssueId = undefined;
        this.mode = 'create';
      }

      return {
        mode: this.mode,
        issue,
        groups: file.groups,
      };
    } catch (error) {
      return {
        mode: this.mode,
        issue: undefined,
        groups: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async saveFromWebview(payload: Record<string, unknown>): Promise<void> {
    const title = String(payload.title ?? '').trim();
    const description = String(payload.description ?? '').trim();
    const groupId = String(payload.groupId ?? '').trim();
    const status = String(payload.status ?? 'todo') as IssueStatus;
    const priority = String(payload.priority ?? 'medium') as IssuePriority;

    if (!title) {
      throw new Error('Issue title is required.');
    }

    const file = await this.repository.load();
    const currentIssue = this.selectedIssueId
      ? file.issues.find((entry) => entry.id === this.selectedIssueId)
      : undefined;

    if (!groupId) {
      throw new Error('Choose a group before saving the issue.');
    }

    if (currentIssue && this.mode === 'edit') {
      const updated = await this.repository.updateIssue(currentIssue.id, {
        title,
        description,
        groupId,
        status,
        priority,
      });
      this.selectedIssueId = updated.id;
    } else {
      const created = await this.repository.createIssue({
        title,
        description,
        groupId,
        status,
        priority,
      });
      this.selectedIssueId = created.id;
      this.mode = 'edit';
    }

    await this.treeProvider.refresh();
    await this.render();
  }

  private async deleteSelectedIssue(): Promise<void> {
    if (!this.selectedIssueId) {
      return;
    }

    const confirmation = await vscode.window.showWarningMessage(
      'Delete the selected issue?',
      { modal: true },
      'Delete'
    );

    if (confirmation !== 'Delete') {
      return;
    }

    await this.repository.deleteIssue(this.selectedIssueId);
    this.selectedIssueId = undefined;
    this.mode = 'create';
    await this.treeProvider.refresh();
    await this.render();
  }

  private getHtml(state: IssueFormState): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const issue = state.issue;
    const selectedGroupId = issue?.groupId ?? state.groups[0]?.id ?? '';
    const selectedStatus = issue?.status ?? 'todo';
    const selectedPriority = issue?.priority ?? 'medium';

    const title = issue ? `Editing ${escapeHtml(issue.title)}` : 'Create a new issue';
    const intro = state.error
      ? `<p class="error">${escapeHtml(state.error)}</p>`
      : issue
        ? `<p>Update the selected issue or use "New issue" to start over.</p>`
        : `<p>Create a new issue in the currently open workspace.</p>`;

    const groupOptions = state.groups.length
      ? state.groups
          .map((group) => `<option value="${escapeHtml(group.id)}"${group.id === selectedGroupId ? ' selected' : ''}>${escapeHtml(group.name)}</option>`)
          .join('')
      : '<option value="">No groups available</option>';

    const statusOptions = ISSUE_STATUSES.map(
      (status) => `<option value="${status}"${status === selectedStatus ? ' selected' : ''}>${status}</option>`
    ).join('');

    const priorityOptions = ISSUE_PRIORITIES.map(
      (priority) => `<option value="${priority}"${priority === selectedPriority ? ' selected' : ''}>${priority}</option>`
    ).join('');

    const createdAt = issue ? `<div class="meta">Created: ${escapeHtml(issue.createdAt)}</div>` : '';
    const updatedAt = issue ? `<div class="meta">Updated: ${escapeHtml(issue.updatedAt)}</div>` : '';
    const descriptionPreview = issue?.description
      ? renderMarkdown(issue.description)
      : '<p class="empty">No description yet. Add Markdown in the textarea to preview it here.</p>';

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
            form {
              display: grid;
              gap: 10px;
            }
            label {
              display: grid;
              gap: 6px;
              font-size: 0.9rem;
            }
            input,
            textarea,
            select {
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
              min-height: 120px;
              resize: vertical;
            }
            .row {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px;
            }
            .actions {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
            }
            .preview {
              display: grid;
              gap: 6px;
              padding: 12px;
              border: 1px solid var(--border);
              border-radius: 8px;
              background: color-mix(in srgb, var(--bg) 82%, var(--fg) 18%);
            }
            .preview h3 {
              margin: 0;
              font-size: 0.9rem;
              color: var(--muted);
              text-transform: uppercase;
              letter-spacing: 0.06em;
            }
            .preview .markdown {
              display: grid;
              gap: 8px;
              line-height: 1.5;
            }
            .preview .markdown > :first-child {
              margin-top: 0;
            }
            .preview .markdown > :last-child {
              margin-bottom: 0;
            }
            .preview .markdown h1,
            .preview .markdown h2,
            .preview .markdown h3,
            .preview .markdown h4,
            .preview .markdown h5,
            .preview .markdown h6,
            .preview .markdown p,
            .preview .markdown blockquote,
            .preview .markdown pre,
            .preview .markdown ul,
            .preview .markdown ol {
              margin: 0;
            }
            .preview .markdown h1 {
              font-size: 1.4rem;
            }
            .preview .markdown h2 {
              font-size: 1.25rem;
            }
            .preview .markdown h3 {
              font-size: 1.1rem;
            }
            .preview .markdown h4,
            .preview .markdown h5,
            .preview .markdown h6 {
              font-size: 1rem;
            }
            .preview .markdown blockquote {
              padding-left: 12px;
              border-left: 3px solid var(--border);
              color: var(--muted);
            }
            .preview .markdown code {
              padding: 0 4px;
              border-radius: 4px;
              background: color-mix(in srgb, var(--bg) 74%, var(--fg) 26%);
            }
            .preview .markdown pre {
              overflow: auto;
              padding: 10px;
              border-radius: 8px;
              background: color-mix(in srgb, var(--bg) 68%, var(--fg) 32%);
            }
            .preview .markdown pre code {
              padding: 0;
              background: transparent;
            }
            .preview .markdown ul,
            .preview .markdown ol {
              padding-left: 20px;
            }
            .preview .empty {
              color: var(--muted);
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
            button.secondary {
              background: transparent;
              color: var(--fg);
              border: 1px solid var(--border);
            }
            button.secondary:hover {
              background: color-mix(in srgb, var(--bg) 80%, var(--fg) 20%);
            }
            .error {
              padding: 10px 12px;
              border-radius: 6px;
              background: color-mix(in srgb, var(--vscode-errorForeground) 14%, transparent);
              color: var(--vscode-errorForeground);
            }
            .meta {
              color: var(--muted);
              font-size: 0.8rem;
            }
          </style>
        </head>
        <body>
          <h2>${title}</h2>
          ${intro}
          ${createdAt}
          ${updatedAt}
          <form id="issue-form">
            <label>
              Title
              <input id="title" name="title" type="text" value="${escapeHtml(issue?.title ?? '')}" placeholder="Fix login redirect" />
            </label>
            <label>
              Description
              <textarea id="description" name="description" placeholder="Add notes, steps, or acceptance criteria.">${escapeHtml(issue?.description ?? '')}</textarea>
            </label>
            <section class="preview" aria-label="Description preview">
              <h3>Description Preview</h3>
              <div id="description-preview" class="markdown">${descriptionPreview}</div>
            </section>
            <div class="row">
              <label>
                Group
                <select id="groupId" name="groupId">
                  ${groupOptions}
                </select>
              </label>
              <label>
                Status
                <select id="status" name="status">
                  ${statusOptions}
                </select>
              </label>
            </div>
            <label>
              Priority
              <select id="priority" name="priority">
                ${priorityOptions}
              </select>
            </label>
            <div class="actions">
              <button type="submit">${issue ? 'Save issue' : 'Create issue'}</button>
              <button type="button" id="new-issue" class="secondary">New issue</button>
              <button type="button" id="refresh" class="secondary">Refresh</button>
              <button type="button" id="delete" class="secondary"${issue ? '' : ' disabled'}>Delete</button>
            </div>
          </form>
          <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const form = document.getElementById('issue-form');
            const newIssueButton = document.getElementById('new-issue');
            const refreshButton = document.getElementById('refresh');
            const deleteButton = document.getElementById('delete');

            form.addEventListener('submit', (event) => {
              event.preventDefault();
              vscode.postMessage({
                type: 'save',
                payload: {
                  title: document.getElementById('title').value,
                  description: document.getElementById('description').value,
                  groupId: document.getElementById('groupId').value,
                  status: document.getElementById('status').value,
                  priority: document.getElementById('priority').value
                }
              });
            });

            newIssueButton.addEventListener('click', () => vscode.postMessage({ type: 'newIssue' }));
            refreshButton.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
            deleteButton.addEventListener('click', () => vscode.postMessage({ type: 'delete' }));
          </script>
        </body>
      </html>
    `;
  }
}
