#!/usr/bin/env bash
#
# Runs on SessionStart. Puts the HUD at a stable path and points the user's
# statusLine at it.
#
# The plugin cache directory is named after the plugin version, so it changes on
# every update. A statusLine command cannot reference ${CLAUDE_PLUGIN_ROOT}, so
# the HUD is copied to a fixed location and the statusLine points there. That
# also means a `claude plugin update` alone refreshes the HUD.
#
# Idempotent and conservative: it only writes the statusLine field when the
# field is absent or already points at this plugin. A statusLine the user set to
# something else is left untouched.
set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
INSTALL_DIR="${CC_SHANNON_STATUSLINE_DIR:-$HOME/.shannon/cc-shannon-statusline}"
SETTINGS="${CLAUDE_SETTINGS_PATH:-$HOME/.claude/settings.json}"
RUNNER="$INSTALL_DIR/run.sh"

if [ ! -f "$PLUGIN_ROOT/dist/index.js" ]; then
  echo "cc-shannon-statusline: dist/index.js missing; skipping install" >&2
  exit 0
fi

mkdir -p "$INSTALL_DIR"

# Refresh the bundled build. This is what makes an update take effect.
cp -R "$PLUGIN_ROOT/dist/." "$INSTALL_DIR/dist/"

# A fixed entry point the statusLine can call. Resolve node now, because the
# statusLine runs with a minimal PATH where a version manager's shims may be
# absent.
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "cc-shannon-statusline: node not found on PATH; skipping install" >&2
  exit 0
fi

cat > "$RUNNER" <<EOF
#!/usr/bin/env bash
exec "$NODE_BIN" "$INSTALL_DIR/dist/index.js" "\$@"
EOF
chmod +x "$RUNNER"

# Point settings.json at the runner, but only when that is our field to set.
node - "$SETTINGS" "$RUNNER" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [, , settingsPath, runner] = process.argv;

let settings = {};
try {
  const raw = fs.readFileSync(settingsPath, "utf8");
  settings = raw.trim() ? JSON.parse(raw) : {};
} catch (error) {
  if (error.code !== "ENOENT") {
    console.error(`cc-shannon-statusline: cannot read ${settingsPath}: ${error.message}`);
    process.exit(0);
  }
}

const current = settings.statusLine;
const currentCommand = typeof current?.command === "string" ? current.command : "";
// Anything this plugin might have installed before: its own runner, an earlier
// stable path, or the bare command name from the pre-rename npm package.
const LEGACY_COMMANDS = new Set(["shannon-statusline", "cc-shannon-statusline"]);
const ours = (command) => {
  if (command === runner) return true;
  if (LEGACY_COMMANDS.has(command.trim())) return true;
  if (command.includes(".shannon/cc-shannon-statusline/")) return true;
  if (command.includes(".shannon/shannon-statusline/")) return true;
  return false;
};

if (current && !ours(currentCommand)) {
  // The user configured their own status line; leave it alone.
  process.exit(0);
}

if (currentCommand === runner && current.refreshInterval === 1) {
  // Already installed and current.
  process.exit(0);
}

settings.statusLine = { ...(current ?? {}), type: "command", command: runner, refreshInterval: 1 };

fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
NODE

exit 0
