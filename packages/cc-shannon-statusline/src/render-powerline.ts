import { shortenDisplayPath } from "./path.js";
import { getContextPercent, getModelId, getModelName } from "./stdin.js";
import { formatThroughputParts } from "./throughput.js";
import type {
  ConfigCounts,
  GitStatus,
  StdinData,
  TranscriptData,
} from "./types.js";

// ── ANSI ─────────────────────────────────────────────────────

const R = "\x1b[0m";

function fg(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

// ── Tokyo Night palette ──────────────────────────────────────

const C = {
  blue:    [122, 162, 247] as const,
  green:   [158, 206, 106] as const,
  yellow:  [224, 175, 104] as const,
  purple:  [187, 154, 247] as const,
  cyan:    [125, 207, 255] as const,
  teal:    [115, 218, 202] as const,
  pink:    [247, 118, 142] as const,
  comment: [86, 95, 137] as const,
  text:    [169, 177, 214] as const,
};

// ── Helpers ──────────────────────────────────────────────────

let useNerd = true;

function icon(nerd: string, ascii: string): string {
  return useNerd ? nerd : ascii;
}

function bar(pct: number, w: number): string {
  const filled = Math.round((pct / 100) * w);
  const fill = useNerd ? "▰" : "#";
  const empty = useNerd ? "▱" : "-";
  return fill.repeat(filled) + empty.repeat(w - filled);
}

function pctClr(pct: number): readonly [number, number, number] {
  if (pct >= 75) return C.pink;
  if (pct >= 50) return C.yellow;
  return C.green;
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

// ── Lean segment: colored text ───────────────────────────────

function s(clr: readonly [number, number, number], text: string): string {
  return `${fg(...clr)}${text}${R}`;
}

const SEP = ` ${s(C.comment, "\u00b7")} `;

// ── Segment builders ─────────────────────────────────────────

function segDir(stdin: StdinData): string | null {
  const cwd = stdin.workspace?.project_dir ?? stdin.cwd ?? "";
  if (!cwd) return null;
  const short = shortenDisplayPath(cwd, {
    homeDir: process.env.HOME ?? "",
    maxLength: 30,
  });
  return s(C.blue, short);
}

function segGit(git: GitStatus | null): string | null {
  if (!git) return null;
  const dirty = git.isDirty ? "!" : "";
  const clr = git.isDirty ? C.yellow : C.green;
  const details: string[] = [];
  if (git.ahead > 0) details.push(`\u2191${git.ahead}`);
  if (git.behind > 0) details.push(`\u2193${git.behind}`);
  const extra = details.length > 0 ? ` ${details.join(" ")}` : "";
  return s(clr, `${icon("\ue0a0", "#")} ${git.branch}${dirty}${extra}`);
}

function segModel(stdin: StdinData): string | null {
  const name = getModelName(stdin);
  if (!name || name === "Unknown") return null;
  const modelId = getModelId(stdin);
  const modelSuffix = modelId ? ` ${s(C.comment, `· ${modelId}`)}` : "";
  return `${s(C.purple, `${icon("\u25c6", "*")} ${name}`)}${modelSuffix}`;
}

function segCtx(stdin: StdinData): string | null {
  const pct = getContextPercent(stdin);
  const b = bar(pct, 5);
  const c = pctClr(pct);
  const icon_ = icon("\u2b21", "#");
  const usage = stdin.context_window?.current_usage;
  let tok = "";
  if (usage) {
    const inT = fmtTok(usage.input_tokens ?? 0);
    const outT = fmtTok(usage.output_tokens ?? 0);
    const cache = (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    tok = ` ${s(C.comment, `${inT}\u2191`)} ${s(C.comment, `${outT}\u2193`)}`;
    if (cache > 0) tok += ` ${s(C.comment, `c:${fmtTok(cache)}`)}`;
  }
  return `${s(c, `${icon_} ${b} ${pct}%`)}${tok}`;
}

function segThroughput(transcript: TranscriptData, showThroughput: boolean): string | null {
  if (!showThroughput) return null;
  const parts = formatThroughputParts(transcript.throughput);
  if (!parts) return null;
  const text = parts.map(({ key, value }) => `${s(C.comment, key)} ${s(C.text, value)}`).join(SEP);
  return `${s(C.comment, icon("»", ">"))} ${text}`;
}

function segTools(transcript: TranscriptData): string | null {
  const running = transcript.tools.filter((t) => t.status === "running");
  const completed = transcript.tools.filter((t) => t.status === "completed");
  const counts = new Map<string, number>();
  for (const t of completed) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);

  const parts: string[] = [];
  if (running.length > 0) {
    parts.push(s(C.yellow, `${icon("\u21bb", ">")} ${running.slice(-2).map((t) => t.name).join(",")}`));
  }
  const show = ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Agent"];
  for (const name of show) {
    const c = counts.get(name) ?? 0;
    if (c > 0) parts.push(s(C.text, `${name}${c > 1 ? `\u00d7${c}` : ""}`));
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function segTodos(transcript: TranscriptData): string | null {
  if (transcript.todos.length === 0) return null;
  const done = transcript.todos.filter((t) => t.status === "completed").length;
  const total = transcript.todos.length;
  return s(C.purple, `${icon("\u25b8", ">")} ${done}/${total}`);
}

function segAgents(transcript: TranscriptData): string | null {
  const running = transcript.agents.filter((a) => a.status === "running");
  if (running.length === 0) return null;
  const names = running.slice(-2).map((a) => a.type).join(",");
  return s(C.teal, names);
}

function segDuration(sessionDuration: string): string | null {
  if (!sessionDuration) return null;
  return s(C.comment, `${icon("\u29d6", "~")} ${sessionDuration}`);
}

// ── Main render ──────────────────────────────────────────────

export function renderPowerline(
  stdin: StdinData,
  transcript: TranscriptData,
  git: GitStatus | null,
  _configCounts: ConfigCounts,
  sessionDuration: string,
  opts: { nerdFont?: boolean; throughput?: boolean } = {},
): void {
  useNerd = opts.nerdFont ?? true;

  // ALL segments on ONE line to avoid wrapping/squishing
  const parts = [
    segDir(stdin),
    segGit(git),
    segModel(stdin),
    segCtx(stdin),
    segThroughput(transcript, opts.throughput ?? true),
    segDuration(sessionDuration),
    segTools(transcript),
    segTodos(transcript),
    segAgents(transcript),
  ].filter(Boolean) as string[];

  if (parts.length > 0) console.log(parts.join(SEP));
}
