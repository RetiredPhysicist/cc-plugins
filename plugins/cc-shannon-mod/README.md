# cc-shannon-mod

The [cc-shannon-statusline](../cc-shannon-statusline) HUD, as a mod — plus what a
statusline cannot do.

It looks and reads the same: same palette, same icons, same separators, same
matrix rain. What changes is where the numbers come from. A statusline is a
subprocess that receives a JSON snapshot and reconstructs activity from the
transcript, so its speed figures are estimates. A mod runs inside Claude Code and
sees the response stream, so its timing is measured.

## Install

```bash
claude plugin marketplace add RetiredPhysicist/cc-plugins
claude plugin install cc-shannon-mod@cc-plugins
```

Then run `/reload-plugins`, or start a new session.

## The band

Above the prompt, one row per kind of fact. A row with nothing to say is omitted,
so an idle session stays short.

```
ｦｧｨｩｪｫ  ⌘ ~/D/project │ ⎇ main* ↑2 !3 +1 │ ✦ 12m │ ⊟ auto
ｬｭｮｯｰｱ  λ Opus · claude-opus-4-6 │ ⊡ ██████░░░░ 58% (200k) │ ↑36k ↓300 ⊗8.5k
ｲｳｴｵｶｷ  ※ ×3 CLAUDE.md │ ≡ ×2 rules │ ⊕ ×4 MCPs │ ↩ ×12 hooks │ ★ ×5 Skills
ｸｹｺｻｼｽ  » TTFT 840ms │ Decode 62.4 tok/s │ 8 req
ｾｿｰｱｲｳ  ↻ Bash: npm test (3s)
ｴｵｶｷｸｹ  ✔ Read ×12 │ ✔ Edit ×7 │ ✔ Bash ×4
ｺｻｼｽｾｿ  ✔ write the tests │ ↻ ship it (1/2)
012345  ✔ 12 │ ⚠ 1 │ ⌀ 820ms
6789λΨ  ↻ Explore
ΩΔΦ012  ▸ say the queued thing (+1)
345678  (•‿•) Lv3 ✔4 ⎇2
9λΨΩΔΦ  ⊡ +2.4%/turn · ~7 turns left
012345  ⌀ Bash 3s · Read 1.2s
```

The left block is the statusline's six-column matrix rain, driven by a redraw
timer.

## `/shannon`

The same rows as the band, plus a slowest-tool ranking, today's rollup, and
guard state:

```
1. Bash 18s
2. Read 1.2s
✔ 12 turns │ ↓8.4k │ ↑36k │ ⊗1.2M 62% cache
▲ guard on
```

## What a statusline cannot do

- **Measured timing.** First token is the gap between sending a request and the
  first streamed chunk. Decode rate uses the streaming time only, so a slow start
  does not drag the rate down. The statusline reports these as estimates because
  it cannot see the stream.
- **Live activity.** The running tool comes from `tool.call`, not from a
  transcript re-read.
- **Finished-work counters.** Completed and failed tool calls are counted as they
  finish, with an average duration, instead of being re-derived from the
  transcript.
- **Subagents.** A spawned subagent is listed while it runs, from `agent.spawn`.
- **The spinner.** Claude Code's own spinner keeps its animation and gains live
  progress: the tool that is running and how many have finished this turn. A
  statusline cannot reach that line at all.
- **A hint, when it matters.** Two failures in a row, a nearly full context, or
  many tools at once produce one line saying so. Nothing is shown when the
  session is healthy.
- **A guard.** Before a shell command runs, risky ones ask first. When nobody
  answers — a `claude -p` run — the command is refused. With notifications on,
  the guard also raises a native one, so a command stopped in a background pane
  is not missed.
- **A ledger.** Each turn's tokens and tool calls go into a per-day bucket that
  survives restarts and feeds the rollup.
- **A companion.** A passing test run or a commit feeds a small pet; red builds
  do not. It lives in the same `$.store` as the ledger, so it survives restarts.
- **A prompt queue.** `/q <text>` holds prompts while a turn is running and sends
  the next one when the turn ends. `/shannon-queue` lists, reorders, and drops
  them.
- **A context runway.** The lens samples context growth per turn and estimates
  how many turns remain before compaction.
- **Slowest-tool latency.** Every finished tool is timed directly from its call
  events; the row shows the slowest measured tool per name.

## Commands

| Command | Does |
| --- | --- |
| `/shannon` | Open the pane |
| `/shannon-guard` | Turn the risky-command guard on or off |
| `/shannon-rain` | Turn the matrix rain on or off |
| `/shannon-toggle <name>` | Turn `companion`, `lens`, `queue`, `latency`, or `notify` on or off |
| `/q <text>` | Queue a prompt for the end of the current turn |
| `/shannon-queue [list\|drop n\|up n\|down n]` | Manage queued prompts |

## Configuration

`~/.shannon/cc-shannon-mod/config.json`

```json
{
  "rain": true,
  "companion": true,
  "lens": true,
  "queue": true,
  "latency": true,
  "notify": false
}
```

The file is optional; `/shannon-rain` and `/shannon-toggle` write it for you.

| Option | Default | Effect |
| --- | ---: | --- |
| `rain` | `true` | Matrix column down the left edge of the band. |
| `companion` | `true` | Show the test-and-commit pet. |
| `lens` | `true` | Show context growth and remaining turns. |
| `queue` | `true` | Enable `/q` and the queue row. |
| `latency` | `true` | Show the slowest measured tools. |
| `notify` | `false` | Raise a native notification when the guard stops a command. |

### Notifications

`notify` is off by default. Turn it on with `/shannon-toggle notify`, or by
setting the key to `true`.

It uses Claude Code's own `$.ui.notify`, added in 2.1.295, so the notification
goes through whatever channel your notification setting names. On an older
Claude Code the call is absent and the setting does nothing — the guard itself
is unaffected either way. In a headless run there is no surface to notify and
the call reports `no-surface`, which is also harmless.

The notification names both the risk and the command, since a banner that only
says something was blocked sends you back to the terminal to find out what.

## The guard

It matches a narrow, explainable list and says why it matched:

- recursive deletes, force pushes, hard resets, `git clean -fdx`
- raw disk writes, world-writable permissions
- destructive SQL, publishing, `sudo`

`--force-with-lease` and `--force-if-includes` are treated as safe: they refuse to
overwrite work you have not seen.

## Requirements

- Claude Code 2.1.287 or later, for mods
- Node.js 22 or later

No network access, no API key.

## Development

```bash
node --test test/*.test.mjs   # pure helpers
claude plugin test .          # the hooks, in a host-like environment
```

## License

MIT
