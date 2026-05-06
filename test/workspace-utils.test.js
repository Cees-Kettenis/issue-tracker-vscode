const assert = require('node:assert/strict');
const test = require('node:test');

const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { resolveWorkspaceFolder } = require('../out/services');
const { escapeHtml, slugify, clampText, createId, nowIso } = require('../out/utils');
const { formatDueDate } = require('../out/utils/dates');

test.after(() => {
  restoreVscodeStub();
});

test('workspace resolver warns when no folder is open', async () => {
  vscodeStub.__reset();
  vscodeStub.workspace.workspaceFolders = [];

  const resolved = await resolveWorkspaceFolder();
  assert.equal(resolved, undefined);
  assert.match(vscodeStub.__getWarningMessages().at(-1).message, /requires an open workspace folder/i);
});

test('workspace resolver warns on multi-root and returns first folder', async () => {
  vscodeStub.__reset();
  vscodeStub.workspace.workspaceFolders = [
    { name: 'first', uri: { fsPath: '/tmp/first' } },
    { name: 'second', uri: { fsPath: '/tmp/second' } },
  ];

  const resolved = await resolveWorkspaceFolder();
  assert.equal(resolved.name, 'first');
  assert.match(vscodeStub.__getWarningMessages().at(-1).message, /only supports a single workspace folder/i);
});

test('formatDueDate handles empty, invalid, and valid date strings', () => {
  assert.equal(formatDueDate(undefined), 'No due date');
  assert.equal(formatDueDate('bad-date'), 'bad-date');
  assert.equal(formatDueDate('2026-05-01'), '01/05/26');
});

test('string and id utilities handle core formatting cases', () => {
  assert.equal(escapeHtml(`<x y='z'>&\"`), '&lt;x y=&#39;z&#39;&gt;&amp;&quot;');
  assert.equal(slugify('  My Group Name!  '), 'my-group-name');
  assert.equal(clampText('abcdef', 4), 'abc…');
  assert.equal(clampText('abc', 4), 'abc');

  const id = createId('iss');
  assert.match(id, /^iss_[a-f0-9]{12}$/);
  assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T/);
});
