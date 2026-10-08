/**
 * Git status parsing, kept pure so it can be unit-tested.
 *
 * The statusline's `git.ts` reads branch, dirty state, ahead/behind and file
 * stats on every redraw. The mod reads the same facts through `$.process.run`,
 * but only once per turn; the parsing and the rendered detail string are the
 * same so both HUDs show the same row.
 *
 * Pure values only — no mods API here.
 */

/** The counts behind the statusline's `!3 +1 ✘1 ?2` detail string. */
export function parseFileStats(porcelainOutput) {
  const stats = { modified: 0, added: 0, deleted: 0, untracked: 0 };

  for (const line of String(porcelainOutput ?? "").split("\n")) {
    if (line.length < 2) continue;
    const index = line[0];
    const worktree = line[1];

    if (line.startsWith("??")) {
      stats.untracked += 1;
    } else if (index === "A") {
      stats.added += 1;
    } else if (index === "D" || worktree === "D") {
      stats.deleted += 1;
    } else if (index === "M" || worktree === "M" || index === "R" || index === "C") {
      stats.modified += 1;
    }
  }

  return stats;
}

/**
 * The git row's colored pieces, in the statusline's order: the branch, then
 * ahead, behind, modified, added, deleted and untracked, each a `{ text, tone }`
 * a caller maps onto its own palette.
 */
export function gitDetails(git) {
  if (!git) return [];

  const parts = [];
  if (git.ahead > 0) parts.push({ text: `↑${git.ahead}`, tone: "positive" });
  if (git.behind > 0) parts.push({ text: `↓${git.behind}`, tone: "danger" });

  const stats = git.fileStats;
  if (stats) {
    if (stats.modified > 0) parts.push({ text: `!${stats.modified}`, tone: "danger" });
    if (stats.added > 0) parts.push({ text: `+${stats.added}`, tone: "positive" });
    if (stats.deleted > 0) parts.push({ text: `✘${stats.deleted}`, tone: "danger" });
    if (stats.untracked > 0) parts.push({ text: `?${stats.untracked}`, tone: "muted" });
  }

  return parts;
}
