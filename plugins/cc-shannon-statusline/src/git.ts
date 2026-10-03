import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitFileStats, GitStatus } from "./types.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT = 1000;

export async function getGitStatus(cwd: string): Promise<GitStatus | null> {
  if (!cwd) return null;

  try {
    // Branch name — try multiple methods for no-commit repos
    let branch = "";
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd, timeout: GIT_TIMEOUT, encoding: "utf8" },
      );
      branch = stdout.trim();
    } catch {
      // No commits yet — try symbolic-ref
      try {
        const { stdout } = await execFileAsync(
          "git",
          ["symbolic-ref", "--short", "HEAD"],
          { cwd, timeout: GIT_TIMEOUT, encoding: "utf8" },
        );
        branch = stdout.trim();
      } catch {
        // Bare repo or detached HEAD
      }
    }
    if (!branch) return null;

    // Dirty state + file stats
    let isDirty = false;
    let fileStats: GitFileStats | null = null;
    try {
      const { stdout: statusOut } = await execFileAsync(
        "git",
        ["--no-optional-locks", "status", "--porcelain"],
        { cwd, timeout: GIT_TIMEOUT, encoding: "utf8" },
      );
      const trimmed = statusOut.trim();
      isDirty = trimmed.length > 0;
      if (isDirty) {
        fileStats = parseFileStats(trimmed);
      }
    } catch {
      // Ignore
    }

    // Ahead/behind
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout: revOut } = await execFileAsync(
        "git",
        ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
        { cwd, timeout: GIT_TIMEOUT, encoding: "utf8" },
      );
      const parts = revOut.trim().split(/\s+/);
      if (parts.length === 2) {
        behind = parseInt(parts[0], 10) || 0;
        ahead = parseInt(parts[1], 10) || 0;
      }
    } catch {
      // No upstream
    }

    return { branch, isDirty, ahead, behind, fileStats };
  } catch {
    return null;
  }
}

function parseFileStats(porcelainOutput: string): GitFileStats {
  const stats: GitFileStats = {
    modified: 0,
    added: 0,
    deleted: 0,
    untracked: 0,
  };

  for (const line of porcelainOutput.split("\n")) {
    if (line.length < 2) continue;
    const index = line[0];
    const worktree = line[1];

    if (line.startsWith("??")) {
      stats.untracked++;
    } else if (index === "A") {
      stats.added++;
    } else if (index === "D" || worktree === "D") {
      stats.deleted++;
    } else if (
      index === "M" ||
      worktree === "M" ||
      index === "R" ||
      index === "C"
    ) {
      stats.modified++;
    }
  }

  return stats;
}
