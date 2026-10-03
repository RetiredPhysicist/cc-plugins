---
description: Install cc-shannon-statusline as your Claude Code statusline
allowed-tools: Bash
---

Re-run the statusline install. The plugin already does this on every session
start, so use this only to repair a broken or missing install:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/install.sh"
```

This copies the bundled build to `~/.shannon/cc-shannon-statusline/`, writes
`run.sh`, and points `statusLine` in `~/.claude/settings.json` at it. It leaves a
status line you configured yourself untouched. Restart Claude Code afterwards.
