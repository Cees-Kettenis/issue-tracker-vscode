const assert = require('node:assert/strict');
const test = require('node:test');

const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { registerIssueCommands } = require('../out/commands');

test.after(() => {
  restoreVscodeStub();
});

function createServices(overrides = {}) {
  const calls = {
    refreshViews: 0,
    createGroup: [],
    createPerson: [],
    updateIssue: [],
    deleteIssue: [],
    duplicateIssue: [],
    selectIssue: [],
    showNewIssue: [],
    setHideCompleted: [],
  };

  let hideCompleted = false;

  const repository = {
    createGroup: async (name) => {
      calls.createGroup.push(name);
      return { id: 'docs', name };
    },
    createPerson: async (name) => {
      calls.createPerson.push(name);
      return { id: 'alex', name };
    },
    updateIssue: async (issueId, patch) => {
      calls.updateIssue.push({ issueId, patch });
      return { id: issueId, ...patch };
    },
    deleteIssue: async (issueId) => {
      calls.deleteIssue.push(issueId);
    },
    duplicateIssue: async (issueId) => {
      calls.duplicateIssue.push(issueId);
      return { id: `${issueId}_copy` };
    },
    load: async () => ({
      version: 1,
      groups: [{ id: 'docs', name: 'Docs' }],
      people: [],
      issues: [{ id: 'iss_1', groupId: 'docs', status: 'todo' }],
    }),
    importFromFile: async () => ({ version: 1, groups: [], people: [], issues: [] }),
    exportToFile: async () => ({ version: 1, groups: [], people: [], issues: [] }),
  };

  const detailsProvider = {
    getCurrentIssueId: () => undefined,
    selectIssue: async (issueId) => {
      calls.selectIssue.push(issueId);
    },
    showNewIssue: async (groupId) => {
      calls.showNewIssue.push(groupId);
    },
  };

  const settings = {
    resolveCurrentStorePath: async () => '/tmp/issues.json',
    getHideCompleted: async () => hideCompleted,
    setHideCompleted: async (value) => {
      hideCompleted = value;
      calls.setHideCompleted.push(value);
    },
  };

  const services = {
    repository,
    treeProvider: {},
    detailsProvider,
    settings,
    refreshViews: async () => {
      calls.refreshViews += 1;
    },
    ...overrides,
  };

  return { services, calls };
}

function registerWithContext(services) {
  const context = { subscriptions: [] };
  registerIssueCommands(context, services);
  return context;
}

test('commands: editIssue without a selected issue shows guidance', async () => {
  vscodeStub.__reset();
  const { services } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.editIssue');

  assert.equal(vscodeStub.__getInfoMessages().at(-1).message, 'Select an issue first.');
});

test('commands: createGroup creates and refreshes when input is provided', async () => {
  vscodeStub.__reset();
  vscodeStub.__showInputBox = async () => 'Platform';
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.createGroup');

  assert.deepEqual(calls.createGroup, ['Platform']);
  assert.equal(calls.refreshViews, 1);
});

test('commands: createIssue forwards preset group id and refreshes', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.createIssue', {
    group: { id: 'docs' },
  });

  assert.deepEqual(calls.showNewIssue, ['docs']);
  assert.equal(calls.refreshViews, 1);
});

test('commands: completeIssue updates status to done and refreshes', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.completeIssue', {
    issue: { id: 'iss_123' },
  });

  assert.equal(calls.updateIssue.length, 1);
  assert.equal(calls.updateIssue[0].issueId, 'iss_123');
  assert.deepEqual(calls.updateIssue[0].patch, { status: 'done' });
  assert.deepEqual(calls.selectIssue, ['iss_123']);
  assert.equal(calls.refreshViews, 1);
});

test('commands: setStatus exits early when quick pick is cancelled', async () => {
  vscodeStub.__reset();
  vscodeStub.__showQuickPick = async () => undefined;
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.setStatus', { issue: { id: 'iss_77' } });

  assert.equal(calls.updateIssue.length, 0);
  assert.equal(calls.refreshViews, 0);
});

test('commands: deleteIssue requires confirmation before deleting', async () => {
  vscodeStub.__reset();
  vscodeStub.__showWarningMessage = async () => undefined;
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.deleteIssue', { issue: { id: 'iss_44' } });

  assert.equal(calls.deleteIssue.length, 0);
  assert.equal(calls.refreshViews, 0);
});

test('commands: deleteIssue deletes, opens new issue mode, and refreshes on confirm', async () => {
  vscodeStub.__reset();
  vscodeStub.__showWarningMessage = async () => 'Delete';
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.deleteIssue', { issue: { id: 'iss_44' } });

  assert.deepEqual(calls.deleteIssue, ['iss_44']);
  assert.deepEqual(calls.showNewIssue, [undefined]);
  assert.equal(calls.refreshViews, 1);
});

test('commands: toggleHideCompleted updates state, setContext, and refreshes', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.toggleHideCompleted');

  assert.deepEqual(calls.setHideCompleted, [true]);
  const setContextCall = vscodeStub.__getExecutedCommands().find((entry) => entry.name === 'setContext');
  assert.ok(setContextCall);
  assert.deepEqual(setContextCall.args, ['localIssues.hideCompleted', true]);
  assert.equal(calls.refreshViews, 1);
});

