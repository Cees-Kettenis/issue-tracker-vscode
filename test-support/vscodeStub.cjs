const Module = require('module');

const originalLoad = Module._load;

function createVscodeStub() {
  const configuration = new Map();
  const workspaceFolders = [];
  const workspaceState = new Map();
  const commandHandlers = new Map();
  const executedCommands = [];
  const infoMessages = [];
  const errorMessages = [];
  const warningMessages = [];
  const shownDocuments = [];
  const outputLines = [];
  const workspaceFolderListeners = [];
  const configurationListeners = [];
  const treeViews = new Map();
  const webviewProviders = new Map();

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

  class ThemeColor {
    constructor(id) {
      this.id = id;
    }
  }

  class MarkdownString {
    constructor(value = '') {
      this.value = value;
      this.supportThemeIcons = false;
    }

    appendMarkdown(value) {
      this.value += String(value);
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
    __reset() {
      configuration.clear();
      workspaceFolders.splice(0, workspaceFolders.length);
      workspaceState.clear();
      commandHandlers.clear();
      executedCommands.splice(0, executedCommands.length);
      infoMessages.splice(0, infoMessages.length);
      errorMessages.splice(0, errorMessages.length);
      warningMessages.splice(0, warningMessages.length);
      shownDocuments.splice(0, shownDocuments.length);
      outputLines.splice(0, outputLines.length);
      workspaceFolderListeners.splice(0, workspaceFolderListeners.length);
      configurationListeners.splice(0, configurationListeners.length);
      treeViews.clear();
      webviewProviders.clear();
      stub.__showInputBox = async () => undefined;
      stub.__showQuickPick = async () => undefined;
      stub.__showOpenDialog = async () => undefined;
      stub.__showSaveDialog = async () => undefined;
      stub.__showWarningMessage = async () => undefined;
    },
    __invokeCommand(name, ...args) {
      const handler = commandHandlers.get(name);
      if (!handler) {
        throw new Error(`Command not registered: ${name}`);
      }
      return handler(...args);
    },
    __getExecutedCommands() {
      return [...executedCommands];
    },
    __getInfoMessages() {
      return [...infoMessages];
    },
    __getErrorMessages() {
      return [...errorMessages];
    },
    __getWarningMessages() {
      return [...warningMessages];
    },
    __getShownDocuments() {
      return [...shownDocuments];
    },
    __getOutputLines() {
      return [...outputLines];
    },
    __emitWorkspaceFoldersChanged: async () => {
      for (const listener of workspaceFolderListeners) {
        await listener();
      }
    },
    __emitConfigurationChanged: async (changedKeys = []) => {
      const event = {
        affectsConfiguration(key) {
          return changedKeys.includes(key);
        },
      };
      for (const listener of configurationListeners) {
        await listener(event);
      }
    },
    __getTreeView(id) {
      return treeViews.get(id);
    },
    __getWebviewProvider(id) {
      return webviewProviders.get(id);
    },
    __showInputBox: async () => undefined,
    __showQuickPick: async () => undefined,
    __showOpenDialog: async () => undefined,
    __showSaveDialog: async () => undefined,
    __showWarningMessage: async () => undefined,
    EventEmitter,
    ThemeIcon,
    ThemeColor,
    MarkdownString,
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
      registerCommand(name, handler) {
        commandHandlers.set(name, handler);
        return {
          dispose() {
            commandHandlers.delete(name);
          },
        };
      },
      async executeCommand(name, ...args) {
        executedCommands.push({ name, args });
        if (commandHandlers.has(name)) {
          return commandHandlers.get(name)(...args);
        }
        return undefined;
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
      onDidChangeWorkspaceFolders(listener) {
        workspaceFolderListeners.push(listener);
        return {
          dispose() {},
        };
      },
      onDidChangeConfiguration(listener) {
        configurationListeners.push(listener);
        return {
          dispose() {},
        };
      },
      async openTextDocument(uri) {
        return { uri };
      },
    },
    window: {
      showWarningMessage: async (message, ...rest) => {
        warningMessages.push({ message, args: rest });
        return stub.__showWarningMessage(message, ...rest);
      },
      showInformationMessage: async (message, ...rest) => {
        infoMessages.push({ message, args: rest });
        return undefined;
      },
      showErrorMessage: async (message, ...rest) => {
        errorMessages.push({ message, args: rest });
        return undefined;
      },
      showOpenDialog: async (...args) => stub.__showOpenDialog(...args),
      showSaveDialog: async (...args) => stub.__showSaveDialog(...args),
      showInputBox: async (...args) => stub.__showInputBox(...args),
      showQuickPick: async (...args) => stub.__showQuickPick(...args),
      createTreeView(id) {
        const view = {
          reveals: [],
          async reveal(target, options) {
            this.reveals.push({ target, options });
          },
          dispose() {},
        };
        treeViews.set(id, view);
        return view;
      },
      registerWebviewViewProvider(id, provider) {
        webviewProviders.set(id, provider);
        return disposable;
      },
      createOutputChannel() {
        return {
          appendLine(value) {
            outputLines.push(String(value));
          },
          dispose() {},
        };
      },
      async showTextDocument(document) {
        shownDocuments.push(document);
        return document;
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

  stub.__reset();

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
