import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { Issue, IssueGroup, IssuePriority, IssueStatus } from '../models';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '../models';
import { renderMarkdown } from '../utils/markdown';
import { escapeHtml } from '../utils/strings';
import { IssuesRepository } from '../services/issuesRepository';
import { IssuesSettingsService } from '../services/settings';
import { IssuesTreeProvider } from './issuesTreeProvider';

interface IssueFormState {
  mode: 'create' | 'edit';
  issue: Issue | undefined;
  groups: IssueGroup[];
  draftGroupId?: string;
  storePath?: string;
  error?: string;
}

export class IssueDetailsViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private selectedIssueId: string | undefined;
  private mode: 'create' | 'edit' = 'create';
  private draftGroupId: string | undefined;

  constructor(
    private readonly repository: IssuesRepository,
    private readonly treeProvider: IssuesTreeProvider,
    private readonly settings: IssuesSettingsService,
    private readonly refreshViews: () => Promise<void>,
    private readonly log: (message: string) => void = () => undefined
  ) {}

  getCurrentIssueId(): string | undefined {
    return this.selectedIssueId;
  }

  async selectIssue(issueId: string | undefined): Promise<void> {
    this.selectedIssueId = issueId;
    this.mode = issueId ? 'edit' : 'create';
    if (issueId) {
      this.draftGroupId = undefined;
    }
    await this.render();
  }

  async showNewIssue(groupId?: string): Promise<void> {
    this.selectedIssueId = undefined;
    this.mode = 'create';
    this.draftGroupId = groupId;
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
        this.log(`webview.message -> ${String(message?.type ?? 'unknown')}`);
        switch (message?.type) {
          case 'save':
            await this.saveFromWebview(message.payload as Record<string, unknown>);
            break;
          case 'trace':
            this.log(`webview.trace -> ${String(message?.payload?.message ?? 'unknown')}`);
            break;
          case 'webviewError':
            this.log(`webview.error -> ${String(message?.payload?.message ?? 'unknown')}`);
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
          case 'openStoreFile':
            await this.openStoreFile();
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
        draftGroupId: this.draftGroupId,
        storePath: await this.settings.resolveCurrentStorePath(),
      };
    } catch (error) {
      return {
        mode: this.mode,
        issue: undefined,
        groups: [],
        draftGroupId: this.draftGroupId,
        storePath: undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async saveFromWebview(payload: Record<string, unknown>): Promise<void> {
    const title = String(payload.title ?? '').trim();
    const description = String(payload.description ?? '').trim();
    const groupId = String(payload.groupId ?? '').trim();
    const newGroupName = String(payload.newGroupName ?? '').trim();
    const status = String(payload.status ?? 'todo') as IssueStatus;
    const priority = String(payload.priority ?? 'medium') as IssuePriority;

    this.log(
      `webview.save payload -> title="${title}" groupId="${groupId}" newGroupName="${newGroupName}" status="${status}" priority="${priority}"`
    );

    if (!title) {
      throw new Error('Issue title is required.');
    }

    const file = await this.repository.load();
    const currentIssue = this.selectedIssueId
      ? file.issues.find((entry) => entry.id === this.selectedIssueId)
      : undefined;

    let resolvedGroupId = groupId;
    if (!resolvedGroupId) {
      if (newGroupName) {
        const createdGroup = await this.repository.createGroup(newGroupName);
        resolvedGroupId = createdGroup.id;
        this.log(`webview.save created group -> ${resolvedGroupId}`);
      } else {
        throw new Error('Choose a group before saving the issue.');
      }
    }

    if (currentIssue && this.mode === 'edit') {
      const updated = await this.repository.updateIssue(currentIssue.id, {
        title,
        description,
        groupId: resolvedGroupId,
        status,
        priority,
      });
      this.log(`webview.save updated issue -> ${updated.id}`);
      await this.selectIssue(updated.id);
      await this.refreshViews();
      return;
    } else {
      const created = await this.repository.createIssue({
        title,
        description,
        groupId: resolvedGroupId,
        status,
        priority,
      });
      this.log(`webview.save created issue -> ${created.id}`);
      await this.selectIssue(created.id);
      await this.refreshViews();
      return;
    }
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
    this.log(`webview.delete -> ${this.selectedIssueId}`);
    this.selectedIssueId = undefined;
    this.mode = 'create';
    await this.refreshViews();
  }

  private async openStoreFile(): Promise<void> {
    const storePath = await this.settings.resolveCurrentStorePath();
    this.log(`webview.openStoreFile -> ${storePath}`);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(storePath));
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private getHtml(state: IssueFormState): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const webviewScript = this.getWebviewScript();
    const issue = state.issue;
    const selectedGroupId = issue?.groupId ?? state.draftGroupId ?? state.groups[0]?.id ?? '';
    const hasGroups = state.groups.length > 0;
    const selectedStatus = issue?.status ?? 'todo';
    const selectedPriority = issue?.priority ?? 'medium';

    const title = issue ? 'Edit Issue' : 'Create New Issue';
    const errorBanner = state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : '';

    const groupControl = hasGroups
      ? state.groups
          .map((group) => `<option value="${escapeHtml(group.id)}"${group.id === selectedGroupId ? ' selected' : ''}>${escapeHtml(group.name)}</option>`)
          .join('')
      : '';

    const statusOptions = ISSUE_STATUSES.map(
      (status) => `<option value="${status}"${status === selectedStatus ? ' selected' : ''}>${status}</option>`
    ).join('');

    const priorityOptions = ISSUE_PRIORITIES.map(
      (priority) => `<option value="${priority}"${priority === selectedPriority ? ' selected' : ''}>${priority}</option>`
    ).join('');

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
              grid-template-columns: repeat(3, minmax(0, 1fr));
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
            button.secondary.destructive {
              color: var(--vscode-errorForeground);
              border-color: color-mix(in srgb, var(--vscode-errorForeground) 42%, var(--border));
              background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent);
            }
            button.secondary.destructive:hover {
              background: color-mix(in srgb, var(--vscode-errorForeground) 20%, transparent);
            }
            .priority-label {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .priority-dot {
              width: 10px;
              height: 10px;
              border-radius: 999px;
              background: var(--priority-color);
              box-shadow: 0 0 0 2px color-mix(in srgb, var(--priority-color) 22%, transparent);
              flex: 0 0 auto;
            }
            .priority-dot.priority-low {
              --priority-color: var(--vscode-charts-green);
            }
            .priority-dot.priority-medium {
              --priority-color: var(--vscode-charts-orange);
            }
            .priority-dot.priority-high {
              --priority-color: var(--vscode-charts-red);
            }
            .error {
              padding: 10px 12px;
              border-radius: 6px;
              background: color-mix(in srgb, var(--vscode-errorForeground) 14%, transparent);
              color: var(--vscode-errorForeground);
            }
          </style>
        </head>
        <body>
          <h2>${title}</h2>
          ${errorBanner}
          <form id="issue-form">
            <label>
              Title
              <input id="title" name="title" type="text" value="${escapeHtml(issue?.title ?? '')}" placeholder="Fix login redirect" />
            </label>
            <label>
              Description
              <textarea id="description" name="description" placeholder="Add notes, steps, or acceptance criteria.">${escapeHtml(issue?.description ?? '')}</textarea>
            </label>
            <div class="row">
              <label>
                Group
                ${
                  hasGroups
                    ? `<select id="groupId" name="groupId">
                        ${groupControl}
                      </select>`
                    : `<input id="newGroupName" name="newGroupName" type="text" placeholder="Create a group name first" value="" />`
                }
              </label>
              <label>
                Status
                <select id="status" name="status">
                  ${statusOptions}
                </select>
              </label>
              <label>
                <span class="priority-label">
                  <span class="priority-dot priority-${selectedPriority}" aria-hidden="true"></span>
                  Priority
                </span>
                <select id="priority" name="priority">
                  ${priorityOptions}
                </select>
              </label>
            </div>
            <section class="preview" aria-label="Description preview">
              <h3>Description Preview</h3>
              <div id="description-preview" class="markdown">${descriptionPreview}</div>
            </section>
            <div class="actions">
              <button type="submit" id="save-issue">${issue ? 'Save issue' : 'Create issue'}</button>
              <button type="button" id="delete" class="secondary destructive"${issue ? '' : ' disabled'}>Delete</button>
            </div>
          </form>
          <script nonce="${nonce}">${webviewScript}</script>
        </body>
      </html>
    `;
  }

  private getWebviewScript(): string {
    return String.raw`
const vscode = acquireVsCodeApi();
const form = document.getElementById('issue-form');
const descriptionInput = document.getElementById('description');
const descriptionPreview = document.getElementById('description-preview');
const deleteButton = document.getElementById('delete');
const saveButton = document.getElementById('save-issue');
const prioritySelect = document.getElementById('priority');
const priorityDot = document.querySelector('.priority-dot');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(text) {
  const escaped = escapeHtml(text);
  const backtick = String.fromCharCode(96);
  const codePattern = new RegExp(backtick + '([^' + backtick + ']+)' + backtick, 'g');
  return escaped
    .replace(codePattern, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

function renderMarkdown(value) {
  const lines = String(value).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let listType;
  let listItems = [];
  let blockquoteLines = [];
  let codeLines = [];
  let inCodeBlock = false;
  const codeFence = String.fromCharCode(96).repeat(3);

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }
    blocks.push('<p>' + paragraph.join(' ') + '</p>');
    paragraph = [];
  }

  function flushList() {
    if (!listType) {
      return;
    }
    blocks.push('<' + listType + '>' + listItems.join('') + '</' + listType + '>');
    listType = undefined;
    listItems = [];
  }

  function flushBlockquote() {
    if (!blockquoteLines.length) {
      return;
    }
    blocks.push('<blockquote>' + blockquoteLines.join('<br />') + '</blockquote>');
    blockquoteLines = [];
  }

  function flushCodeBlock() {
    if (!inCodeBlock) {
      return;
    }
    blocks.push('<pre><code>' + codeLines.join('\n') + '</code></pre>');
    inCodeBlock = false;
    codeLines = [];
  }

  function closeOpenBlocks() {
    flushParagraph();
    flushList();
    flushBlockquote();
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (inCodeBlock) {
      if (trimmed === codeFence) {
        flushCodeBlock();
      } else {
        codeLines.push(escapeHtml(line));
      }

      continue;
    }

    if (trimmed === codeFence) {
      closeOpenBlocks();
      inCodeBlock = true;
      continue;
    }

    if (!trimmed) {
      closeOpenBlocks();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeOpenBlocks();
      const level = headingMatch[1].length;
      blocks.push('<h' + level + '>' + formatInline(headingMatch[2]) + '</h' + level + '>');
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType && listType !== 'ul') {
        flushList();
      }

      listType = 'ul';
      listItems.push('<li>' + formatInline(unorderedMatch[1]) + '</li>');
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType && listType !== 'ol') {
        flushList();
      }

      listType = 'ol';
      listItems.push('<li>' + formatInline(orderedMatch[1]) + '</li>');
      continue;
    }

    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      blockquoteLines.push(formatInline(blockquoteMatch[1]));
      continue;
    }

    flushList();
    flushBlockquote();
    paragraph.push(formatInline(line));
  }

  flushCodeBlock();
  closeOpenBlocks();
  return blocks.join('\n');
}