test('commands: importIssues selects first imported issue and refreshes', async () => {
  vscodeStub.__reset();
  vscodeStub.__showOpenDialog = async () => [{ fsPath: '/tmp/in.json' }];
  const { services, calls } = createServices({
    repository: {
      ...createServices().services.repository,
      importFromFile: async () => ({
        version: 1,
        groups: [{ id: 'g', name: 'G' }],
        people: [],
        issues: [{ id: 'iss_i' }],
      }),
    },
  });
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.importIssues');

  assert.deepEqual(calls.selectIssue, ['iss_i']);
  assert.equal(calls.refreshViews, 1);
});

test('commands: exportIssues writes selected target and shows success message', async () => {
  vscodeStub.__reset();
  vscodeStub.__showSaveDialog = async () => ({ fsPath: '/tmp/out.json' });
  const exportedCalls = [];
  const { services } = createServices({
    repository: {
      ...createServices().services.repository,
      exportToFile: async (target) => {
        exportedCalls.push(target);
        return { version: 1, groups: [], people: [], issues: [] };
      },
    },
  });
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.exportIssues');

  assert.deepEqual(exportedCalls, ['/tmp/out.json']);
  assert.match(vscodeStub.__getInfoMessages().at(-1).message, /Exported 0 issues?/);
});

test('commands: deleteGroup only proceeds on confirmation', async () => {
  vscodeStub.__reset();
  vscodeStub.__showWarningMessage = async () => undefined;
  const deleteCalls = [];
  const { services } = createServices({
    repository: {
      ...createServices().services.repository,
      load: async () => ({
        version: 1,
        groups: [{ id: 'docs', name: 'Docs' }],
        people: [],
        issues: [{ id: 'iss_1', groupId: 'docs', status: 'todo' }],
      }),
      deleteGroup: async (id) => deleteCalls.push(id),
    },
    detailsProvider: {
      ...createServices().services.detailsProvider,
      getCurrentIssueId: () => 'iss_1',
    },
  });
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.deleteGroup', { group: { id: 'docs' } });
  assert.equal(deleteCalls.length, 0);

  vscodeStub.__showWarningMessage = async () => 'Delete';
  await vscodeStub.__invokeCommand('localIssues.deleteGroup', { group: { id: 'docs' } });
  assert.deepEqual(deleteCalls, ['docs']);
});

test('commands: createPerson is no-op when input is empty', async () => {
  vscodeStub.__reset();
  vscodeStub.__showInputBox = async () => '';
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.createPerson');

  assert.equal(calls.createPerson.length, 0);
  assert.equal(calls.refreshViews, 0);
});

test('commands: renameGroup updates group when valid target and name are provided', async () => {
  vscodeStub.__reset();
  vscodeStub.__showInputBox = async () => 'Renamed';

  const updateCalls = [];
  const { services, calls } = createServices({
    repository: {
      ...createServices().services.repository,
      load: async () => ({
        version: 1,
        groups: [{ id: 'docs', name: 'Docs' }],
        people: [],
        issues: [],
      }),
      updateGroup: async (id, name) => updateCalls.push({ id, name }),
    },
  });
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.renameGroup', { group: { id: 'docs' } });

  assert.deepEqual(updateCalls, [{ id: 'docs', name: 'Renamed' }]);
  assert.equal(calls.refreshViews, 1);
});

test('commands: setPriority updates when a choice is made', async () => {
  vscodeStub.__reset();
  vscodeStub.__showQuickPick = async () => ({ label: 'high' });

  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.setPriority', { issue: { id: 'iss_1' } });

  assert.equal(calls.updateIssue.length, 1);
  assert.deepEqual(calls.updateIssue[0], { issueId: 'iss_1', patch: { priority: 'high' } });
  assert.equal(calls.refreshViews, 1);
});

test('commands: importIssues is no-op when no file is selected', async () => {
  vscodeStub.__reset();
  vscodeStub.__showOpenDialog = async () => undefined;

  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.importIssues');

  assert.equal(calls.refreshViews, 0);
  assert.equal(calls.selectIssue.length, 0);
});

test('commands: refresh command triggers refreshViews', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.refresh');
  assert.equal(calls.refreshViews, 1);
});

test('commands: createGroup is no-op when input is empty', async () => {
  vscodeStub.__reset();
  vscodeStub.__showInputBox = async () => undefined;
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.createGroup');
  assert.equal(calls.createGroup.length, 0);
  assert.equal(calls.refreshViews, 0);
});

test('commands: duplicateIssue is no-op when issue cannot be resolved', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.duplicateIssue');
  assert.equal(calls.duplicateIssue.length, 0);
});

test('commands: setStatus updates when a choice is made', async () => {
  vscodeStub.__reset();
  vscodeStub.__showQuickPick = async () => ({ label: 'blocked' });
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.setStatus', { issue: { id: 'iss_2' } });
  assert.equal(calls.updateIssue.length, 1);
  assert.deepEqual(calls.updateIssue[0], { issueId: 'iss_2', patch: { status: 'blocked' } });
});

