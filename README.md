# cc-plugins

RetiredPhysicist plugins for [Claude Code](https://claude.ai/code), distributed as
a plugin marketplace.

| plugin | what it does |
| --- | --- |
| [`cc-shannon-statusline`](./plugins/cc-shannon-statusline) | A live HUD under the prompt: project, model, context, throughput, tools, agents, and config counts |
| [`cc-shannon-mod`](./plugins/cc-shannon-mod) | Mission control: measured turn timing, live activity, a risky-command guard, and a usage ledger |

Related: [`cc-atuin`](https://github.com/RetiredPhysicist/cc-atuin), kept in its own
repository.

## Install

```bash
claude plugin marketplace add RetiredPhysicist/cc-plugins
claude plugin install cc-shannon-statusline@cc-plugins
claude plugin install cc-shannon-mod@cc-plugins
```

`cc-shannon-statusline` and `cc-shannon-mod` overlap on purpose but see different
things. The statusline is an external command that receives a JSON snapshot and
reconstructs activity from the transcript, so its speed numbers are labelled
estimates. The mod runs inside Claude Code, so its timing is measured from the
response stream, and it can draw interactive UI and act on what it sees. Install
either or both; they do not conflict.

Or add the marketplace once and install from `/plugin` in a session.

## Update

```bash
claude plugin update cc-shannon-statusline@cc-plugins
```

Then restart Claude Code, or run `/reload-plugins`. Plugins here carry no
`version` field on purpose: the version is the source commit SHA, so a push to
`main` is the release.

## How plugins are laid out

Each plugin lives in `plugins/<name>/` with a `.claude-plugin/plugin.json`. Claude
Code reads the repository as-is and runs no install script, so a plugin that ships
built code commits that build and CI fails when the build is stale.

## Adding a plugin

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`.
2. Add it to `plugins` in [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).
3. Keep it self-contained. The repository root has no shared runtime code.
4. Commit any built output the plugin needs at install time.

## License

MIT
