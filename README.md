# Local Issues

Local Issues is a VS Code extension that keeps a lightweight issue tracker inside your workspace. Issues are stored locally in a JSON file, by default at:

`.vscode/issues.json`

## What Works Now

- Activity bar sidebar for issue browsing
- Local per-workspace JSON storage
- Create groups and issues
- Edit issue title, description, group, status, and priority
- Delete issues
- Hide completed issues
- Refresh the tree and detail view
- Import and export issue data as JSON

## Prerequisites

- VS Code
- Node.js 20+
- Corepack enabled `pnpm`

If `pnpm` is not already available, use Corepack:

```bash
corepack enable
corepack pnpm --version
```

## Install

From the repository root:

```bash
corepack pnpm install
```

## Build

Compile the extension once:

```bash
corepack pnpm run compile
```

Or keep TypeScript rebuilding automatically:

```bash
corepack pnpm run watch
```

## Run In Dev

1. Open this repository in VS Code.
2. Run the build watch task:
   - `Terminal > Run Task... > npm: watch`
   - or start `corepack pnpm run watch` in a terminal
3. Press `F5` to launch the extension in an Extension Development Host.

The debug configuration is already defined in [`.vscode/launch.json`](.vscode/launch.json).

## How To Use

After the Extension Development Host opens:

1. Open a folder or workspace in the new VS Code window.
2. Click the `Issues` icon in the Activity Bar.
3. Use the tree toolbar or command palette to:
   - create a group
   - create an issue
   - import issue data
   - export issue data
   - refresh the view
   - toggle hiding completed issues
4. Select an issue to edit it in the details panel.

## Data Storage

By default, the extension stores data in:

```text
.vscode/issues.json
```

You can change the path in workspace settings:

```json
"localIssues.filePath": ".vscode/issues.json"
```

The file is created automatically if it does not exist.

## Schema

The `issues.json` file uses a versioned JSON structure:

```json
{
  "version": 1,
  "groups": [
    { "id": "production", "name": "Production" }
  ],
  "issues": [
    {
      "id": "iss_001",
      "title": "Fix login redirect",
      "description": "Users are sent to the wrong page after login.",
      "groupId": "production",
      "status": "todo",
      "priority": "high",
      "createdAt": "2026-04-10T10:00:00Z",
      "updatedAt": "2026-04-10T10:00:00Z"
    }
  ]
}
```

- `version` is currently `1`
- `status` must be one of `todo`, `in-progress`, `blocked`, or `done`
- `priority` must be one of `low`, `medium`, or `high`
- future schema changes should keep older files readable through migrations

## Commands

- `Local Issues: Create Issue`
- `Local Issues: Create Group`
- `Local Issues: Import Issues`
- `Local Issues: Export Issues`
- `Local Issues: Refresh`
- `Local Issues: Toggle Hide Completed`
- `Local Issues: Change Status`
- `Local Issues: Change Priority`
- `Local Issues: Delete Issue`
- `Local Issues: Select Issue`

## Notes

- The extension currently expects a single workspace folder.
- If you open no folder, the extension will warn you to open one first.
- Multi-root workspaces are only partially supported for now and default to the first folder.
