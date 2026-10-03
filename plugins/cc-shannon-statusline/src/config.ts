import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface StatuslineConfig {
  rain: boolean;
  throughput: boolean;
}

export const DEFAULT_STATUSLINE_CONFIG: StatuslineConfig = { rain: true, throughput: true };

/**
 * Config lives under a package-specific directory. Older installs of the
 * pre-rename package used the same directory without the `cc-` prefix; read
 * that path as a fallback so an upgrade does not silently reset the user's
 * toggles.
 */
export function getConfigPath(homeDir = homedir()): string {
  const current = join(homeDir, ".shannon", "cc-shannon-statusline", "config.json");
  const legacy = join(homeDir, ".shannon", "shannon-statusline", "config.json");
  if (!existsSync(current) && existsSync(legacy)) return legacy;
  return current;
}

export function loadConfig(homeDir = homedir()): StatuslineConfig {
  const config: StatuslineConfig = { ...DEFAULT_STATUSLINE_CONFIG };

  try {
    const configPath = getConfigPath(homeDir);
    if (!existsSync(configPath)) return config;

    const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (typeof raw === "object" && raw !== null) {
      if ("rain" in raw && typeof raw.rain === "boolean") config.rain = raw.rain;
      if ("throughput" in raw && typeof raw.throughput === "boolean") config.throughput = raw.throughput;
    }
  } catch {
    // Keep the default when the optional config is unavailable or invalid.
  }

  return config;
}
