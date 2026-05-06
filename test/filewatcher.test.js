const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { createVscodeStub, installVscodeStub, restoreVscodeStub } = require('../test-support/vscodeStub.cjs');

const vscodeStub = createVscodeStub();
installVscodeStub(vscodeStub);

const { IssuesFileWatcher } = require('../out/services');

test.after(() => {
  restoreVscodeStub();
});

test('file watcher: restart handles missing workspace/store path errors safely', async () => {
  let refreshCalls = 0;
  const watcher = new IssuesFileWatcher(
    { resolveCurrentStorePath: async () => { throw new Error('no workspace'); } },
    async () => {
      refreshCalls += 1;
    }
  );

  await watcher.restart();
  watcher.dispose();
  assert.equal(refreshCalls, 0);
});

test('file watcher: debounce collapses multiple change events into one refresh', async () => {
  const originalWatch = fs.watch;
  const originalMkdir = fs.promises.mkdir;

  let watchCallback;
  let closed = false;

  fs.promises.mkdir = async () => undefined;
  fs.watch = (dir, cb) => {
    watchCallback = cb;
    return {
      close() {
        closed = true;
      },
    };
  };

  let refreshCalls = 0;
  const watcher = new IssuesFileWatcher(
    { resolveCurrentStorePath: async () => '/tmp/issues.json' },
    async () => {
      refreshCalls += 1;
    }
  );

  try {
    await watcher.restart();
    watchCallback('change', 'issues.json');
    watchCallback('change', 'issues.json');
    watchCallback('rename', 'issues.json');

    await new Promise((resolve) => setTimeout(resolve, 220));

    assert.equal(refreshCalls, 1);

    watcher.dispose();
    assert.equal(closed, true);
  } finally {
    fs.watch = originalWatch;
    fs.promises.mkdir = originalMkdir;
  }
});

test('file watcher: ignore unrelated file changes and restart replaces watcher', async () => {
  const originalWatch = fs.watch;
  const originalMkdir = fs.promises.mkdir;

  let callbacks = [];
  let closeCount = 0;

  fs.promises.mkdir = async () => undefined;
  fs.watch = (dir, cb) => {
    callbacks.push(cb);
    return {
      close() {
        closeCount += 1;
      },
    };
  };

  let refreshCalls = 0;
  const watcher = new IssuesFileWatcher(
    { resolveCurrentStorePath: async () => '/tmp/issues.json' },
    async () => {
      refreshCalls += 1;
    }
  );

  try {
    await watcher.restart();
    await watcher.restart();

    assert.equal(closeCount, 1);

    callbacks.at(-1)('change', 'other-file.json');
    await new Promise((resolve) => setTimeout(resolve, 220));

    assert.equal(refreshCalls, 0);

    callbacks.at(-1)('change', undefined);
    await new Promise((resolve) => setTimeout(resolve, 220));

    assert.equal(refreshCalls, 1);

    watcher.dispose();
    assert.equal(closeCount, 2);
  } finally {
    fs.watch = originalWatch;
    fs.promises.mkdir = originalMkdir;
  }
});
