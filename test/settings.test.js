const assert = require('node:assert/strict');
const test = require('node:test');

const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { IssuesSettingsService, DEFAULT_ISSUES_FILE_PATH } = require('../out/services');

test.after(() => {
  restoreVscodeStub();
});

function createContext() {
  return { workspaceState: vscodeStub.workspaceState, subscriptions: [] };
}

test('settings: file path falls back to default when configured value is blank', () => {
  vscodeStub.__reset();
  vscodeStub.__setConfiguration('localIssues', 'filePath', '   ');

  const settings = new IssuesSettingsService(createContext());
  assert.equal(settings.getFilePathSetting(), DEFAULT_ISSUES_FILE_PATH);
});

test('settings: resolveStorePath supports relative and absolute configuration', () => {
  vscodeStub.__reset();
  const settings = new IssuesSettingsService(createContext());
  const workspaceFolder = { uri: { fsPath: '/tmp/ws' } };

  vscodeStub.__setConfiguration('localIssues', 'filePath', '.vscode/issues.json');
  assert.equal(settings.resolveStorePath(workspaceFolder), '/tmp/ws/.vscode/issues.json');

  vscodeStub.__setConfiguration('localIssues', 'filePath', '/tmp/custom/issues.json');
  assert.equal(settings.resolveStorePath(workspaceFolder), '/tmp/custom/issues.json');
});

test('settings: resolveCurrentStorePath throws when no workspace is open', async () => {
  vscodeStub.__reset();
  vscodeStub.workspace.workspaceFolders = [];

  const settings = new IssuesSettingsService(createContext());
  await assert.rejects(settings.resolveCurrentStorePath(), /Open a workspace folder/i);
});
