const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeIssueInput,
  normalizeIssueUpdateInput,
  normalizeIssuesFile,
  requireIssueTitle,
  requireGroupName,
  requirePersonName,
  normalizeGroup,
  normalizePerson,
  isIssuePriority,
  isIssueStatus,
} = require('../out/utils');

test('validation: status and priority guards accept only supported values', () => {
  assert.equal(isIssueStatus('todo'), true);
  assert.equal(isIssueStatus('done'), true);
  assert.equal(isIssueStatus('invalid'), false);

  assert.equal(isIssuePriority('low'), true);
  assert.equal(isIssuePriority('high'), true);
  assert.equal(isIssuePriority('urgent'), false);
});

test('validation: normalizeIssueInput trims text and defaults status/priority', () => {
  const normalized = normalizeIssueInput({
    title: '  Fix auth  ',
    description: '  needs retry handling  ',
    groupId: '  backend ',
    status: 'not-real',
    priority: 'not-real',
    dueDate: '2026-12-01',
    personId: '  alex ',
  });

  assert.equal(normalized.title, 'Fix auth');
  assert.equal(normalized.description, 'needs retry handling');
  assert.equal(normalized.groupId, 'backend');
  assert.equal(normalized.status, 'todo');
  assert.equal(normalized.priority, 'medium');
  assert.equal(normalized.dueDate, '2026-12-01');
  assert.equal(normalized.personId, 'alex');
});

test('validation: normalizeIssueUpdateInput rejects invalid status/priority/date', () => {
  assert.throws(() => normalizeIssueUpdateInput({ status: 'queued' }), /Invalid issue status/i);
  assert.throws(() => normalizeIssueUpdateInput({ priority: 'critical' }), /Invalid issue priority/i);
  assert.throws(() => normalizeIssueUpdateInput({ dueDate: '12-31-2026' }), /Invalid due date/i);
});

test('validation: requireIssueTitle rejects blank values', () => {
  assert.throws(() => requireIssueTitle('   '), /Issue title is required/i);
});

test('validation: normalizeIssuesFile rejects invalid issue status/priority records', () => {
  const base = {
    version: 1,
    groups: [{ id: 'g', name: 'Group' }],
    people: [],
    issues: [
      {
        id: 'iss_1',
        title: 'Task',
        description: '',
        groupId: 'g',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };

  const invalidStatus = JSON.parse(JSON.stringify(base));
  invalidStatus.issues[0].status = 'queued';
  assert.throws(() => normalizeIssuesFile(invalidStatus), /Invalid status/i);

  const invalidPriority = JSON.parse(JSON.stringify(base));
  invalidPriority.issues[0].priority = 'urgent';
  assert.throws(() => normalizeIssuesFile(invalidPriority), /Invalid priority/i);
});

test('validation: group/person guards and file shape branches', () => {
  assert.throws(() => requireGroupName('  '), /Group name is required/i);
  assert.throws(() => requirePersonName('  '), /Person name is required/i);
  assert.throws(() => normalizeGroup(null), /Invalid group entry/i);
  assert.throws(() => normalizePerson(null), /Invalid person entry/i);
  assert.throws(() => normalizeIssuesFile(null), /does not contain valid JSON/i);
  assert.throws(() => normalizeIssuesFile({ issues: [null] }), /Invalid issue entry/i);
});
