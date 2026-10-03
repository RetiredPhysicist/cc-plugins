import * as fs from "node:fs";
import * as path from "node:path";
import type { ConfigCounts } from "./types.js";

export async function countConfigs(cwd: string): Promise<ConfigCounts> {
  const result: ConfigCounts = { claudeMd: 0, rules: 0, mcp: 0, hooks: 0, skills: 0 };
  if (!cwd) return result;

  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";

  // Count CLAUDE.md files (project + user)
  const claudeMdPaths = [
    path.join(cwd, "CLAUDE.md"),
    path.join(cwd, ".claude", "CLAUDE.md"),
    path.join(home, ".claude", "CLAUDE.md"),
  ];
  for (const p of claudeMdPaths) {
    if (fileExists(p)) result.claudeMd++;
  }

  // Count .mdc rules files
  const rulesDir = path.join(cwd, ".claude", "rules");
  if (dirExists(rulesDir)) {
    try {
      const entries = fs.readdirSync(rulesDir);
      result.rules = entries.filter((e) => e.endsWith(".mdc")).length;
    } catch {
      // Ignore
    }
  }

  // Count MCP servers from settings
  const configuredDir = process.env.CLAUDE_CONFIG_DIR?.trim()
    ? expandTilde(process.env.CLAUDE_CONFIG_DIR.trim(), home)
    : null;
  const settingsPath = path.join(home, ".claude", "settings.json");
  const legacySettingsPath = path.join(home, ".claude.json");
  const configuredSettingsPath = configuredDir
    ? path.join(configuredDir, "settings.json")
    : null;
  const projectSettingsPath = path.join(cwd, ".claude", "settings.json");
  const mcpServers = new Set<string>();

  for (const sp of [
    settingsPath,
    legacySettingsPath,
    configuredSettingsPath,
    projectSettingsPath,
  ]) {
    if (!sp) continue;
    try {
      if (fileExists(sp)) {
        const content = fs.readFileSync(sp, "utf8");
        const settings = JSON.parse(content);
        const servers = settings?.mcpServers;
        if (servers && typeof servers === "object") {
          for (const key of Object.keys(servers)) {
            mcpServers.add(key);
          }
        }
      }
    } catch {
      // Ignore
    }
  }
  result.mcp = mcpServers.size;

  // Count hooks
  const hookSettingsCandidates = [settingsPath, configuredSettingsPath];
  const hookEventNames = new Set<string>();
  try {
    for (const sp of hookSettingsCandidates) {
      if (!sp || !fileExists(sp)) continue;
      const content = fs.readFileSync(sp, "utf8");
      const settings = JSON.parse(content);
      const hooks = settings?.hooks;
      if (hooks && typeof hooks === "object") {
        for (const name of Object.keys(hooks)) {
          hookEventNames.add(name);
        }
      }
    }
    result.hooks = hookEventNames.size;
  } catch {
    // Ignore
  }

  // Count skills (includes symlinks)
  const skillsDir = path.join(home, ".claude", "skills");
  if (dirExists(skillsDir)) {
    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      result.skills = entries.filter((e) => e.isDirectory() || e.isSymbolicLink()).length;
    } catch {
      // Ignore
    }
  }

  return result;
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function expandTilde(input: string, home: string): string {
  if (!home) return input;
  if (input === "~") return home;
  if (input.startsWith("~/")) return path.join(home, input.slice(2));
  return input;
}
