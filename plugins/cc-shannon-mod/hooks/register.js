/**
 * cc-shannon-mod — mission control for Claude Code.
 *
 * A statusline is an external process that sees a JSON snapshot and has to
 * reconstruct what happened by reading the transcript from disk. A mod runs
 * inside Claude Code and sees the event stream, so this plugin measures turn
 * timing for real instead of estimating it, tracks what is running while it
 * runs, and can act on what it sees.
 *
 * Three surfaces:
 *   - a band above the prompt with live metrics and activity
 *   - a `/shannon` pane with Now, Today, and Guard tabs
 *   - a guard that asks before a risky shell command runs
 */

import { bar, contextLevel, fmtDuration, fmtRate, fmtTokens, summarize, tokensPerSecond } from "./format.js";
import { LEDGER_KEY, cacheHitRatio, dayTotal, emptyLedger, normalizeLedger, recordTurn, recentTotal } from "./ledger.js";
import { accumulate, createRing, emptyTotals, startRequest } from "./metrics.js";
import { assessCommand, describeRisks } from "./risk.js";

const PANE = "cc-shannon";
const BAND_ROWS = 3;

/** Session state. A mod's hooks share these module-level values. */
let totals = emptyTotals();
let recent = createRing(50);
let runningTools = [];
let lastTurn = null;
let activeRequest = null;
let guardEnabled = true;
let guardEvents = [];
let ledger = emptyLedger();
let startedAt = null;
let paneTab = "now";

function resetSession() {
  totals = emptyTotals();
  recent = createRing(50);
  runningTools = [];
  lastTurn = null;
  activeRequest = null;
  guardEvents = [];
  startedAt = null;
  paneTab = "now";
}

/** Latest TTFT across recorded requests, or null. */
function latestTtft() {
  const values = totals.ttftMs;
  return values.length ? values[values.length - 1] : null;
}

/** Average decode rate across the session, weighted by tokens produced. */
function sessionDecodeRate() {
  const decodeMs = totals.decodeMs.reduce((sum, value) => sum + value, 0);
  if (decodeMs <= 0 || totals.decodeTokens <= 0) return null;
  return tokensPerSecond(totals.decodeTokens, decodeMs);
}

async function persistLedger($) {
  await $.store.set(LEDGER_KEY, ledger);
}

/** Fold the finished turn into today's bucket and save it. */
async function commitTurn($, record, toolCount) {
  ledger = recordTurn(ledger, Date.now(), {
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheReadTokens: record.cacheReadTokens,
    cacheCreationTokens: record.cacheCreationTokens,
    tools: toolCount,
    durationMs: record.totalMs ?? 0,
  });
  await persistLedger($);
}

/** The band: three compact rows, drawn only when there is something to show. */
/**
 * The band, composed with whatever other mods draw there.
 *
 * A tree returned for `AbovePrompt` replaces what later mods draw, so ours
 * nests `theirs` instead of dropping it.
 */
function drawBand($, e, theirs) {
  const { Box, Text } = $.ui.resolve(e);
  const rows = [];

  // ── row 1: model, context, and the headline rate ──
  const contextUsed = contextPercent();
  const contextBits = [];
  if (contextUsed !== null) {
    const level = contextLevel(contextUsed);
    contextBits.push(
      Text({
        key: "ctx",
        color: level === "critical" ? "red" : level === "warning" ? "yellow" : "default",
        children: [`${bar(contextUsed, 10)} ${Math.round(contextUsed)}%`],
      }),
    );
  }

  const model = lastModel ?? null;
  rows.push(
    Box({
      key: "band-row-1",
      flexDirection: "row",
      columnGap: 2,
      children: [
        Text({ key: "brand", color: "magenta", children: ["◈ shannon"] }),
        model ? Text({ key: "model", dimColor: true, children: [model] }) : null,
        ...contextBits,
        totals.outputTokens > 0
          ? Text({ key: "out", dimColor: true, children: [`↓ ${fmtTokens(totals.outputTokens)}`] })
          : null,
      ].filter(Boolean),
    }),
  );

  // ── row 2: measured metrics, or a hint that they arrive with the first turn ──
  const ttft = latestTtft();
  const decode = sessionDecodeRate();
  const metricBits = [];
  if (ttft !== null) metricBits.push(Text({ key: "ttft", children: [`first token ${fmtDuration(ttft)}`] }));
  if (decode !== null) {
    metricBits.push(Text({ key: "decode", children: [`${fmtRate(decode)} tok/s`] }));
  }
  if (totals.requests > 0) {
    metricBits.push(Text({ key: "reqs", dimColor: true, children: [`${totals.requests} req`] }));
  }
  if (lastTurn) {
    metricBits.push(Text({ key: "last", dimColor: true, children: [`last turn ${fmtDuration(lastTurn)}`] }));
  }
  rows.push(
    Box({
      key: "band-row-2",
      flexDirection: "row",
      columnGap: 2,
      children: metricBits.length
        ? metricBits
        : [Text({ key: "idle", dimColor: true, children: ["measuring — metrics appear after the first turn"] })],
    }),
  );

  // ── row 3: what is running right now ──
  // Only drawn when there is something to say, so an idle session keeps the
  // band at two rows instead of spending a line on "idle".
  const activity = runningTools.map((tool) =>
    Text({
      key: `run-${tool.id}`,
      color: "yellow",
      children: [`↻ ${tool.name}${tool.target ? ` ${tool.target}` : ""}`],
    }),
  );
  if (guardEvents.length) {
    activity.push(
      Text({ key: "guard-count", color: "red", children: [`⚠ ${guardEvents.length} guarded`] }),
    );
  }
  if (activity.length) {
    rows.push(Box({ key: "band-row-3", flexDirection: "row", columnGap: 2, children: activity }));
  }

  return Box({
    key: "cc-shannon-band",
    flexDirection: "column",
    children: theirs ? [...rows, theirs] : rows,
  });
}

