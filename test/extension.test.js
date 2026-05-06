const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { activate } = require('../out/extension');
const { deactivate } = require('../out/extension');
const { IssuesTreeProvider } = require('../out/providers');

test.after(() => {
  restoreVscodeStub();
});

function createContext() {
  return {
    workspaceState: vscodeStub.workspaceState,
    subscriptions: [],
  };
}

function disposeSubscriptions(context) {
  for (const disposable of context.subscriptions) {
    if (disposable && typeof disposable.dispose === 'function') {
      disposable.dispose();
    }
  }
}

async function createWorkspaceWithStore(file) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-issues-ext-'));
  vscodeStub.workspace.workspaceFolders = [{ name: 'ws', uri: { fsPath: root } }];
  vscodeStub.__setConfiguration('localIssues', 'filePath', '.vscode/issues.json');
  const storePath = path.join(root, '.vscode', 'issues.json');
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(file, null, 2), 'utf8');
  return root;
}

test('extension activate registers providers, logs output, and sets context', async () => {
  vscodeStub.__reset();
  vscodeStub.workspace.workspaceFolders = [{ name: 'ws', uri: { fsPath: '/tmp/ws' } }];

  const context = createContext();
  await activate(context);

  assert.ok(vscodeStub.__getTreeView('localIssues.tree'));
  assert.ok(vscodeStub.__getTreeView('localIssues.allTasks'));
  assert.ok(vscodeStub.__getWebviewProvider('localIssues.details'));

  const setContextCalls = vscodeStub
    .__getExecutedCommands()
    .filter((entry) => entry.name === 'setContext' && entry.args[0] === 'localIssues.hideCompleted');
  assert.ok(setContextCalls.length >= 1);

  const output = vscodeStub.__getOutputLines().join('\n');
  assert.match(output, /activate/);
  disposeSubscriptions(context);
});

test('extension responds to workspace/config changes by running handlers', async () => {
  vscodeStub.__reset();
  vscodeStub.workspace.workspaceFolders = [{ name: 'ws', uri: { fsPath: '/tmp/ws' } }];

  const context = createContext();
  await activate(context);

  await vscodeStub.__emitWorkspaceFoldersChanged();
  await vscodeStub.__emitConfigurationChanged(['localIssues.filePath']);

  const output = vscodeStub.__getOutputLines().join('\n');
  assert.match(output, /refreshViews -> start/);
  disposeSubscriptions(context);
});

test('extension refresh reveals selected issue in available trees', async () => {
  vscodeStub.__reset();
  const root = await createWorkspaceWithStore({
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    people: [],
    issues: [
      {
        id: 'iss_1',
        title: 'Task',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });

  const context = createContext();
  await activate(context);
  const detailsProvider = vscodeStub.__getWebviewProvider('localIssues.details');
  await detailsProvider.selectIssue('iss_1');
  await vscodeStub.__emitWorkspaceFoldersChanged();

  const treeReveals = vscodeStub.__getTreeView('localIssues.tree').reveals;
  const allTaskReveals = vscodeStub.__getTreeView('localIssues.allTasks').reveals;

  assert.ok(treeReveals.length >= 1);
  assert.ok(allTaskReveals.length >= 1);

  disposeSubscriptions(context);
  await fs.rm(root, { recursive: true, force: true });
});

test('extension refresh handles selected missing issue without reveal errors', async () => {
  vscodeStub.__reset();
  const root = await createWorkspaceWithStore({
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    people: [],
    issues: [],
  });

  const context = createContext();
  await activate(context);
  const detailsProvider = vscodeStub.__getWebviewProvider('localIssues.details');
  await detailsProvider.selectIssue('missing-issue');
  await vscodeStub.__emitWorkspaceFoldersChanged();

  const treeReveals = vscodeStub.__getTreeView('localIssues.tree').reveals;
  assert.equal(treeReveals.length, 0);

  disposeSubscriptions(context);
  await fs.rm(root, { recursive: true, force: true });
});

test('extension refresh tolerates reveal failures and deactivate is callable', async () => {
  vscodeStub.__reset();
  const root = await createWorkspaceWithStore({
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    people: [],
    issues: [
      {
        id: 'iss_1',
        title: 'Task',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });

  const context = createContext();
  await activate(context);
  const detailsProvider = vscodeStub.__getWebviewProvider('localIssues.details');
  await detailsProvider.selectIssue('iss_1');
  vscodeStub.__getTreeView('localIssues.tree').reveal = async () => {
    throw new Error('tree reveal failed');
  };
  vscodeStub.__getTreeView('localIssues.allTasks').reveal = async () => {
    throw new Error('all tasks reveal failed');
  };

  await vscodeStub.__emitWorkspaceFoldersChanged();
  deactivate();
  assert.equal(vscodeStub.__getErrorMessages().length, 0);

  disposeSubscriptions(context);
  await fs.rm(root, { recursive: true, force: true });
});

test('extension refresh falls back to all-tasks reveal when tree reveal target is missing', async () => {
  vscodeStub.__reset();
  const root = await createWorkspaceWithStore({
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    people: [],
    issues: [
      {
        id: 'iss_1',
        title: 'Task',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  const originalGetRevealTarget = IssuesTreeProvider.prototype.getRevealTarget;
  IssuesTreeProvider.prototype.getRevealTarget = function patchedGetRevealTarget() {
    return undefined;
  };

  const context = createContext();
  await activate(context);
  const detailsProvider = vscodeStub.__getWebviewProvider('localIssues.details');
  await detailsProvider.selectIssue('iss_1');
  await vscodeStub.__emitWorkspaceFoldersChanged();

  assert.equal(vscodeStub.__getTreeView('localIssues.tree').reveals.length, 0);
  assert.ok(vscodeStub.__getTreeView('localIssues.allTasks').reveals.length >= 1);

  IssuesTreeProvider.prototype.getRevealTarget = originalGetRevealTarget;
  disposeSubscriptions(context);
  await fs.rm(root, { recursive: true, force: true });
});

test('extension ignores unrelated configuration changes', async () => {
  vscodeStub.__reset();
  vscodeStub.workspace.workspaceFolders = [{ name: 'ws', uri: { fsPath: '/tmp/ws' } }];
  const context = createContext();
  await activate(context);

  const before = vscodeStub.__getOutputLines().filter((line) => line.includes('refreshViews -> start')).length;
  await vscodeStub.__emitConfigurationChanged(['other.setting']);
  const after = vscodeStub.__getOutputLines().filter((line) => line.includes('refreshViews -> start')).length;
  assert.equal(after, before);

  disposeSubscriptions(context);
});
