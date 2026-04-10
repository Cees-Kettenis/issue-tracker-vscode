const Module = require('module');

const originalLoad = Module._load;

function createVscodeStub() {
  const configuration = new Map();
  const workspaceFolders = [];
  const workspaceState = new Map();

  const disposable = { dispose() {} };

  class EventEmitter {
    constructor() {
      this.listeners = new Set();
      this.event = (listener) => {
        this.listeners.add(listener);
        return {
          dispose: () => {
            this.listeners.delete(listener);
          },
        };
      };
    }

    fire(value) {
      for (const listener of this.listeners) {
        listener(value);
      }
    }

    dispose() {
      this.listeners.clear();
    }
  }

  class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    constructor(id) {
      this.id = id;
    }
  }

  const stub = {
    __setConfiguration(section, key, value) {
      configuration.set(`${section}.${key}`, value);
    },
    __setWorkspaceFolders(folders) {
      workspaceFolders.splice(0, workspaceFolders.length, ...folders);
    },
    __setWorkspaceState(key, value) {
      workspaceState.set(key, value);
    },
    __getWorkspaceState(key) {
      return workspaceState.get(key);
    },
    EventEmitter,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    Uri: {
      file(fsPath) {
        return {
          fsPath,
          path: fsPath,
          toString() {
            return fsPath;
          },
        };
      },
    },
    commands: {
      registerCommand() {
        return disposable;
      },
    },
    workspace: {
      getConfiguration(section) {
        return {
          get(key, defaultValue) {
            const fullKey = `${section}.${key}`;
            return configuration.has(fullKey) ? configuration.get(fullKey) : defaultValue;
          },
        };
      },
      get workspaceFolders() {
        return workspaceFolders;
      },
      set workspaceFolders(folders) {
        workspaceFolders.splice(0, workspaceFolders.length, ...(folders ?? []));
      },
      onDidChangeConfiguration() {
        return disposable;
      },
    },
    window: {
      showWarningMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showErrorMessage: async () => undefined,
      showOpenDialog: async () => undefined,
      showSaveDialog: async () => undefined,
      showInputBox: async () => undefined,
      showQuickPick: async () => undefined,
      registerTreeDataProvider() {
        return disposable;
      },
      createTreeView() {
        return {
          reveal: async () => undefined,
          dispose() {},
        };
      },
      registerWebviewViewProvider() {
        return disposable;
      },
    },
    ExtensionContext: undefined,
  };

  stub.workspaceState = {
    get(key, defaultValue) {
      return workspaceState.has(key) ? workspaceState.get(key) : defaultValue;
    },
    update(key, value) {
      workspaceState.set(key, value);
      return Promise.resolve();
    },
  };

  return stub;
}

function installVscodeStub(stub) {
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return stub;
    }

    return originalLoad.call(this, request, parent, isMain);
  };
}

function restoreVscodeStub() {
  Module._load = originalLoad;
}

module.exports = {
  createVscodeStub,
  installVscodeStub,
  restoreVscodeStub,
};
