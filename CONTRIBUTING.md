# Contributing

Thanks for contributing to Local Issues.

## Development Setup

1. Install Node.js 24+.
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
- Run coverage report:
  - `corepack pnpm run coverage`
- Run coverage gate (required before PR):
  - `corepack pnpm run coverage:check`

## Run the Extension Locally

1. Open this repository in VS Code.
2. Start watch mode (`corepack pnpm run watch`) or run a one-off build.
3. Press `F5` to launch an Extension Development Host.

## Pull Request Guidelines

- Keep PRs focused and small where possible.
- Include a clear description of what changed and why.
- Add or update tests for behavior changes.
- Update `README.md` or `CHANGELOG.md` if user-facing behavior changed.
- Ensure `compile`, `test`, and `coverage:check` pass before opening a PR.

## Coverage Policy

- CI enforces per-file minimum coverage using `c8`.
- Required minimums for each file:
  - Branches: `80%`
  - Functions: `80%`
  - Lines: `80%`
  - Statements: `80%`

## Coding Guidelines

- Follow existing TypeScript patterns in `src/`.
- Prefer explicit validation/normalization for user/file inputs.
- Keep provider/command logic thin; put persistence logic in services.
- Add concise intent comments when behavior is non-obvious.

## Reporting Issues

Use GitHub Issues for bugs and feature requests:
- https://github.com/cees-kettenis/issue-tracker-vscode/issues

For security issues, see `SECURITY.md`.
