const assert = require('node:assert/strict');
const test = require('node:test');

const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { AllTasksViewProvider, IssueDetailsViewProvider } = require('../out/providers');

test.after(() => {
  restoreVscodeStub();
});

function createWebviewView() {
  let listener = undefined;
  return {
    webview: {
      options: {},
      html: '',
      onDidReceiveMessage(handler) {
        listener = handler;
        return { dispose() {} };
      },
    },
    async __emit(message) {
      if (!listener) {
        throw new Error('No webview message listener registered');
      }
      await listener(message);
    },
  };
}

function createIssueFile() {
  return {
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    people: [{ id: 'alex', name: 'Alex' }],
    issues: [
      {
        id: 'iss_1',
        title: 'Task',
        description: 'desc',
        groupId: 'docs',
        status: 'todo',
        priority: 'medium',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
}

test('allTasks webview: save message validates payload and reports errors', async () => {
  vscodeStub.__reset();
  const errorsBefore = vscodeStub.__getErrorMessages().length;

  const repository = {
    load: async () => createIssueFile(),
    updateIssue: async () => {
      throw new Error('should not run');
    },
  };
  const settings = { resolveCurrentStorePath: async () => '/tmp/issues.json' };
  const provider = new AllTasksViewProvider(repository, settings, async () => undefined);
  const view = createWebviewView();

  provider.resolveWebviewView(view);
  await view.__emit({ type: 'save', payload: { title: 'X' } });

  const errorsAfter = vscodeStub.__getErrorMessages();
  assert.equal(errorsAfter.length, errorsBefore + 1);
  assert.match(String(errorsAfter.at(-1).message), /Missing issue id/i);
});

test('allTasks webview: valid save updates issue and refreshes views', async () => {
  vscodeStub.__reset();

  let updateCall;
  let refreshCalls = 0;
  const repository = {
    load: async () => createIssueFile(),
    updateIssue: async (id, patch) => {
      updateCall = { id, patch };
      return { id, ...patch };
    },
  };
  const settings = { resolveCurrentStorePath: async () => '/tmp/issues.json' };
  const provider = new AllTasksViewProvider(repository, settings, async () => {
    refreshCalls += 1;
  });
  const view = createWebviewView();

  provider.resolveWebviewView(view);
  await view.__emit({
    type: 'save',
    payload: {
      issueId: 'iss_1',
      title: 'Updated title',
      description: 'D',
      groupId: 'docs',
      status: 'in-progress',
      priority: 'high',
      dueDate: '2026-02-01',
      personId: 'alex',
    },
  });

  assert.equal(updateCall.id, 'iss_1');
  assert.equal(updateCall.patch.title, 'Updated title');
  assert.equal(updateCall.patch.groupId, 'docs');
  assert.equal(refreshCalls, 1);
});

test('details webview: save create flow requires title and supports new group creation', async () => {
  vscodeStub.__reset();

  const repository = {
    load: async () => ({ ...createIssueFile(), issues: [] }),
    createGroup: async (name) => ({ id: 'new-group', name }),
    createIssue: async (payload) => ({ id: 'iss_new', ...payload }),
    updateIssue: async () => {
      throw new Error('should not update in create mode');
    },
    deleteIssue: async () => undefined,
    duplicateIssue: async () => ({ id: 'x' }),
  };
  const treeProvider = {};
  const settings = { resolveCurrentStorePath: async () => '/tmp/issues.json' };
  let refreshCalls = 0;

  const provider = new IssueDetailsViewProvider(repository, treeProvider, settings, async () => {
    refreshCalls += 1;
  });

  const view = createWebviewView();
  provider.resolveWebviewView(view);

  await view.__emit({ type: 'save', payload: { title: '', groupId: 'docs' } });
  assert.match(String(vscodeStub.__getErrorMessages().at(-1).message), /Issue title is required/i);

  await view.__emit({
    type: 'save',
    payload: {
      title: 'Created from webview',
      groupId: '',
      newGroupName: 'New Group',
      description: 'D',
      status: 'todo',
      priority: 'medium',
      dueDate: '',
      personId: '',
    },
  });

  assert.equal(refreshCalls, 1);
});

test('details webview: duplicate branch executes for selected issue', async () => {
  vscodeStub.__reset();

  let duplicated = [];
  const repository = {
    load: async () => createIssueFile(),
    createGroup: async (name) => ({ id: 'g', name }),
    createIssue: async (payload) => ({ id: 'iss_x', ...payload }),
    updateIssue: async (id, payload) => ({ id, ...payload }),
    deleteIssue: async () => undefined,
    duplicateIssue: async (id) => {
      duplicated.push(id);
      return { id: 'iss_dup' };
    },
  };
  const provider = new IssueDetailsViewProvider(
    repository,
    {},
    { resolveCurrentStorePath: async () => '/tmp/issues.json' },
    async () => undefined
  );

  const view = createWebviewView();
  provider.resolveWebviewView(view);
  await provider.selectIssue('iss_1');

  await view.__emit({ type: 'duplicate' });

  assert.deepEqual(duplicated, ['iss_1']);
});

test('details webview: delete and openStoreFile branches execute', async () => {
  vscodeStub.__reset();
  vscodeStub.__showWarningMessage = async () => 'Delete';

  let deleted = [];
  const repository = {
    load: async () => createIssueFile(),
    createGroup: async (name) => ({ id: 'g', name }),
    createIssue: async (payload) => ({ id: 'iss_x', ...payload }),
    updateIssue: async (id, payload) => ({ id, ...payload }),
    deleteIssue: async (id) => deleted.push(id),
    duplicateIssue: async () => ({ id: 'iss_dup' }),
  };
  const provider = new IssueDetailsViewProvider(
    repository,
    {},
    { resolveCurrentStorePath: async () => '/tmp/issues.json' },
    async () => undefined
  );

  const view = createWebviewView();
  provider.resolveWebviewView(view);
  await provider.selectIssue('iss_1');

  await view.__emit({ type: 'delete' });
  await view.__emit({ type: 'openStoreFile' });

  assert.deepEqual(deleted, ['iss_1']);
  assert.equal(vscodeStub.__getShownDocuments().length, 1);
});

test('allTasks webview: refresh/trace/webviewError/default messages are tolerated', async () => {
  vscodeStub.__reset();
  let loads = 0;
  const repository = {
    load: async () => {
      loads += 1;
      return createIssueFile();
    },
    updateIssue: async (id, patch) => ({ id, ...patch }),
  };
  const provider = new AllTasksViewProvider(repository, { resolveCurrentStorePath: async () => '/tmp/issues.json' }, async () => undefined);
  const view = createWebviewView();
  provider.resolveWebviewView(view);

  await view.__emit({ type: 'refresh' });
  await view.__emit({ type: 'trace', payload: { message: 'x' } });
  await view.__emit({ type: 'webviewError', payload: { message: 'y' } });
  await view.__emit({ type: 'unknown-type' });

  assert.ok(loads >= 2);
});

test('allTasks webview: save rejects blank title/group', async () => {
  vscodeStub.__reset();
  const repository = {
    load: async () => createIssueFile(),
    updateIssue: async () => ({ id: 'x' }),
  };
  const provider = new AllTasksViewProvider(repository, { resolveCurrentStorePath: async () => '/tmp/issues.json' }, async () => undefined);
  const view = createWebviewView();
  provider.resolveWebviewView(view);

  await view.__emit({ type: 'save', payload: { issueId: 'iss_1', title: '', groupId: 'docs' } });
  await view.__emit({ type: 'save', payload: { issueId: 'iss_1', title: 'X', groupId: '' } });

  const msgs = vscodeStub.__getErrorMessages().map((m) => String(m.message));
  assert.ok(msgs.some((m) => /title is required/i.test(m)));
  assert.ok(msgs.some((m) => /Choose a group/i.test(m)));
});

test('details webview: refresh/newIssue/trace/webviewError/default messages are tolerated', async () => {
  vscodeStub.__reset();
  const repository = {
    load: async () => createIssueFile(),
    createGroup: async (name) => ({ id: 'g', name }),
    createIssue: async (payload) => ({ id: 'iss_x', ...payload }),
    updateIssue: async (id, payload) => ({ id, ...payload }),
    deleteIssue: async () => undefined,
    duplicateIssue: async () => ({ id: 'iss_dup' }),
  };
  const provider = new IssueDetailsViewProvider(repository, {}, { resolveCurrentStorePath: async () => '/tmp/issues.json' }, async () => undefined);
  const view = createWebviewView();
  provider.resolveWebviewView(view);

  await view.__emit({ type: 'refresh' });
  await view.__emit({ type: 'newIssue' });
  await view.__emit({ type: 'trace', payload: { message: 'x' } });
  await view.__emit({ type: 'webviewError', payload: { message: 'y' } });
  await view.__emit({ type: 'unknown-type' });

  assert.equal(vscodeStub.__getErrorMessages().length, 0);
});

test('details webview: delete cancelled does not call repository', async () => {
  vscodeStub.__reset();
  vscodeStub.__showWarningMessage = async () => undefined;
  let deleteCalls = 0;
  const repository = {
    load: async () => createIssueFile(),
    createGroup: async (name) => ({ id: 'g', name }),
    createIssue: async (payload) => ({ id: 'iss_x', ...payload }),
    updateIssue: async (id, payload) => ({ id, ...payload }),
    deleteIssue: async () => {
      deleteCalls += 1;
    },
    duplicateIssue: async () => ({ id: 'iss_dup' }),
  };
  const provider = new IssueDetailsViewProvider(repository, {}, { resolveCurrentStorePath: async () => '/tmp/issues.json' }, async () => undefined);
  const view = createWebviewView();
  provider.resolveWebviewView(view);
  await provider.selectIssue('iss_1');

  await view.__emit({ type: 'delete' });
  assert.equal(deleteCalls, 0);
});

test('allTasks/details webviews: render fallback branches for unknown assignee and load errors', async () => {
  vscodeStub.__reset();
  const oddFile = {
    version: 1,
    groups: [{ id: 'docs', name: 'Docs' }],
    people: [],
    issues: [
      {
        id: 'iss_1',
        title: 'Task',
        description: '',
        groupId: 'docs',
        status: 'todo',
        priority: 'medium',
        personId: 'ghost',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
  let throwLoad = false;
  const allTasksRepo = {
    load: async () => {
      if (throwLoad) {
        throw new Error('load failed');
      }
      return oddFile;
    },
    updateIssue: async (id, patch) => ({ id, ...patch }),
  };
  const allTasks = new AllTasksViewProvider(allTasksRepo, { resolveCurrentStorePath: async () => '/tmp/issues.json' }, async () => undefined);
  const allTasksView = createWebviewView();
  allTasks.resolveWebviewView(allTasksView);
  await allTasks.refresh();
  assert.match(allTasksView.webview.html, /Unknown person/);
  throwLoad = true;
  await allTasks.refresh();
  assert.match(allTasksView.webview.html, /load failed/i);

  const detailsRepo = {
    load: async () => oddFile,
    createGroup: async (name) => ({ id: 'g', name }),
    createIssue: async (payload) => ({ id: 'iss_x', ...payload }),
    updateIssue: async (id, payload) => ({ id, ...payload }),
    deleteIssue: async () => undefined,
    duplicateIssue: async () => ({ id: 'iss_dup' }),
  };
  const details = new IssueDetailsViewProvider(detailsRepo, {}, { resolveCurrentStorePath: async () => '/tmp/issues.json' }, async () => undefined);
  const detailsView = createWebviewView();
  details.resolveWebviewView(detailsView);
  await details.selectIssue('iss_1');
  assert.match(detailsView.webview.html, /Unknown person \(ghost\)/);
  await details.selectIssue(undefined);
  await detailsView.__emit({ type: 'delete' });
  await detailsView.__emit({ type: 'duplicate' });
});

test('allTasks webview: render early return and buildState load-catch path', async () => {
  vscodeStub.__reset();
  const providerNoView = new AllTasksViewProvider(
    { load: async () => createIssueFile(), updateIssue: async (id, patch) => ({ id, ...patch }) },
    { resolveCurrentStorePath: async () => '/tmp/issues.json' },
    async () => undefined
  );
  await providerNoView.render();

  const providerCatch = new AllTasksViewProvider(
    { load: async () => { throw new Error('load in buildState failed'); }, updateIssue: async (id, patch) => ({ id, ...patch }) },
    { resolveCurrentStorePath: async () => '/tmp/issues.json' },
    async () => undefined
  );
  const view = createWebviewView();
  providerCatch.resolveWebviewView(view);
  await providerCatch.refresh();
  assert.match(view.webview.html, /load in buildState failed/i);
});
