<p align="center">
  <img src="./cc-shannon-statusline.png" alt="cc-shannon-statusline terminal HUD preview" width="100%" />
</p>

<h1 align="center">cc-shannon-statusline</h1>

<p align="center">
  Live ANSI HUD for <a href="https://claude.ai/code">Claude Code</a> with project, model, context, throughput, tool, agent, and configuration state.
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
  <a href="https://code.claude.com/docs/en/plugins"><img src="https://img.shields.io/badge/Claude%20Code-plugin-6b4fbb" alt="Claude Code plugin" /></a>
</p>

## Install

```bash
claude plugin marketplace add RetiredPhysicist/cc-plugins
claude plugin install cc-shannon-statusline@cc-plugins
```

Restart Claude Code, or run `/reload-plugins` in an open session. The status line
appears on the next session start.

### What the install does

A Claude Code plugin cannot set the main `statusLine` itself, and a plugin's own
directory changes on every update. So the plugin ships a `SessionStart` hook that:

1. Copies the bundled build to `~/.shannon/cc-shannon-statusline/`
2. Writes a fixed entry point at `~/.shannon/cc-shannon-statusline/run.sh`
3. Points `statusLine` in `~/.claude/settings.json` at that runner

Because the path is stable, `claude plugin update` alone refreshes the HUD.

The hook is conservative with your settings: it writes the `statusLine` field
only when that field is absent or already points at this plugin. A status line
you configured yourself is never overwritten. The logic is in
[`scripts/install.sh`](./scripts/install.sh).

`refreshInterval` is set to `1` (seconds), so the HUD also redraws between Claude
Code events.

### Requirements

- Node.js 22 or later, available as `node` on your `PATH`

### Uninstall

```bash
claude plugin uninstall cc-shannon-statusline@cc-plugins
```

That removes the plugin. The copied build and the `statusLine` entry stay behind,
because a plugin cannot run code on uninstall. Clear them with `/statusline
delete`, or remove the `statusLine` field from `~/.claude/settings.json` and
delete `~/.shannon/cc-shannon-statusline/`.


## HUD

Cyberpunk mode renders below each Claude Code response:

```text
⌘ ~/D/project  │  ⎇ main* ↑2 !3 +1  │  ✦ 12m  │  ⊟ auto
λ Opus · claude-opus-4-6  │  ⊡ ████████░░░░ 65% (200k)  │  ↑ 36k  ↓ 300  ⊗ 8.5k
» TTFT 1.24s  │  Decode ~62.4 tok/s · ~312 tok
※ ×3 CLAUDE.md  │  ⊕ ×4 MCPs  │  ↩ ×12 hooks  │  ★ ×5 Skills
──────────────────────────────────────────────────────
✔ Read ×12  │  ✔ Edit ×7  │  ✔ Bash ×4
↻ Bash: ~/D/project/src (3s)
```

When `model.display_name` and `model.id` differ, both are shown. The ID reflects the active model variant.

## Configuration

Optional file: `~/.shannon/cc-shannon-statusline/config.json`

```json
{
  "rain": true,
  "throughput": true
}
```

| Option | Type | Default | Effect |
|---|---|---:|---|
| `rain` | boolean | `true` | Show the matrix column in cyberpunk mode. |
| `throughput` | boolean | `true` | Show response metrics on line 3. |

Invalid or missing values use the defaults. Powerline mode is single-line and uses `·` separators:

```json
{
  "statusLine": {
    "type": "command",
    "command": "cc-shannon-statusline --style powerline",
    "refreshInterval": 1
  }
}
```

`throughput: false` also hides the throughput segment in powerline mode.

## Metrics

- `TTFT`: transcript-observed time from the preceding user/tool event to the first assistant event.
- `Decode`: transcript-observed output rate; `~` marks an estimate.

## Bridge

When a local consumer is listening, each invocation writes session data as NDJSON to `/tmp/shannon-<uid>.sock`.

## Development

```bash
bun install
bun test
bun run build
bun run test:stdin
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [RELEASING.md](./RELEASING.md).

Runtime requirement: Node.js `>= 22`.

## License

MIT
