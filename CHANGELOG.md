# Changelog

## 1.1.0

- Added due dates to issues and kept the JSON format backward compatible with older files.
- Added assignees ("people") that can be created once and selected from issue editors.
- Added a flat `All Tasks` tree view ordered by due date, with inline editing and no group folders.
- Updated the issue tree to show progress icon, priority circle, assignee, due date, and title.
- Updated tree hover text to show only the rendered Markdown description.
- Kept the issue store schema at version `1` while making the new fields optional.
- Added support for showing dates as `dd/mm/yy` in the UI while still storing `YYYY-MM-DD`.

## 1.0.1

* Updated broken links in documentation.

## 1.0.0

- First Marketplace release of Local Issues Tracker.
- Local issue and group management inside a dedicated VS Code sidebar.
- Workspace-backed JSON storage with import/export support.
- Issue details editing in a webview.
