const assert = require('node:assert/strict');
const test = require('node:test');

const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { IssuesTreeProvider, AllTasksTreeProvider } = require('../out/providers');

test.after(() => {
  restoreVscodeStub();
});

test('issues tree: shows empty-state message when no groups and no issues', async () => {
  const repository = { load: async () => ({ version: 1, groups: [], people: [], issues: [] }) };
  const settings = { getHideCompleted: async () => false };
  const provider = new IssuesTreeProvider(repository, settings);

  await provider.refresh();
  const roots = await provider.getChildren();

  assert.equal(roots.length, 1);
  assert.equal(roots[0].label, 'No groups yet');
  assert.equal(roots[0].contextValue, 'localIssuesMessage');
});

test('issues tree: reveal target is undefined when provider is in error state', async () => {
  const repository = { load: async () => { throw new Error('load failed'); } };
  const settings = { getHideCompleted: async () => false };
  const provider = new IssuesTreeProvider(repository, settings);

  await provider.refresh();
  assert.equal(provider.getRevealTarget('iss_1'), undefined);

  const roots = await provider.getChildren();
  assert.equal(roots[0].label, 'Unable to load issues');
});

test('all tasks tree: shows empty-state message when no issues are present', async () => {
  const repository = {
    load: async () => ({
      version: 1,
      groups: [{ id: 'docs', name: 'Docs' }],
      people: [],
      issues: [],
    }),
  };
  const settings = { getHideCompleted: async () => false };
  const provider = new AllTasksTreeProvider(repository, settings);

  await provider.refresh();
  const roots = await provider.getChildren();

  assert.equal(roots.length, 1);
  assert.equal(roots[0].label, 'No tasks yet');
  assert.equal(roots[0].contextValue, 'localIssuesMessage');
});

test('issues tree: group children and status/person branches are rendered', async () => {
  const repository = {
    load: async () => ({
      version: 1,
      groups: [{ id: 'docs', name: 'Docs' }],
      people: [{ id: 'alex', name: 'Alex' }],
      issues: [
        { id: 'a', title: 'A', description: '', groupId: 'docs', status: 'todo', priority: 'medium', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', title: 'B', description: 'x', groupId: 'docs', status: 'in-progress', priority: 'low', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', personId: 'alex' },
        { id: 'c', title: 'C', description: '', groupId: 'docs', status: 'blocked', priority: 'high', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', personId: 'missing' },
        { id: 'd', title: 'D', description: '', groupId: 'docs', status: 'done', priority: 'medium', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    }),
  };
  const settings = { getHideCompleted: async () => false };
  const provider = new IssuesTreeProvider(repository, settings);
  await provider.refresh();
  const roots = await provider.getChildren();
  const children = await provider.getChildren(roots[0]);
  assert.equal(children.length, 4);
  assert.equal(children[0].contextValue, 'localIssuesIssue');
  const byId = new Map(children.map((item) => [item.id, item]));
  assert.equal(byId.get('b').iconPath.id, 'play-circle');
  assert.equal(byId.get('c').iconPath.id, 'error');
  assert.equal(byId.get('d').iconPath.id, 'check');
  assert.match(String(byId.get('c').label), /Unknown person/);
  assert.match(String(byId.get('a').tooltip.value), /No description yet/i);
});

test('all tasks tree: root/child/error branches and icon colors are covered', async () => {
  let fail = false;
  const repository = {
    load: async () => {
      if (fail) {
        throw new Error('load failure');
      }
      return {
        version: 1,
        groups: [{ id: 'docs', name: 'Docs' }],
        people: [],
        issues: [
          { id: 'a', title: 'A', description: '', groupId: 'docs', status: 'todo', priority: 'medium', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'b', title: 'B', description: '', groupId: 'docs', status: 'in-progress', priority: 'high', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'c', title: 'C', description: '', groupId: 'docs', status: 'blocked', priority: 'low', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'd', title: 'D', description: '', groupId: 'docs', status: 'done', priority: 'medium', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      };
    },
  };
  const settings = { getHideCompleted: async () => false };
  const provider = new AllTasksTreeProvider(repository, settings);
  await provider.refresh();
  const roots = await provider.getChildren();
  assert.equal((await provider.getChildren(roots[0])).length, 0);
  const byId = new Map(roots.map((item) => [item.id, item]));
  assert.equal(byId.get('b').iconPath.id, 'play-circle');
  assert.equal(byId.get('c').iconPath.id, 'error');
  assert.equal(byId.get('d').iconPath.id, 'check');
  assert.equal(byId.get('a').iconPath.id, 'clock');
  fail = true;
  await provider.refresh();
  const errorRoots = await provider.getChildren();
  assert.equal(errorRoots[0].label, 'Unable to load tasks');
});
