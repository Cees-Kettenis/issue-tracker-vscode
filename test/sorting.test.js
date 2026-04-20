const assert = require('node:assert/strict');
const test = require('node:test');

const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { compareIssues, compareIssuesByDueDate } = require('../out/utils');
const { AllTasksTreeProvider, IssuesTreeProvider } = require('../out/providers');

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

test('compareIssuesByDueDate orders tasks with due dates first', () => {
  const issues = [
    {
      id: '3',
      title: 'Later',
      description: '',
      groupId: 'g',
      status: 'todo',
      priority: 'high',
      dueDate: '2026-04-20',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T03:00:00.000Z',
    },
    {
      id: '1',
      title: 'Sooner',
      description: '',
      groupId: 'g',
      status: 'in-progress',
      priority: 'low',
      dueDate: '2026-04-18',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T01:00:00.000Z',
    },
    {
      id: '2',
      title: 'No due date',
      description: '',
      groupId: 'g',
      status: 'todo',
      priority: 'medium',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-10T02:00:00.000Z',
    },
  ];

  const sorted = [...issues].sort(compareIssuesByDueDate);
  assert.deepEqual(sorted.map((issue) => issue.id), ['1', '3', '2']);
});

test('tree provider hides completed issues and keeps orphan issues grouped', async () => {
  const file = {
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    people: [{ id: 'alex', name: 'Alex' }],
    issues: [
      {
        id: 'iss_1',
        title: 'Write docs',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'medium',
        personId: 'alex',
        dueDate: '2026-04-18',
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
      {
        id: 'iss_4',
        title: 'Unassigned issue',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'low',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T04:00:00.000Z',
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
  assert.equal(rootItems[0].label, 'Docs (2)');
  assert.equal(rootItems[1].label, 'Ungrouped (1)');

  const docsChildren = await provider.getChildren(rootItems[0]);
  assert.equal(docsChildren.length, 2);
  assert.equal(docsChildren[0].label, '🟠 · Alex · 18/04/26 · Write docs');
  assert.equal(docsChildren[1].label, '🟢 · N/A · No due date · Unassigned issue');

  const revealTarget = provider.getRevealTarget('iss_1');
  assert.equal(revealTarget.label, '🟠 · Alex · 18/04/26 · Write docs');
});

test('all tasks tree shows a flat due-date ordered list', async () => {
  const file = {
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    people: [{ id: 'alex', name: 'Alex' }],
    issues: [
      {
        id: 'iss_1',
        title: 'Later task',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'high',
        personId: 'alex',
        dueDate: '2026-04-20',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T01:00:00.000Z',
      },
      {
        id: 'iss_2',
        title: 'Sooner task',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'low',
        personId: '',
        dueDate: '2026-04-18',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T02:00:00.000Z',
      },
      {
        id: 'iss_3',
        title: 'No due date',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T03:00:00.000Z',
      },
    ],
  };

  const repository = {
    load: async () => file,
  };

  const settings = {
    getHideCompleted: async () => false,
  };

  const provider = new AllTasksTreeProvider(repository, settings);
  await provider.refresh();

  const items = await provider.getChildren();
  assert.equal(items.length, 3);
  assert.equal(items[0].label, '🟢 · N/A · 18/04/26 · Sooner task');
  assert.equal(items[1].label, '🔴 · Alex · 20/04/26 · Later task');
  assert.equal(items[2].label, '🟠 · N/A · No due date · No due date');
});

test('all tasks tree hides completed issues when the toggle is on', async () => {
  const file = {
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    people: [],
    issues: [
      {
        id: 'iss_1',
        title: 'Open task',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'medium',
        dueDate: '2026-04-18',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T01:00:00.000Z',
      },
      {
        id: 'iss_2',
        title: 'Done task',
        description: '',
        groupId: 'docs',
        status: 'done',
        priority: 'medium',
        dueDate: '2026-04-19',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T02:00:00.000Z',
      },
    ],
  };

  const repository = {
    load: async () => file,
  };

  const settings = {
    getHideCompleted: async () => true,
  };

  const provider = new AllTasksTreeProvider(repository, settings);
  await provider.refresh();

  const items = await provider.getChildren();
  assert.equal(items.length, 1);
  assert.equal(items[0].label, '🟠 · N/A · 18/04/26 · Open task');
});
