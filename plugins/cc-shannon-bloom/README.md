# cc-shannon-bloom

A live [Gource](https://gource.io)-style film of a Claude Code session, drawn in
a pane beside the transcript.

Projects (working directories) become constellations, sessions light up as
stars, subagents branch from the session that spawned them, tool calls fly as
colored sparks, and each prompt you send arrives as a warm comet. The sky
follows the wall clock.

This is a mod, not a renderer: it runs the film live on the event stream instead
of reading a database and writing an MP4. The world simulation, camera and
palette are adapted from [opencode-bloom](https://github.com/kitlangton/opencode-bloom)
(MIT, Kit Langton).

## Install

```bash
claude plugin marketplace add RetiredPhysicist/cc-plugins
claude plugin install cc-shannon-bloom@cc-plugins
```

Then run `/reload-plugins`, or start a new session.

## Use

```
/bloom          open the map
/bloom-toggle   open or close it
```

The pane docks beside the transcript and redraws on its own timer, so the map
moves whether or not any event fired.

## What's on screen

```
12:04  you  ·  3 sessions  1 agents  42 msgs  118 tools
┌──────────────────────────────────────────────────────────────┐
│                        ●            ●                        │
│              ◉ cc-plugins  ··◦•                              │
│                    •            ·                           │
│                          ◉ Kuiper                            │
│      ··◈··                    ●                              │
│       ◉ Shannon                                              │
└──────────────────────────────────────────────────────────────┘
▁▁▂▃▅▇▅▃▂▁▁
```

- **Hubs** (`◉`) are projects, colored by bloom's palette; a worktree inherits a
  dimmer shade of its main checkout.
- **Sessions** (`●`) are root sessions, sized by how much happened in them.
- **Subagents** (`•`) branch from their parent, with a bead racing down the new
  edge and a ring when they arrive.
- **Tool sparks** are one glyph per kind: read `·`, edit `✦`, shell `»`, web `○`,
  delegate `◦`.
- **Your prompts** are the warm `◈` comet, with a trail and a landing ring.
- **Edited files** drift their basenames off the session, rate-limited.
- **The header** is the clock, your label, and the session / agent / message /
  tool counters.
- **The strip** under the map is recent activity.

## Requirements

- Claude Code 2.1.287 or later, for mods
- A terminal surface (the map is a `Raster`; other surfaces get a fragment)

No network access, no API key.

## Development

```bash
node --test test/*.test.mjs   # the pure simulation, camera and renderer
claude plugin test .          # the hooks, in a host-like environment
```

The simulation (`hooks/sim.js`), camera (`hooks/camera.js`) and renderer
(`hooks/render.js`) carry no mods API, so they run and are tested under plain
Node. `hooks/register.js` is the only file that touches `$`.

## License

MIT. See [LICENSE](./LICENSE) for the opencode-bloom attribution.
