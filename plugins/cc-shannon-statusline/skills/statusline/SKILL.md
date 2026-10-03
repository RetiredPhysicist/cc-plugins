---
name: statusline
description: Orientation for the cc-shannon-statusline Claude Code plugin. Use when working on this plugin's build, install hook, rendering, or distribution.
---

# cc-shannon-statusline — AI Agent Orientation

## What is this

A Claude Code plugin: a statusline hook script. Reads JSON from stdin, prints a multi-line ANSI HUD to stdout, and writes a Bridge JSON file (default `~/Library/Caches/shannon/status.json`) for downstream consumers.

Distribution is the plugin marketplace, not npm. `scripts/install.sh` runs on `SessionStart`, copies the bundled `dist/` to `~/.shannon/cc-shannon-statusline/`, and points the user's `statusLine` at that stable path.

Public repo: [`RetiredPhysicist/cc-plugins`](https://github.com/RetiredPhysicist/cc-plugins). MIT licensed. Zero runtime dependencies.

## Boundaries

- This repo is **independent** from the Shannon GUI repo. Do **not** add any Shannon source/build refs here. Do **not** push or pull from any Shannon-related git remote.
- Single remote: `origin → git@github.com:RetiredPhysicist/cc-plugins.git`. Verify with `git remote -v` before any push.
- Repo is **public**. Anything committed here is world-visible. No internal docs, no plans, no Shannon roadmap.

## Code map

```
src/
  index.ts          entry: stdin → parallel collectors → render + bridge write
  render.ts         7-line cyberpunk ANSI HUD renderer
  bridge.ts         JSON bridge file writer
  config.ts         plugin config (~/.shannon/cc-shannon-statusline/config.json)
  transcript.ts     JSONL transcript parser (tools/agents/todos/file activity)
  throughput.ts     transcript-observed response timing formatter
  git.ts            git status detection (branch/dirty/ahead/behind)
  config-counter.ts CLAUDE.md/rules/MCP/hooks file counter
  stdin.ts          stdin payload schema + parser
  path.ts           path normalization & fish-style abbreviation
  types.ts          shared TypeScript types
```

## Common commands

| Command | Purpose |
|---------|---------|
| `bun install` | install dev deps |
| `bun run build` | TS → `dist/` (auto adds shebang + chmod 755) |
| `bun run dev` | `tsc --watch` |
| `bun run test:stdin` | end-to-end smoke with sample payload |
| `bunx tsc --noEmit` | typecheck only |
| `bun run sync:shannon` | build + copy `dist/` → `$SHANNON_DIR/src-tauri/resources/statusline-plugin/dist/` (defaults to `~/Desktop/Shannon`) |

## Conventions

- TypeScript strict; no `any` unless boundary-inevitable
- No runtime deps — keep `dependencies` empty in `package.json`
- All user-facing strings in `render.ts` are ANSI-colored; preserve NBSP-replacement to prevent terminal wrapping
- Bridge JSON is a public contract — schema changes need version bump per `RELEASING.md`
- `rain` is a plugin setting, not a Claude Code `statusLine` field; keep its default enabled for compatibility
- Throughput labels are transcript-observed estimates; do not describe them as provider-reported TTFT/decode metrics

## Where things live

- Dev workflow: `CONTRIBUTING.md`
- Release: push to `main`; the plugin version is the commit SHA
- User-facing docs (install, hook config, HUD format, bridge schema): `README.md`

## Don't

- Do not introduce runtime dependencies.
- **Do commit `dist/`.** The marketplace serves the repository as-is and does not build on install, so a stale `dist/` ships stale code. Run `bun run build` before committing source changes; CI fails when the two disagree.
- Do not add references to Shannon-internal modules, file paths, or any private repo content.