/**
 * Context occupancy.
 *
 * `session.measure` reports the authoritative percentage and window. When it has
 * not reported yet, the latest request's prompt size against the last known
 * window is a close stand-in, and it needs no extra API call.
 */
let lastContext = null;
let lastModel = null;

function contextPercent() {
  if (lastContext?.percent !== null && lastContext?.percent !== undefined) {
    return lastContext.percent;
  }
  const latest = recent.latest();
  const window = lastContext?.window ?? null;
  if (!latest || !window || window <= 0) return null;
  // A request's prompt is its uncached input plus the cache read and written
  // portions, which is the quantity Claude Code shows as context used.
  const promptTokens = latest.inputTokens + latest.cacheReadTokens + latest.cacheCreationTokens;
  if (promptTokens <= 0) return null;
  return Math.min(100, (promptTokens / window) * 100);
}

/** The `/shannon` pane, with a tab per view. */
function drawPane($, e) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const redraw = () => $.ui.invalidate("ui.render");

  const tab = (id, label) =>
    Button({
      key: `tab-${id}`,
      plain: true,
      dimColor: paneTab !== id,
      label,
      onPress: () => {
        paneTab = id;
        redraw();
      },
    });

  const tabs = Box({
    key: "tabs",
    flexDirection: "row",
    columnGap: 2,
    children: [tab("now", "Now"), tab("today", "Today"), tab("guard", "Guard")],
  });

  const el = { Box, Text };
  const body =
    paneTab === "today" ? todayRows(el) : paneTab === "guard" ? guardRows(el) : nowRows(el);

  return Box({
    key: "cc-shannon-pane",
    flexDirection: "column",
    gap: 1,
    children: [tabs, Box({ key: "body", flexDirection: "column", children: body })],
  });
}

function statRow({ Box, Text }, key, label, value, color) {
  return Box({
    key: `stat-${key}`,
    flexDirection: "row",
    columnGap: 2,
    children: [
      Text({ key: `s-${key}-label`, dimColor: true, children: [label.padEnd(16)] }),
      Text({ key: `s-${key}-value`, color, children: [value] }),
    ],
  });
}

function nowRows(el) {
  const { Text } = el;
  const rows = [];
  const ttft = latestTtft();
  const decode = sessionDecodeRate();

  rows.push(statRow(el, "session", "session", startedAt ? fmtDuration(Date.now() - startedAt) : "—", "cyan"));
  rows.push(statRow(el, "requests", "requests", String(totals.requests), "cyan"));
  if (ttft !== null) rows.push(statRow(el, "ttft", "time to first token", fmtDuration(ttft), "default"));
  if (decode !== null) rows.push(statRow(el, "decode", "decode rate", `${fmtRate(decode)} tok/s`, "default"));

  const ttftStats = summarize(totals.ttftMs);
  if (ttftStats && ttftStats.count > 1) {
    rows.push(
      statRow(
        el,
        "ttft-range",
        "first token range",
        `${fmtDuration(ttftStats.min)} – ${fmtDuration(ttftStats.max)}`,
        "default",
      ),
    );
  }
  rows.push(statRow(el, "output", "output tokens", fmtTokens(totals.outputTokens), "default"));
  const used = contextPercent();
  if (used !== null) {
    rows.push(
      statRow(
        el,
        "context",
        "context used",
        `${bar(used, 16)} ${Math.round(used)}%`,
        contextLevel(used) === "ok" ? "default" : "yellow",
      ),
    );
  }

  rows.push(Text({ key: "now-runs", dimColor: true, children: [""] }));
  rows.push(Text({ key: "now-runs-title", dimColor: true, children: ["Running"] }));
  if (runningTools.length) {
    for (const tool of runningTools) {
      rows.push(
        Text({
          key: `now-run-${tool.id}`,
          children: [`  ↻ ${tool.name}${tool.target ? ` ${tool.target}` : ""}`],
        }),
      );
    }
  } else {
    rows.push(Text({ key: "now-run-none", dimColor: true, children: ["  nothing"] }));
  }
  return rows;
}

