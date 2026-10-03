# cc-shannon-mod

Mission control for Claude Code, as a mod.

A statusline is an external command: Claude Code hands it a JSON snapshot, and it
has to reconstruct what happened by reading the transcript from disk. A mod runs
inside Claude Code and sees the event stream. That difference is the whole point
of this plugin — it **measures** turn timing instead of estimating it.

## Install

```bash
claude plugin marketplace add RetiredPhysicist/cc-plugins
claude plugin install cc-shannon-mod@cc-plugins
```

Then run `/reload-plugins`, or start a new session.

## What you get

### A band above the prompt

Three compact rows, always present:

```
◈ shannon  claude-sonnet-5  ██████░░░░ 58%  ↓ 12.4k
first token 840ms  decode 62.4 tok/s  8 req  last turn 4.2s
↻ Bash  npm test
```

Row one is the model and context occupancy. Row two is measured timing. Row three
lists what is running right now, and turns amber while a tool works.

### `/shannon` — a pane with three tabs

| Tab | Shows |
| --- | --- |
| **Now** | Session duration, request count, first-token time and its range, decode rate, context, and the tools running this moment |
| **Today** | Today's turns, tokens, cache reuse, tool calls, and time spent working; plus a seven-day rollup |
| **Guard** | Whether the guard is on, and the recent commands it questioned and how they ended |

### A guard for risky commands

Before a shell command runs, the guard checks it against a narrow, explainable
list and asks first when it matches:

- recursive deletes, force pushes, hard resets, `git clean -fdx`
- raw disk writes, world-writable permissions
- destructive SQL, publishing, `sudo`

It asks through Claude Code's own dialog. **When nobody answers — a `claude -p`
run, for example — it refuses**, so an unattended command cannot slip through.

`--force-with-lease` and `--force-if-includes` are treated as safe: they refuse to
overwrite work you have not seen, which is the point of using them.

### A usage ledger

Each turn's tokens, tool calls, and duration go into a per-day bucket in the
plugin's own store. The Today tab reads it back, and it survives restarts. Only
the newest 30 days are kept.

## Commands

| Command | Does |
| --- | --- |
| `/shannon` | Open the pane |
| `/shannon-guard` | Turn the risky-command guard on or off |
| `/shannon-reset-ledger` | Clear the recorded usage ledger |

## Measured, not estimated

The statusline package reports transcript-observed estimates because a
subprocess cannot see the response stream. This plugin can, so:

- **First token** is the time between sending the request and the first streamed
  chunk.
- **Decode rate** divides output tokens by the streaming time, excluding the wait
  for the first token — otherwise a slow start would drag the rate down.

Subagent requests count too; `turn.step` fires for them with `e.agentId` set.

## Requirements

- Claude Code 2.1.287 or later, for mods
- Node.js 22 or later

No network access, no API key, and no configuration file.

## Development

```bash
# pure helpers
node --test test/*.test.mjs

# hooks, in an environment like the one they run in
claude plugin test .
```

## License

MIT
