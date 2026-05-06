const assert = require('node:assert/strict');
const test = require('node:test');

const { createVscodeStub } = require('../test-support/vscodeStub.cjs');

test('vscode stub helpers cover throw/default/dispose utility paths', async () => {
  const stub = createVscodeStub();

  assert.throws(() => stub.__invokeCommand('missing.command'), /Command not registered/);

  const uri = stub.Uri.file('/tmp/x');
  assert.equal(uri.toString(), '/tmp/x');

  const output = stub.window.createOutputChannel('x');
  output.appendLine('hello');
  output.dispose();

  const result = await stub.commands.executeCommand('unknown.command');
  assert.equal(result, undefined);

  stub.__setWorkspaceFolders([{ name: 'ws', uri: { fsPath: '/tmp/ws' } }]);
  assert.equal(stub.workspace.workspaceFolders.length, 1);
  stub.__setWorkspaceState('k', 'v');
  assert.equal(stub.__getWorkspaceState('k'), 'v');
  await stub.workspaceState.update('k2', 'v2');
  assert.equal(stub.workspaceState.get('k2'), 'v2');
});
