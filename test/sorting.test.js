const assert = require('node:assert/strict');
const test = require('node:test');

const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { compareIssues } = require('../out/utils');
const { IssuesTreeProvider } = require('../out/providers');

test.after(() => {
  restoreVscodeStub();
});

test('compareIssues orders by status, updatedAt, then title', () => {
  const issues = [
    {
      id: '3',
      title: 'Zeta',
      description: '',
      groupId: 'g',
      status: 'todo',
      priority: 'medium',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T03:00:00.000Z',
    },
    {
      id: '1',
      title: 'Alpha',
      description: '',
      groupId: 'g',
      status: 'in-progress',
      priority: 'medium',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T01:00:00.000Z',
    },
    {
      id: '2',
      title: 'Beta',
      description: '',
      groupId: 'g',
      status: 'todo',
      priority: 'medium',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T02:00:00.000Z',
    },
  ];

  const sorted = [...issues].sort(compareIssues);
  assert.deepEqual(sorted.map((issue) => issue.id), ['1', '3', '2']);
});

test('tree provider hides completed issues and keeps orphan issues grouped', async () => {
  const file = {
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    issues: [
      {
        id: 'iss_1',
        title: 'Write docs',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T01:00:00.000Z',
      },
      {
        id: 'iss_2',
        title: 'Done item',
        description: '',
        groupId: 'docs',
        status: 'done',
        priority: 'low',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T02:00:00.000Z',
      },
      {
        id: 'iss_3',
        title: 'Orphan issue',
        description: '',
        groupId: 'missing',
        status: 'blocked',
        priority: 'high',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T03:00:00.000Z',
      },
    ],
  };

  const repository = {
    load: async () => file,
  };

  const settings = {
    getHideCompleted: async () => true,
  };

  const provider = new IssuesTreeProvider(repository, settings);
  await provider.refresh();

  const rootItems = await provider.getChildren();
  assert.equal(rootItems.length, 2);
  assert.equal(rootItems[0].label, 'Docs (1)');
  assert.equal(rootItems[1].label, 'Ungrouped (1)');

  const docsChildren = await provider.getChildren(rootItems[0]);
  assert.equal(docsChildren.length, 1);
  assert.equal(docsChildren[0].label, 'Write docs');

  const revealTarget = provider.getRevealTarget('iss_1');
  assert.equal(revealTarget.label, 'Write docs');
});
