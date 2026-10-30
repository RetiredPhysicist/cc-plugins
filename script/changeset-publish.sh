#!/usr/bin/env bash
# Rebuild private packages that commit dist/, then run changeset publish
# (no-op for private packages). No tag publish.yml exists; Claude Code
# marketplace installs from the repo tree / commit SHA.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

for dir in "$root"/plugins/*/; do
  [ -f "$dir/package.json" ] || continue
  if node -e "const s=require(process.argv[1]).scripts||{}; process.exit(s.build?0:1)" "$dir/package.json"; then
    echo "Building $(basename "$dir")…"
    # statusline uses bun + frozen lock; require bun when bun.lock is present
    # so CI does not fall through to npm ci without a package-lock.json.
    if [ -f "$dir/bun.lock" ]; then
      if ! command -v bun >/dev/null 2>&1; then
        echo "error: $(basename "$dir") has bun.lock but bun is not on PATH (install bun@1.4.2; see .github/workflows/ci.yml)" >&2
        exit 1
      fi
      (cd "$dir" && bun install --frozen-lockfile && bun run build)
    else
      (cd "$dir" && npm ci --workspaces=false --no-audit --no-fund && npm run build)
    fi
  fi
done

# Prefer the root-installed CLI; nested package installs must not wipe it
if [ -x "$root/node_modules/.bin/changeset" ]; then
  exec "$root/node_modules/.bin/changeset" publish
fi
exec npx --no-install changeset publish
