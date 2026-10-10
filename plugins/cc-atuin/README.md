# cc-atuin

Atuin history for Claude Code.

Claude Code keeps its own prompt history, but that history is invisible to your
shell, and it never records what the agent actually ran. This plugin closes both
gaps:

- **Your prompts go into Atuin.** Every prompt you submit is written to the same
  database your shell uses, so `Ctrl+R` in a terminal finds it.
- **Claude's bash commands go into Atuin.** Every `Bash` tool call is bracketed
  with `atuin history start` / `end`, so the exit code and duration land next to
  your own shell commands.
- **`/history` searches the whole thing.** The pane filters the unified history
  and fills your prompt with the command you pick.

## Requirements

- Claude Code 2.1.287 or later, for mods.
- [Atuin](https://atuin.sh) installed and on `PATH`.

Everything runs through your own `atuin` binary. There is no account, no cloud
service, and no network request beyond what Atuin itself does.

## Install

```bash
claude plugin marketplace add RetiredPhysicist/cc-plugins
claude plugin install cc-atuin@cc-plugins
```

Then run `/reload-plugins` in an open session, or start a new one.

> This plugin is a mod: it runs inside Claude Code with your permissions. Install
> it only from a marketplace you trust.

## Use

| Action | What happens |
| --- | --- |
| Submit a prompt | Written to Atuin. |
| Claude runs a bash command | Written to Atuin with its exit code. |
| `/history` | Opens a search pane over the unified history. |

In the pane, type to filter, click a row to select it, then press **Use** to put
that command in your prompt. `Esc` closes the pane.

The shell's own `Ctrl+R` searches the same records, because this plugin writes to
the same Atuin database.

## What it does not do

Claude Code does not let a mod bind a key. The shell's Up arrow opens history
inside a terminal; here the entry point is `/history`. If you want `Ctrl+R`
instead, Claude Code already binds it to its own built-in search, and the
keybinding file at `~/.claude/keybindings.json` can rebind `history:search`.

## Verify

```bash
atuin search --limit 5 --format '{time}\t{command}'
```

Prompts and agent bash commands should appear with the author `claude-code`.

## Development

```bash
node --test test/*.test.mjs   # the fuzzy matcher and the Atuin bridge
claude plugin test .          # the hooks, in a host-like environment
```

The tests cover the fuzzy matcher and the Atuin bridge against a fake process
runner, so they need neither Claude Code nor a real Atuin database.

## License

MIT
