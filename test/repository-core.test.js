const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { IssuesRepository, IssuesSettingsService } = require('../out/services');

test.after(() => {
  restoreVscodeStub();
});

function createContext() {
  return {
    workspaceState: vscodeStub.workspaceState,
    subscriptions: [],
  };
}

async function createWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-issues-core-'));
  vscodeStub.workspace.workspaceFolders = [{ name: 'workspace', uri: { fsPath: root } }];
  vscodeStub.__setConfiguration('localIssues', 'filePath', '.vscode/issues.json');
  return root;
}

test('repository rejects createIssue for unknown group/person', async () => {
  const root = await createWorkspace();
  const repo = new IssuesRepository(new IssuesSettingsService(createContext()));

  await assert.rejects(
    repo.createIssue({ title: 'x', description: '', groupId: 'missing', status: 'todo', priority: 'low' }),
    /Unknown group id/i
  );

  const group = await repo.createGroup('Docs');
  await assert.rejects(
    repo.createIssue({
      title: 'x', description: '', groupId: group.id, status: 'todo', priority: 'low', personId: 'missing',
    }),
    /Unknown person id/i
  );

  await fs.rm(root, { recursive: true, force: true });
});

test('repository rejects updateIssue for unknown issue/group/person', async () => {
  const root = await createWorkspace();
  const repo = new IssuesRepository(new IssuesSettingsService(createContext()));
  const group = await repo.createGroup('Docs');
  const person = await repo.createPerson('Alex');
  const issue = await repo.createIssue({
    title: 'Task', description: '', groupId: group.id, status: 'todo', priority: 'medium', personId: person.id,
  });

  await assert.rejects(repo.updateIssue('missing', { title: 'x' }), /could not be found/i);
  await assert.rejects(repo.updateIssue(issue.id, { groupId: 'nope' }), /Unknown group id/i);
  await assert.rejects(repo.updateIssue(issue.id, { personId: 'nope' }), /Unknown person id/i);

  await fs.rm(root, { recursive: true, force: true });
});

test('repository rejects deleting unknown issue/group', async () => {
  const root = await createWorkspace();
  const repo = new IssuesRepository(new IssuesSettingsService(createContext()));

  await assert.rejects(repo.deleteIssue('missing'), /could not be found/i);
  await assert.rejects(repo.deleteGroup('missing'), /could not be found/i);

  await fs.rm(root, { recursive: true, force: true });
});
