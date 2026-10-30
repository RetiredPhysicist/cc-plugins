# cc-plugins

Claude Code plugins under `plugins/`. Only `cc-shannon-statusline` has a
`package.json` (private build tooling; commits `dist/`). Marketplace plugins
omit `version` on purpose — the installable revision is the commit SHA.

## Release / version

Preferred for the statusline package: Changesets from the repo root
(`npm ci --workspaces=false`, then `npx changeset`). Merging to `main` lets
`.github/workflows/release.yml` open a Version Packages PR. The package stays
private — no npm publish.

Other plugins: push to `main` is the release.

## Checks

```bash
cd plugins/cc-shannon-statusline
bun install --frozen-lockfile
bun test
bun run build          # committed dist/ must stay in sync
```

CI also runs unit/plugin tests for the hook plugins and `claude plugin validate`.
