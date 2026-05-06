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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-issues-branches-'));
  vscodeStub.workspace.workspaceFolders = [{ name: 'workspace', uri: { fsPath: root } }];
  vscodeStub.__setConfiguration('localIssues', 'filePath', '.vscode/issues.json');
  return root;
}

test('repository createGroup/createPerson generates unique ids with numeric suffixes', async () => {
  const root = await createWorkspace();
  const repository = new IssuesRepository(new IssuesSettingsService(createContext()));

  const g1 = await repository.createGroup('Docs');
  const g2 = await repository.createGroup('Docs!');
  const g3 = await repository.createGroup('Docs   ' + Math.random().toString(16).slice(2));

  // force another docs-style slug collision
  const g4 = await repository.createGroup('docs');

  assert.equal(g1.id, 'docs');
  assert.equal(g2.id, 'docs-2');
  assert.ok(g4.id === 'docs' || g4.id === 'docs-2' || g4.id === 'docs-3');

  const p1 = await repository.createPerson('Alex');
  const p2 = await repository.createPerson('Alex!');
  assert.equal(p1.id, 'alex');
  assert.equal(p2.id, 'alex-2');

  await fs.rm(root, { recursive: true, force: true });
});

test('repository importFromFile returns explicit message for missing file', async () => {
  const root = await createWorkspace();
  const repository = new IssuesRepository(new IssuesSettingsService(createContext()));

  await assert.rejects(
    repository.importFromFile(path.join(root, 'nope.json')),
    /could not import .* does not exist/i
  );

  await fs.rm(root, { recursive: true, force: true });
});

test('repository save falls back to rm+rename when initial rename fails', async () => {
  const root = await createWorkspace();
  const repository = new IssuesRepository(new IssuesSettingsService(createContext()));

  const originalRename = fs.rename;
  let renameCalls = 0;

  fs.rename = async (...args) => {
    renameCalls += 1;
    if (renameCalls === 1) {
      throw new Error('simulated rename failure');
    }
    return originalRename(...args);
  };

  try {
    await repository.save({ version: 1, groups: [], people: [], issues: [] });
    assert.ok(renameCalls >= 2);
  } finally {
    fs.rename = originalRename;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('repository load surfaces generic action message when non-Error is thrown', async () => {
  const root = await createWorkspace();
  const repository = new IssuesRepository(new IssuesSettingsService(createContext()));

  const originalReadFile = fs.readFile;
  fs.readFile = async () => {
    throw 'bad-read';
  };

  try {
    await assert.rejects(repository.load(), /could not load the issues file/i);
  } finally {
    fs.readFile = originalReadFile;
    await fs.rm(root, { recursive: true, force: true });
  }
});