function updatePreview(value) {
  if (!descriptionPreview) {
    return;
  }

  const content = String(value || '').trim();
  descriptionPreview.innerHTML = content
    ? renderMarkdown(content)
    : '<p class="empty">No description yet. Add Markdown in the textarea to preview it here.</p>';
}

function syncPriorityDot() {
  if (!priorityDot || !prioritySelect) {
    return;
  }

  priorityDot.classList.remove('priority-low', 'priority-medium', 'priority-high');
  priorityDot.classList.add('priority-' + prioritySelect.value);
}

function postSave() {
  vscode.postMessage({
    type: 'save',
    payload: {
      title: document.getElementById('title').value,
      description: document.getElementById('description').value,
      groupId: document.getElementById('groupId') ? document.getElementById('groupId').value : '',
      newGroupName: document.getElementById('newGroupName') ? document.getElementById('newGroupName').value : '',
      status: document.getElementById('status').value,
      priority: document.getElementById('priority').value
    }
  });
}

function trace(message) {
  vscode.postMessage({ type: 'trace', payload: { message } });
}

trace('script-start');

window.addEventListener('error', (event) => {
  vscode.postMessage({
    type: 'webviewError',
    payload: {
      message: event.message || 'Unknown script error',
      filename: event.filename || '',
      lineno: event.lineno || 0,
      colno: event.colno || 0,
    }
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
  vscode.postMessage({ type: 'webviewError', payload: { message: reason } });
});

document.addEventListener('DOMContentLoaded', () => {
  trace('ready');
  updatePreview(descriptionInput.value);
  syncPriorityDot();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  trace('submit');
  postSave();
});

if (saveButton) {
  saveButton.addEventListener('click', () => {
    trace('save-click');
  });
}

descriptionInput.addEventListener('input', (event) => {
  updatePreview(event.target.value);
});

deleteButton.addEventListener('click', () => vscode.postMessage({ type: 'delete' }));
prioritySelect.addEventListener('change', syncPriorityDot);
`;
  }
}
