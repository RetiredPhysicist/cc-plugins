# cc-plugins

RetiredPhysicist monorepo for Claude Code plugins.

Each package keeps its own npm name, version, and release cadence:

| package | npm |
| --- | --- |
| `cc-shannon-statusline` | `npm:cc-shannon-statusline` |

Release a package by pushing a tag named `<package>-v<version>`, for example
`cc-shannon-statusline-v0.5.2`. The publish workflow builds and publishes only that
package.

Claude Code plugins that ship a mod live in their own repositories, because a
plugin is installed from a marketplace rather than from npm. See
[`cc-atuin`](https://github.com/RetiredPhysicist/cc-atuin).

## Development

```bash
cd packages/<package>
bun install   # or npm ci when a package-lock.json exists
bun run build
bun test
```

## Adding a package

1. Put it under `packages/<name>` with its own `package.json`, version, and npm name.
2. Keep the package self-contained; the monorepo root has no shared runtime code.
3. Add it to the table above.

The tag prefix must match the directory name, because `publish.yml` resolves the
package from the tag.
