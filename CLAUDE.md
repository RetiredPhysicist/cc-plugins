# cc-plugins

Claude Code plugins under `plugins/`. Only `cc-shannon-statusline` has a
`package.json` (private build tooling; commits `dist/`). Marketplace plugins
omit `version` on purpose — the installable revision is the commit SHA.

## Release / version

Push to `main` is the release. `cc-shannon-statusline` stays private and is
never published to npm; bump its `package.json` version by hand when the
committed `dist/` changes.

## Checks

```bash
cd plugins/cc-shannon-statusline
bun install --frozen-lockfile
bun test
bun run build          # committed dist/ must stay in sync
```

CI also runs unit/plugin tests for the hook plugins and `claude plugin validate`.
