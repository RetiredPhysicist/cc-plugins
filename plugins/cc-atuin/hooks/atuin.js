/**
 * Pure helpers for talking to the Atuin CLI.
 *
 * These only build argument vectors and parse output. The mods API requires
 * `$.process.run` to be called at the hook's own call site, so the actual
 * process call stays in register.js and this module never sees `$`.
 */

export const ATUIN_AUTHOR = "claude-code";
export const ATUIN_TIMEOUT_MS = 10_000;
export const ATUIN_READ_TIMEOUT_MS = 5_000;

export function versionArgs() {
  return ["atuin", "--version"];
}

export function startArgs(command) {
  return ["atuin", "history", "start", "--author", ATUIN_AUTHOR, "--", command];
}

export function endArgs(historyId, exitCode) {
  return ["atuin", "history", "end", String(historyId), "--exit", String(exitCode)];
}

export function searchArgs({ limit = 200, query } = {}) {
  const args = ["atuin", "search", "--limit", String(limit), "--format", "{time}\t{command}"];
  if (query) args.push("--search-mode", "fuzzy", query);
  return args;
}

/**
 * Parse `atuin search --format '{time}\t{command}'` output.
 *
 * atuin prints one entry per line as `<local time>\t<command>`. A line without
 * a tab is not an entry, so it is skipped rather than guessed at.
 */
export function parseHistory(stdout) {
  const entries = [];
  for (const line of String(stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const timeRaw = line.slice(0, tab).trim();
    const command = line.slice(tab + 1).trim();
    if (!command) continue;

    const parsed = timeRaw ? Date.parse(timeRaw.replace(" ", "T")) : Number.NaN;
    entries.push({
      id: `atuin-${Number.isNaN(parsed) ? 0 : parsed}-${command.slice(0, 24)}`,
      text: command,
      timestamp: Number.isNaN(parsed) ? Date.now() : parsed,
      source: "atuin",
    });
  }
  return entries;
}

/** The history id atuin prints on `history start`, or null. */
export function parseHistoryId(stdout) {
  const id = String(stdout ?? "").trim();
  return id.length > 0 ? id : null;
}
