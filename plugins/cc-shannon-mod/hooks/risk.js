/**
 * Patterns for commands that deserve a second look before they run.
 *
 * The goal is a narrow, explainable list — a guard that fires on everything gets
 * turned off, and then it guards nothing. Each entry says why it matched, so the
 * prompt can tell the user what it noticed.
 */

const RULES = [
  {
    id: "rm-recursive",
    pattern: /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/,
    because: "recursive delete",
  },
  {
    id: "rm-force-path",
    pattern: /\brm\s+-[a-zA-Z]*[fF][a-zA-Z]*\s+(?:\/|~|\$HOME|\*)/,
    because: "force delete of a root, home, or glob path",
  },
  {
    id: "git-push-force",
    // `--force-with-lease` and `--force-if-includes` are the guarded variants:
    // they refuse to overwrite work you have not seen. Only the bare flags
    // rewrite whatever is on the remote.
    pattern: /\bgit\s+push\b[^\n]*(?:--force(?!-with-lease|-if-includes)(?![\w-])|\s-f(?:\s|$))/,
    because: "force push rewrites shared history",
  },
  {
    id: "git-reset-hard",
    pattern: /\bgit\s+reset\s+--hard\b/,
    because: "hard reset discards uncommitted work",
  },
  {
    id: "git-clean",
    pattern: /\bgit\s+clean\s+-[a-zA-Z]*[fdx]/,
    because: "clean deletes untracked files",
  },
  {
    id: "disk-write",
    pattern: /\bdd\b[^\n]*\bof=\/dev\/|\bmkfs(?:\.\w+)?\b/,
    because: "raw disk write",
  },
  {
    id: "chmod-root",
    pattern: /\bchmod\s+(?:-[a-zA-Z]+\s+)*777\b/,
    because: "world-writable permissions",
  },
  {
    id: "sql-drop",
    pattern: /\b(?:DROP\s+(?:DATABASE|TABLE|SCHEMA)|TRUNCATE\s+TABLE)\b/i,
    because: "destructive SQL",
  },
  {
    id: "publish",
    pattern: /\b(?:npm|pnpm|yarn)\s+publish\b|\bdocker\s+push\b/,
    because: "publishes an artifact others may consume",
  },
  {
    id: "sudo",
    pattern: /(?:^|[;&|]\s*)sudo\b/,
    because: "runs with elevated privileges",
  },
];

/**
 * Match a shell command. Returns the matched rules, most specific first, or an
 * empty array when nothing matched.
 */
export function assessCommand(command) {
  const text = String(command ?? "");
  if (!text.trim()) return [];
  return RULES.filter((rule) => rule.pattern.test(text)).map((rule) => ({
    id: rule.id,
    because: rule.because,
  }));
}

/** A one-line reason suitable for a prompt. */
export function describeRisks(risks) {
  if (!risks.length) return "";
  return risks.map((risk) => risk.because).join("; ");
}

/**
 * The decision to use when the guard itself fails.
 *
 * A gating hook that throws is fail-open in the engine: the tool runs anyway.
 * That is a reasonable default for hooks in general, but wrong for a safety
 * guard, so the guard refuses for itself when it cannot finish. This is not a
 * judgement about the command, and the wording says so rather than inventing a
 * risk the guard never found.
 */
export function guardFailure() {
  return {
    allowed: false,
    reason: "the guard could not finish checking this command",
    denial: "The guard failed before it could judge this command. Re-run it if you meant it.",
  };
}

export const RISK_RULE_IDS = RULES.map((rule) => rule.id);
