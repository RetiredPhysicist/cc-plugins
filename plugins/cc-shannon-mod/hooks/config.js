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
    if (parsed && typeof parsed === "object" && typeof parsed.rain === "boolean") {
      config.rain = parsed.rain;
    }
  } catch {
    // An unreadable or malformed config keeps the defaults.
  }
  return config;
}

export function serializeConfig(config) {
  return `${JSON.stringify({ rain: config.rain }, null, 2)}\n`;
}