function todayRows(el) {
  const { Text } = el;
  const today = dayTotal(ledger, Date.now());
  const week = recentTotal(ledger, Date.now(), 7);
  const rows = [];

  rows.push(Text({ key: "today-title", dimColor: true, children: ["Today"] }));
  if (!today) {
    rows.push(Text({ key: "today-none", dimColor: true, children: ["  no turns recorded yet"] }));
  } else {
    rows.push(statRow(el, "t-turns", "turns", String(today.turns), "cyan"));
    rows.push(statRow(el, "t-out", "output tokens", fmtTokens(today.outputTokens), "default"));
    rows.push(statRow(el, "t-in", "input tokens", fmtTokens(today.inputTokens), "default"));
    const ratio = cacheHitRatio(today);
    if (ratio !== null) {
      rows.push(statRow(el, "t-cache", "cache reuse", `${Math.round(ratio * 100)}%`, "cyan"));
    }
    rows.push(statRow(el, "t-tools", "tool calls", String(today.tools), "default"));
    rows.push(statRow(el, "t-time", "time working", fmtDuration(today.durationMs), "default"));
  }

  rows.push(Text({ key: "week-title", dimColor: true, children: [""] }));
  rows.push(Text({ key: "week-label", dimColor: true, children: ["Last 7 days"] }));
  if (week.turns === 0) {
    rows.push(Text({ key: "week-none", dimColor: true, children: ["  nothing recorded"] }));
  } else {
    rows.push(statRow(el, "w-turns", "turns", String(week.turns), "cyan"));
    rows.push(statRow(el, "w-out", "output tokens", fmtTokens(week.outputTokens), "default"));
    rows.push(statRow(el, "w-days", "active days", String(week.days), "default"));
    const ratio = cacheHitRatio(week);
    if (ratio !== null) {
      rows.push(statRow(el, "w-cache", "cache reuse", `${Math.round(ratio * 100)}%`, "cyan"));
    }
  }
  return rows;
}

