# Contributing

Thanks for contributing to Local Issues.

## Development Setup

1. Install Node.js 20+.
2. Enable Corepack:
   - `corepack enable`
3. Install dependencies:
   - `corepack pnpm install`

## Build and Test

- Type-check/build once:
  - `corepack pnpm run compile`
- Watch mode:
  - `corepack pnpm run watch`
- Run tests:
  - `corepack pnpm test`

## Run the Extension Locally

1. Open this repository in VS Code.
2. Start watch mode (`corepack pnpm run watch`) or run a one-off build.
3. Press `F5` to launch an Extension Development Host.

## Pull Request Guidelines

- Keep PRs focused and small where possible.
- Include a clear description of what changed and why.
- Add or update tests for behavior changes.
- Update `README.md` or `CHANGELOG.md` if user-facing behavior changed.
- Ensure `compile` and `test` pass before opening a PR.

## Coding Guidelines

- Follow existing TypeScript patterns in `src/`.
- Prefer explicit validation/normalization for user/file inputs.
- Keep provider/command logic thin; put persistence logic in services.
- Add concise intent comments when behavior is non-obvious.

## Reporting Issues

Use GitHub Issues for bugs and feature requests:
- https://github.com/cees-kettenis/issue-tracker-vscode/issues

For security issues, see `SECURITY.md`.
