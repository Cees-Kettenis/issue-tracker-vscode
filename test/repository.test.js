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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-issues-'));
  vscodeStub.workspace.workspaceFolders = [
    {
      name: 'workspace',
      uri: { fsPath: root },
    },
  ];
  vscodeStub.__setConfiguration('localIssues', 'filePath', '.vscode/issues.json');
  return root;
}

test('repository seeds, creates, updates, and deletes issues', async () => {
  const root = await createWorkspace();
  const settings = new IssuesSettingsService(createContext());
  const repository = new IssuesRepository(settings);

  const seeded = await repository.load();
  assert.equal(seeded.version, 1);
  assert.deepEqual(seeded.groups, []);
  assert.deepEqual(seeded.people, []);
  assert.deepEqual(seeded.issues, []);

  const group = await repository.createGroup('Production');
  assert.equal(group.id, 'production');
  assert.equal(group.name, 'Production');

  const person = await repository.createPerson('Alex');
  assert.equal(person.id, 'alex');
  assert.equal(person.name, 'Alex');

  const duplicate = await repository.createGroup('production');
  assert.equal(duplicate.id, group.id);

  const issue = await repository.createIssue({
    title: 'Fix login redirect',
    description: 'Users are sent to the wrong page.',
    groupId: group.id,
    status: 'todo',
    priority: 'high',
    dueDate: '2026-04-20',
    personId: person.id,
  });

  assert.ok(issue.id.startsWith('iss_'));
  assert.equal(issue.groupId, group.id);
  assert.equal(issue.status, 'todo');
  assert.equal(issue.priority, 'high');
  assert.equal(issue.dueDate, '2026-04-20');
  assert.equal(issue.personId, person.id);

  await new Promise((resolve) => setTimeout(resolve, 5));

  const updated = await repository.updateIssue(issue.id, {
    status: 'done',
    priority: 'low',
    title: 'Fix redirect flow',
    dueDate: '',
  });

  assert.equal(updated.id, issue.id);
  assert.equal(updated.status, 'done');
  assert.equal(updated.priority, 'low');
  assert.equal(updated.title, 'Fix redirect flow');
  assert.equal(updated.dueDate, undefined);
  assert.notEqual(updated.updatedAt, issue.updatedAt);

  await repository.deleteIssue(issue.id);
  const afterDelete = await repository.load();
  assert.equal(afterDelete.issues.length, 0);

  await fs.rm(root, { recursive: true, force: true });
});

test('repository clears assigned person when personId is empty', async () => {
  const root = await createWorkspace();
  const settings = new IssuesSettingsService(createContext());
  const repository = new IssuesRepository(settings);

  const group = await repository.createGroup('Docs');
  const person = await repository.createPerson('Alex');

  const issue = await repository.createIssue({
    title: 'Write docs',
    description: '',
    groupId: group.id,
    status: 'todo',
    priority: 'medium',
    personId: person.id,
  });

  const updated = await repository.updateIssue(issue.id, {
    personId: '',
  });

  assert.equal(updated.personId, undefined);

  await fs.rm(root, { recursive: true, force: true });
});

test('repository deletes groups and cascades their issues', async () => {
  const root = await createWorkspace();
  const settings = new IssuesSettingsService(createContext());
  const repository = new IssuesRepository(settings);

  const group = await repository.createGroup('Backend');
  const secondary = await repository.createGroup('Frontend');

  await repository.createIssue({
    title: 'Fix API timeout',
    description: 'Investigate the timeout path.',
    groupId: group.id,
    status: 'todo',
    priority: 'high',
  });

  await repository.createIssue({
    title: 'Polish dashboard',
    description: 'This issue stays.',
    groupId: secondary.id,
    status: 'done',
    priority: 'low',
  });

  await repository.deleteGroup(group.id);
  const afterDelete = await repository.load();

  assert.equal(afterDelete.groups.some((entry) => entry.id === group.id), false);
  assert.equal(afterDelete.issues.some((entry) => entry.groupId === group.id), false);
  assert.equal(afterDelete.issues.some((entry) => entry.groupId === secondary.id), true);

  await fs.rm(root, { recursive: true, force: true });
});

test('repository imports and exports compatible JSON files', async () => {
  const root = await createWorkspace();
  const settings = new IssuesSettingsService(createContext());
  const repository = new IssuesRepository(settings);

  await repository.createGroup('Docs');
  await repository.createIssue({
    title: 'Write usage docs',
    description: 'Document the new workflow.',
    groupId: 'docs',
    status: 'in-progress',
    priority: 'medium',
    dueDate: '2026-04-25',
  });

  const exportPath = path.join(root, 'export.json');
  const exported = await repository.exportToFile(exportPath);
  const exportedRaw = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  assert.equal(exportedRaw.version, 1);
  assert.equal(exportedRaw.people.length, 0);
  assert.equal(exported.issues.length, 1);

  const importPath = path.join(root, 'import.json');
  await fs.writeFile(
    importPath,
    JSON.stringify(
      {
        version: 1,
        groups: [{ id: 'testing', name: 'Testing' }],
        people: [{ id: 'alex', name: 'Alex' }],
        issues: [
          {
            id: 'iss_imported',
            title: 'Imported issue',
            description: 'Imported from disk.',
            groupId: 'testing',
            status: 'todo',
            priority: 'medium',
            dueDate: '2026-04-11',
            personId: 'alex',
            createdAt: '2026-04-10T00:00:00.000Z',
            updatedAt: '2026-04-10T00:00:00.000Z',
          },
        ],
      },
      null,
      2
    )
  );

  const imported = await repository.importFromFile(importPath);
  assert.equal(imported.groups[0].name, 'Testing');
  assert.equal(imported.issues[0].title, 'Imported issue');
  assert.equal(imported.people[0].name, 'Alex');

  await fs.rm(root, { recursive: true, force: true });
});

test('repository reports invalid JSON clearly', async () => {
  const root = await createWorkspace();
  const settings = new IssuesSettingsService(createContext());
  const repository = new IssuesRepository(settings);

  const storePath = await settings.resolveCurrentStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, '{ invalid json', 'utf8');

  await assert.rejects(repository.load(), /invalid JSON/i);

  await fs.rm(root, { recursive: true, force: true });
});
