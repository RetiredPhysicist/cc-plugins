---
description: Install cc-shannon-statusline as your Claude Code statusline
allowed-tools: Bash, Read, Edit
---

Run the setup command:

```bash
cc-shannon-statusline setup
```

This detects your Node.js path, writes `~/.shannon/cc-shannon-statusline/run.sh`,
and patches `~/.claude/settings.json` with the correct `statusLine.command`.

If `cc-shannon-statusline` is not in PATH yet, install it first:

```bash
npm install -g cc-shannon-statusline
```

Then restart Claude Code. The HUD appears below every response.
