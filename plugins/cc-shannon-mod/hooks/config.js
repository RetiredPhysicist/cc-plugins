/**
 * Plugin configuration.
 *
 * A hooks module may only import its own files and `claude-code`, so the file
 * read and write happen at the call site with `$.fs`. This module holds the
 * shape, the path, and the parsing only.
 */

export const DEFAULT_CONFIG = {
  /** Matrix rain strip down the left edge of the band. */
  rain: true,
  /** The companion that grows as tests pass and commits land. */
  companion: true,
  /** Growth and runway for the context window. */
  lens: true,
  /** Queue prompts to send when the current turn ends. */
  queue: true,
  /** Slowest measured tools. */
  latency: true,
  /**
   * A native notification when the guard stops a command.
   *
   * Off by default: it needs Claude Code 2.1.295 or later, and it reaches the
   * person outside the session, so turning it on is their call.
   */
  notify: false,
};

/** Where the config lives, alongside the statusline's own toggles under ~/.shannon. */
export function configPath(homeDir) {
  return `${homeDir}/.shannon/cc-shannon-mod/config.json`;
}

/** Parse whatever the file holds. Anything unusable keeps the defaults. */
export function parseConfig(raw) {
  const config = { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      for (const key of Object.keys(DEFAULT_CONFIG)) {
        if (typeof parsed[key] === "boolean") config[key] = parsed[key];
      }
    }
  } catch {
    // An unreadable or malformed config keeps the defaults.
  }
  return config;
}

export function serializeConfig(config) {
  const out = {};
  for (const key of Object.keys(DEFAULT_CONFIG)) out[key] = Boolean(config[key]);
  return `${JSON.stringify(out, null, 2)}\n`;
}