test('commands: setPriority exits early when quick pick is cancelled', async () => {
  vscodeStub.__reset();
  vscodeStub.__showQuickPick = async () => undefined;
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.setPriority', { issue: { id: 'iss_2' } });
  assert.equal(calls.updateIssue.length, 0);
});

test('commands: deleteGroup guard for ungrouped target shows info', async () => {
  vscodeStub.__reset();
  const { services } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.deleteGroup', { id: '__ungrouped__', contextValue: 'localIssuesGroup' });
  assert.match(vscodeStub.__getInfoMessages().at(-1).message, /Select a group first/i);
});

test('commands: renameGroup guard for invalid target shows info', async () => {
  vscodeStub.__reset();
  const { services } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.renameGroup', { id: 'x', contextValue: 'other' });
  assert.match(vscodeStub.__getInfoMessages().at(-1).message, /Select a group first/i);
});

test('commands: show/hide completed issue commands set explicit values', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.hideCompletedIssues');
  await vscodeStub.__invokeCommand('localIssues.showCompletedIssues');

  assert.deepEqual(calls.setHideCompleted, [true, false]);
});

test('commands: createGroup surfaces repository errors', async () => {
  vscodeStub.__reset();
  vscodeStub.__showInputBox = async () => 'Docs';
  const { services } = createServices({
    repository: {
      ...createServices().services.repository,
      createGroup: async () => {
        throw new Error('create group failed');
      },
    },
  });
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.createGroup');
  assert.match(String(vscodeStub.__getErrorMessages().at(-1).message), /create group failed/i);
});

test('commands: createPerson surfaces repository errors', async () => {
  vscodeStub.__reset();
  vscodeStub.__showInputBox = async () => 'Alex';
  const { services } = createServices({
    repository: {
      ...createServices().services.repository,
      createPerson: async () => {
        throw new Error('create person failed');
      },
    },
  });
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.createPerson');
  assert.match(String(vscodeStub.__getErrorMessages().at(-1).message), /create person failed/i);
});

test('commands: renameGroup no-op when rename prompt is cancelled', async () => {
  vscodeStub.__reset();
  vscodeStub.__showInputBox = async () => undefined;
  const { services, calls } = createServices({
    repository: {
      ...createServices().services.repository,
      load: async () => ({ version: 1, groups: [{ id: 'docs', name: 'Docs' }], people: [], issues: [] }),
      updateGroup: async () => {
        throw new Error('should not update');
      },
    },
  });
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.renameGroup', { group: { id: 'docs' } });
  assert.equal(calls.refreshViews, 0);
});

test('commands: deleteGroup reports missing group', async () => {
  vscodeStub.__reset();
  const { services } = createServices({
    repository: {
      ...createServices().services.repository,
      load: async () => ({ version: 1, groups: [], people: [], issues: [] }),
    },
  });
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.deleteGroup', { group: { id: 'missing' } });
  assert.match(String(vscodeStub.__getErrorMessages().at(-1).message), /could not be found/i);
});

test('commands: importIssues handles empty import by opening create view', async () => {
  vscodeStub.__reset();
  vscodeStub.__showOpenDialog = async () => [{ fsPath: '/tmp/in.json' }];
  const { services, calls } = createServices({
    repository: {
      ...createServices().services.repository,
      importFromFile: async () => ({ version: 1, groups: [], people: [], issues: [] }),
    },
  });
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.importIssues');
  assert.deepEqual(calls.showNewIssue, [undefined]);
});

test('commands: exportIssues no-op when save dialog is cancelled', async () => {
  vscodeStub.__reset();
  vscodeStub.__showSaveDialog = async () => undefined;
  const { services } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.exportIssues');
  // no error, no success message expected
  assert.equal(vscodeStub.__getErrorMessages().length, 0);
});

test('commands: editIssue accepts raw id string target', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.editIssue', 'iss_raw');
  assert.deepEqual(calls.selectIssue, ['iss_raw']);
});

test('commands: createIssue resolves group from localIssuesGroup target id', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.createIssue', { id: 'docs', contextValue: 'localIssuesGroup' });
  assert.deepEqual(calls.showNewIssue, ['docs']);
});

test('commands: completeIssue accepts generic id payload', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.completeIssue', { id: 'iss_generic', contextValue: 'other' });
  assert.equal(calls.updateIssue[0].issueId, 'iss_generic');
});

test('commands: createIssue falls back to undefined group when target is invalid', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.createIssue', 42);
  assert.deepEqual(calls.showNewIssue, [undefined]);
});

test('commands: editIssue with blank raw id shows selection guidance', async () => {
  vscodeStub.__reset();
  const { services, calls } = createServices();
  registerWithContext(services);

  await vscodeStub.__invokeCommand('localIssues.editIssue', '   ');
  assert.equal(calls.selectIssue.length, 0);
  assert.match(vscodeStub.__getInfoMessages().at(-1).message, /Select an issue first/i);
});