function guardRows(el) {
  const { Box, Text } = el;
  const rows = [];
  rows.push(
    Box({
      key: "guard-toggle",
      flexDirection: "row",
      columnGap: 2,
      children: [
        Text({
          key: "guard-state",
          color: guardEnabled ? "green" : "yellow",
          children: [guardEnabled ? "guard is on" : "guard is off"],
        }),
        Text({ key: "guard-hint", dimColor: true, children: ["/shannon-guard toggles it"] }),
      ],
    }),
  );
  rows.push(Text({ key: "guard-log-title", dimColor: true, children: [""] }));
  rows.push(Text({ key: "guard-log-label", dimColor: true, children: ["Recent prompts"] }));
  if (!guardEvents.length) {
    rows.push(Text({ key: "guard-none", dimColor: true, children: ["  no risky commands seen"] }));
  } else {
    for (const [index, event] of guardEvents.slice(-8).entries()) {
      rows.push(
        Text({
          key: `guard-${index}`,
          color: event.allowed ? "yellow" : "red",
          children: [`  ${event.allowed ? "ran" : "blocked"}: ${event.reason}`],
        }),
      );
    }
  }
  return rows;
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    resetSession();
    startedAt = Date.now();

    const saved = await $.store.get(LEDGER_KEY);
    ledger = normalizeLedger(saved);

    await $.command.register({
      name: "shannon",
      description: "Open the cc-shannon mission control pane",
    });
    await $.command.register({
      name: "shannon-guard",
      description: "Turn the risky-command guard on or off",
    });
    await $.command.register({
      name: "shannon-reset-ledger",
      description: "Clear the recorded usage ledger",
    });

    return next(e);
  });

  // ── turn metrics ──
  on("turn.start", async ($, e, next) => {
    activeRequest = null;
    return next(e);
  });

  on("turn.step", async function* ($, e, next) {
    const request = startRequest(await $.clock.now(), e.agentId ?? null);
    // Iterate by hand rather than `for await`: only an explicit `next()` call
    // exposes the stream's return value, which carries the request's usage.
    const stream = next(e);
    let first = true;
    let result;

    while (true) {
      const step = await stream.next();
      if (step.done) {
        result = step.value;
        break;
      }
      if (first) {
        request.markFirstChunk(await $.clock.now());
        first = false;
      }
      yield step.value;
    }

    const record = request.finish(await $.clock.now(), result?.usage);
    totals = accumulate(totals, record);
    recent.push(record);
    lastTurn = record.totalMs;

    if (result?.usage) {
      lastModel = result.usage.model ?? lastModel;
    }
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    await commitTurn($, {
      inputTokens: e.usage?.input_tokens ?? 0,
      outputTokens: e.usage?.output_tokens ?? 0,
      cacheReadTokens: e.usage?.cache_read_input_tokens ?? 0,
      cacheCreationTokens: e.usage?.cache_creation_input_tokens ?? 0,
      totalMs: e.durationMs ?? null,
    }, runningTools.length);
    $.ui.invalidate("ui.render");
    return next(e);
  });

  // ── context tracking via the session's own usage report ──
  on("session.measure", async ($, e, next) => {
    const usage = await $.session.usage();
    if (usage?.context) {
      lastContext = {
        percent: usage.context.percent ?? null,
        window: usage.context.window ?? lastContext?.window ?? null,
      };
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  // ── activity + guard, in one hook so the event is registered once ──
  on("tool.call", async ($, e, next) => {
    // `$.ui.ask` reaches this event as a call to AskUserQuestion. It is a
    // dialog, not work, so it must not enter the activity list or the guard
    // would re-enter itself while asking.
    if (e.tool === "AskUserQuestion") return next(e);

    const entry = {
      id: `${e.tool}-${runningTools.length}-${Date.now()}`,
      name: e.tool,
      target: summarizeTarget(e),
    };
    runningTools = [...runningTools, entry];
    $.ui.invalidate("ui.render");

    let result;
    try {
      if (guardEnabled && e.tool === "Bash") {
        const decision = await guardCommand($, e);
        if (decision) {
          guardEvents = [...guardEvents, decision].slice(-20);
          if (!decision.allowed) {
            return { deny: `Blocked by cc-shannon guard: ${decision.reason}.` };
          }
        }
      }
      result = await next(e);
      return result;
    } finally {
      runningTools = runningTools.filter((item) => item.id !== entry.id);
      $.ui.invalidate("ui.render");
    }
  });

  on("session.end", async ($, e, next) => {
    await persistLedger($);
    return next(e);
  });

  // ── commands ──
  on("command.run", { command: "shannon" }, async ($) => {
    await $.ui.open({
      id: PANE,
      title: "Shannon",
      focus: true,
      closeOnEscape: true,
      rows: 16,
    });
    return {};
  });

  on("command.run", { command: "shannon-guard" }, async ($) => {
    guardEnabled = !guardEnabled;
    return {
      text: `cc-shannon guard is now ${guardEnabled ? "on" : "off"}.`,
    };
  });

  on("command.run", { command: "shannon-reset-ledger" }, async ($) => {
    ledger = emptyLedger();
    await persistLedger($);
    return { text: "cc-shannon usage ledger cleared." };
  });

  // ── drawing ──
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    // Run the mods after this one first, so their drawing can be kept.
    const theirs = await next(e);
    return drawBand($, e, theirs);
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    return drawPane($, e);
  });
}

/** A short label for a tool call, when the tool carries one. */
function summarizeTarget(e) {
  const candidate = e.command ?? e.file_path ?? e.path ?? e.pattern ?? e.query ?? null;
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  const oneLine = candidate.split("\n")[0].trim();
  return oneLine.length > 48 ? `${oneLine.slice(0, 45)}…` : oneLine;
}

/**
 * Ask before a risky command. Returns a guard-event record, or null when the
 * command is not risky or the user approved it.
 */
async function guardCommand($, e) {
  const risks = assessCommand(e.command);
  if (!risks.length) return null;

  const reason = describeRisks(risks);
  let answer = "Run it";
  try {
    answer = await $.ui.ask(
      `cc-shannon noticed ${reason}. Run this?\n\n${e.command}`,
      ["Run it", "Refuse"],
    );
  } catch {
    // Dismissed, or no one to ask (for example `claude -p`). Fail safe.
    answer = "Refuse";
  }

  const allowed = answer === "Run it";
  return { allowed, reason };
}
