# Local Issues

Local Issues is a VS Code extension that keeps a lightweight issue tracker inside your workspace. Issue data is stored locally in a JSON file, by default at `.vscode/issues.json`.

## Support

- Issues and feedback: <https://github.com/cees-kettenis/issue-tracker-vscode/issues>
- License: MIT

## What It Does

- Groups and issues are shown in a custom `Issues` sidebar.
- Issue rows show a progress icon, a priority circle, the assignee, the due date, and the title.
- Hovering an issue shows only the rendered Markdown description.
- Selecting an issue opens the details webview for editing.
- Creating a new issue opens the details webview instead of a quick-pick flow.
- A separate `All Tasks` tree view shows every existing issue in due-date order without group folders.
- Groups can be created and deleted from the tree.
- People can be created once and selected from issue editors.
- Deleting a group cascades to all issues inside it.
- Issues can be edited, completed, and deleted from the tree or details view.
- Priority, status, due date, and assignee are visible in the details view.
- Completed issues can be hidden from the tree.

## How To Use

1. Open a folder or workspace in VS Code.
2. Open the `Issues` view in the Activity Bar.
3. Use the tree toolbar or the inline row actions to create groups and issues.
4. Click an issue to open its details and edit its content.
5. Hover an issue row to read the rendered Markdown description.
6. Open the `All Tasks` view to edit existing issues in due-date order without groups.

## Tree Layout

The issue tree is organized like this:

- group rows at the top level
- issues nested under each group
- issue order inside each group:
  - due date
  - then title as the tie-breaker

Issue rows are displayed in the form:

```text
progress icon + priority circle + person + due date + title
```

Group rows show the group name and issue count.

Dates shown in the UI use `dd/mm/yy` formatting. The JSON file still stores due dates as `YYYY-MM-DD`.

## Commands

Available commands:

- `Local Issues: Create Issue`
- `Local Issues: Create Group`
- `Local Issues: Add Person`
- `Local Issues: Delete Group`
- `Local Issues: Edit Issue`
- `Local Issues: Complete Issue`
- `Local Issues: Delete Issue`
- `Local Issues: Change Status`
- `Local Issues: Change Priority`
- `Local Issues: Toggle Hide Completed`
- `Local Issues: Refresh`
- `Local Issues: Import Issues`
- `Local Issues: Export Issues`

Most of these commands are also available from:

- the tree toolbar
- group row hover actions
- issue row hover actions
- the command palette
- the issue details view

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
  "people": [
    { "id": "alex", "name": "Alex" }
  ],
  "issues": [
    {
      "id": "iss_001",
      "title": "Fix login redirect",
      "description": "Users are sent to the wrong page after login.",
      "groupId": "production",
      "status": "todo",
      "priority": "high",
      "dueDate": "2026-04-20",
      "personId": "alex",
      "createdAt": "2026-04-10T10:00:00Z",
      "updatedAt": "2026-04-10T10:00:00Z"
    }
  ]
}
```

- `version` is currently `1`
- `status` must be one of `todo`, `in-progress`, `blocked`, or `done`
- `priority` must be one of `low`, `medium`, or `high`
- `dueDate` is optional and uses `YYYY-MM-DD` in storage
- `personId` is optional and points at a person in the `people` array
- older files without `dueDate` or `people` still load correctly

## How To Develop

### Prerequisites

- VS Code
- Node.js 20+
- Corepack enabled `pnpm`

If `pnpm` is not already available, use Corepack:

```bash
corepack enable
corepack pnpm --version
```

### Install

From the repository root:

```bash
corepack pnpm install
```

### Build

Compile the extension once:

```bash
corepack pnpm run compile
```

Or keep TypeScript rebuilding automatically:

```bash
corepack pnpm run watch
```

### Run In Dev

1. Open this repository in VS Code.
2. Run the build watch task or start `corepack pnpm run watch` in a terminal.
3. Press `F5` to launch the extension in an Extension Development Host.

The debug configuration is defined in [`.vscode/launch.json`](.vscode/launch.json).

## Roadmap

Planned features and longer-term ideas are tracked in [ROADMAP.md](ROADMAP.md).

## Notes

- The extension expects a workspace folder to be open in the same VS Code window.
- Hover tooltips use Markdown, but long descriptions are still better read in the details pane.
- The details view is a webview, so changes to its HTML or script often require reloading the Extension Development Host.
- Release history is in [CHANGELOG.md](CHANGELOG.md).
