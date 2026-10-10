/**
 * cc-atuin — Atuin history for Claude Code.
 *
 * Claude Code keeps its own prompt history, but that history is invisible to
 * the shell, and it never records what the agent ran. This mod closes both gaps:
 *
 *   - every submitted prompt is written to the Atuin DB
 *   - every bash tool call is bracketed with `atuin history start/end`, so its
 *     exit code lands in the same place as a shell command
 *   - `/history` opens a pane that searches the unified history and fills the
 *     prompt with the selection
 *
 * Recording is best-effort: a missing or failing atuin degrades to "no new
 * history" and never blocks a turn.
 */

import {
  ATUIN_READ_TIMEOUT_MS,
  ATUIN_TIMEOUT_MS,
  endArgs,
  parseHistory,
  parseHistoryId,
  searchArgs,
  startArgs,
  versionArgs,
} from "./atuin.js";
import { fuzzySearch } from "./fuzzy.js";

const PANE = "cc-atuin";
const RECENT_LIMIT = 200;
const DEDUP_WINDOW_MS = 5_000;

/** text -> timestamp, to swallow duplicate prompt events. */
const recentPrompts = new Map();
/** Pane state, shared by every hook call in this module. */
let query = "";
let results = [];
let selected = 0;
let available = null;

function isDuplicatePrompt(text) {
  const now = Date.now();
  for (const [key, at] of recentPrompts) {
    if (now - at > DEDUP_WINDOW_MS) recentPrompts.delete(key);
  }
  if (recentPrompts.has(text)) return true;
  recentPrompts.set(text, now);
  return false;
}

function clampSelection() {
  if (results.length === 0) selected = 0;
  else selected = Math.min(Math.max(selected, 0), results.length - 1);
}

function shortAge(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Run one atuin command. `$.process.run` rejects when the binary cannot start,
 * so every call is wrapped: a missing atuin degrades to a failed result rather
 * than breaking the hook that called it.
 */
async function runAtuin($, argv, { cwd, timeoutMs } = {}) {
  try {
    return await $.process.run(argv, { cwd, timeoutMs });
  } catch {
    return { exitCode: 127, stdout: "", stderr: "atuin could not be started" };
  }
}

/** Reload the pane's results for the current query. */
async function refreshPane($, { redraw }) {
  if (query) {
    const found = await runAtuin($, searchArgs({ limit: RECENT_LIMIT, query }), {
      timeoutMs: ATUIN_READ_TIMEOUT_MS,
    });
    const entries = found.exitCode === 0 ? parseHistory(found.stdout) : [];
    const unique = new Map();
    for (const entry of entries) if (!unique.has(entry.text)) unique.set(entry.text, entry);
    results = fuzzySearch(query, [...unique.values()], { limit: 100 });
  } else {
    const recent = await runAtuin($, searchArgs({ limit: RECENT_LIMIT }), {
      timeoutMs: ATUIN_READ_TIMEOUT_MS,
    });
    const entries = recent.exitCode === 0 ? parseHistory(recent.stdout) : [];
    results = entries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100)
      .map((item) => ({ item, score: 0, indices: [] }));
  }
  clampSelection();
  redraw();
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    const version = await runAtuin($, versionArgs(), { timeoutMs: ATUIN_READ_TIMEOUT_MS });
    available = version.exitCode === 0;
    await $.command.register({
      name: "history",
      description: "Search Atuin history and fill the prompt with a command",
    });
    return next(e);
  });

  // Record every prompt the user submits, so Claude Code prompts show up in
  // the user's shell history too.
  on("prompt.submit", async ($, e, next) => {
    const text = (e.text ?? "").trim();
    if (available !== false && text && !isDuplicatePrompt(text)) {
      const started = await runAtuin($, startArgs(text), {
        cwd: await $.session.cwd(),
        timeoutMs: ATUIN_TIMEOUT_MS,
      });
      const id = started.exitCode === 0 ? parseHistoryId(started.stdout) : null;
      if (id) {
        await runAtuin($, endArgs(id, 0), {
          cwd: await $.session.cwd(),
          timeoutMs: ATUIN_TIMEOUT_MS,
        });
      }
    }
    return next(e);
  });

  // Bracket each bash call with atuin's start/end pair. One hook does both
  // sides so the pairing never depends on an id this event may not carry.
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const command = (e.command ?? "").trim();
    if (available === false || !command) return next(e);

    const cwd = await $.session.cwd();
    const started = await runAtuin($, startArgs(command), {
      cwd,
      timeoutMs: ATUIN_TIMEOUT_MS,
    });
    const historyId = started.exitCode === 0 ? parseHistoryId(started.stdout) : null;

    const result = await next(e);

    if (historyId) {
      const exitCode = result?.isError || result?.deny ? 1 : 0;
      await runAtuin($, endArgs(historyId, exitCode), { cwd, timeoutMs: ATUIN_TIMEOUT_MS });
    }
    return result;
  });

  // Open the search pane.
  on("command.run", { command: "history" }, async ($) => {
    query = "";
    selected = 0;

    const search = await runAtuin($, searchArgs({ limit: RECENT_LIMIT }), {
      timeoutMs: ATUIN_READ_TIMEOUT_MS,
    });
    const all = search.exitCode === 0 ? parseHistory(search.stdout) : [];

    if (all.length === 0) {
      return {
        text: available === false
          ? "atuin was not found on PATH, so there is no history to search."
          : "No Atuin history yet.",
      };
    }

    results = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100)
      .map((item) => ({ item, score: 0, indices: [] }));
    clampSelection();
    await $.ui.open({ id: PANE, title: "History", focus: true, closeOnEscape: true });
    return {};
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    const { Box, Text, Input, Button } = $.ui.resolve(e);
    const redraw = () => $.ui.invalidate("ui.render");

    const rows = results.slice(0, 12).map((result, index) => {
      const isSelected = index === selected;
      return Button({
        key: `row-${index}`,
        plain: true,
        dimColor: !isSelected,
        label: `${isSelected ? ">" : " "} ${shortAge(result.item.timestamp).padStart(4)}  ${result.item.text}`,
        onPress: () => {
          selected = index;
          redraw();
        },
      });
    });

    const search = Input({
      key: "query",
      label: "Search",
      placeholder: "type to filter",
      value: query,
      autoFocus: true,
      // A render hook must give Input an onSubmit; pressing Enter re-runs the
      // same filter the typing path already applies.
      onSubmit: async (value) => {
        query = value;
        selected = 0;
        await refreshPane($, { redraw });
      },
      onInput: async (value) => {
        query = value;
        selected = 0;
        await refreshPane($, { redraw });
      },
    });

    const useSelected = Button({
      key: "use",
      label: "Use",
      onPress: async () => {
        const chosen = results[selected];
        if (!chosen) return;
        await $.prompt.fill(chosen.item.text);
        await $.ui.close(PANE);
      },
    });

    return Box({
      key: "cc-atuin-pane",
      flexDirection: "column",
      gap: 1,
      children: [
        search,
        Box({
          key: "rows",
          flexDirection: "column",
          children: rows.length
            ? rows
            : [Text({ key: "empty", dimColor: true, children: ["No matches."] })],
        }),
        Box({
          key: "actions",
          flexDirection: "row",
          columnGap: 2,
          children: [
            useSelected,
            Text({ key: "count", dimColor: true, children: [`${results.length} match(es)`] }),
          ],
        }),
      ],
    });
  });
}
