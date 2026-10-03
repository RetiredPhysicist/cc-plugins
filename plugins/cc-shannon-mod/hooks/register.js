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

import { DEFAULT_CONFIG, configPath, parseConfig, serializeConfig } from "./config.js";
import { averageMs, createCounters, createTracker, recordCompletion, suggestion } from "./activity.js";
import { COMPANION_KEY, classify, describe as describeCompanion, emptyCompanion, feed, normalizeCompanion } from "./companion.js";
import { createLens, describe as describeLens, sample } from "./lens.js";
import { createLatency, describe as describeLatency, formatMs as formatLatencyMs, record as recordLatency, slowest as slowestLatency } from "./latency.js";
import { describe as describeQueue, dequeue, emptyQueue, enqueue, move as moveQueue, removeAt } from "./queue.js";
import { bar, contextLevel, fmtDuration, fmtRate, fmtTokens, summarize, tokensPerSecond } from "./format.js";
import { LEDGER_KEY, cacheHitRatio, dayTotal, emptyLedger, normalizeLedger, recordTurn, recentTotal } from "./ledger.js";
import { accumulate, createRing, emptyTotals, startRequest } from "./metrics.js";
import { assessCommand, describeRisks } from "./risk.js";
import { COLOR, ICON, RAIN_WIDTH, SEPARATOR, rainCell } from "./style.js";

const PANE = "cc-shannon";

/** Session state. A mod's hooks share these module-level values. */
let totals = emptyTotals();
let recent = createRing(50);
let runningTools = [];
let lastTurn = null;
let guardEnabled = true;
let guardEvents = [];
let ledger = emptyLedger();
let startedAt = null;
let paneTab = "now";
let config = { ...DEFAULT_CONFIG };
let tools = createTracker(20);
let agents = createTracker(10);
let counters = createCounters();
let companion = emptyCompanion();
let lens = createLens();
let queue = emptyQueue();
let latencies = createLatency();

function resetSession() {
  totals = emptyTotals();
  recent = createRing(50);
  runningTools = [];
  lastTurn = null;
  guardEvents = [];
  startedAt = null;
  paneTab = "now";
  tools = createTracker(20);
  agents = createTracker(10);
  counters = createCounters();
  lens = createLens();
  queue = emptyQueue();
  latencies = createLatency();
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

/**
 * The band, composed with whatever other mods draw there.
 *
 * Rows follow the statusline's order and language: project, then model and
 * context, then measured timing, then activity. A row with nothing to say is
 * omitted rather than padded, so an idle session stays short. A tree returned
 * for `AbovePrompt` replaces later mods' drawing, so theirs is nested.
 */
function drawBand($, e, theirs) {
  const { Box, Text } = $.ui.resolve(e);
  const rows = bandRows(Box, Text);
  const body = config.rain
    ? rainWrap(Box, Text, rows)
    : Box({ key: "cc-shannon-band", flexDirection: "column", children: rows });

  return Box({
    key: "cc-shannon-band-wrap",
    flexDirection: "column",
    children: theirs ? [body, theirs] : [body],
  });
}

function bandRows(Box, Text) {
  return [
    ...projectRow(Box, Text),
    ...contextRow(Box, Text),
    ...timingRow(Box, Text),
    ...activityRow(Box, Text),
    ...countersRow(Box, Text),
    ...agentsRow(Box, Text),
    ...queueRow(Box, Text),
    ...companionRow(Box, Text),
    ...lensRow(Box, Text),
    ...latencyRow(Box, Text),
    ...hintRow(Box, Text),
  ];
}

/**
 * A rain strip down the left edge, one cell per row.
 *
 * The statusline animates this by repainting a subprocess; here a timer asks
 * for a redraw, so the strip moves the same way.
 */
function rainWrap(Box, Text, rows) {
  const now = Date.now();
  return Box({
    key: "rain",
    flexDirection: "row",
    columnGap: 1,
    children: [
      Box({
        key: "rain-strip",
        flexDirection: "column",
        width: RAIN_WIDTH,
        children: rows.map((_, index) => {
          const cell = rainCell(index, now, rows.length);
          return Text({ key: `rain-${index}`, color: cell.color, children: [cell.char] });
        }),
      }),
      Box({ key: "cc-shannon-band", flexDirection: "column", children: rows }),
    ],
  });
}

function separator(Text, key) {
  return Text({ key, color: COLOR.muted, children: [SEPARATOR] });
}

/** Join parts with the statusline's separator. */
function row(Box, Text, key, parts) {
  if (!parts.length) return [];
  const children = [];
  parts.forEach((part, index) => {
    if (index > 0) children.push(separator(Text, `${key}-sep-${index}`));
    children.push(part);
  });
  return [Box({ key: `row-${key}`, flexDirection: "row", columnGap: 1, children })];
}

/** ⌘ path │ ⎇ branch* │ ✦ 5h */
function projectRow(Box, Text) {
  const parts = [];
  if (lastCwd) {
    parts.push(Text({ key: "path", color: COLOR.warm, children: [`${ICON.path} ${lastCwd}`] }));
  }
  if (lastGit) {
    const dirty = lastGit.isDirty ? "*" : "";
    let text = `${ICON.branch} ${lastGit.branch}${dirty}`;
    if (lastGit.ahead > 0) text += ` ↑${lastGit.ahead}`;
    if (lastGit.behind > 0) text += ` ↓${lastGit.behind}`;
    parts.push(Text({ key: "git", color: COLOR.cool, children: [text] }));
  }
  if (startedAt) {
    parts.push(
      Text({
        key: "clock",
        color: COLOR.muted,
        children: [`${ICON.clock} ${fmtDuration(Date.now() - startedAt)}`],
      }),
    );
  }
  return row(Box, Text, "project", parts);
}

/** λ model │ ⊡ ██████░░░░ 58% │ ↑36k ↓300 ⊗8.5k */
function contextRow(Box, Text) {
  const parts = [];
  if (lastModel) {
    parts.push(Text({ key: "model", color: COLOR.cool, children: [`${ICON.model} ${lastModel}`] }));
  }

  const used = contextPercent();
  if (used !== null) {
    const level = contextLevel(used);
    const color =
      level === "critical" ? COLOR.danger : level === "warning" ? COLOR.warm : COLOR.positive;
    // The icon belongs with its value, so the separator only falls between
    // distinct facts.
    parts.push(Text({ key: "ctx", color, children: [`${ICON.context} ${bar(used, 10)} ${Math.round(used)}%`] }));
  }

  const latest = recent.latest();
  if (latest) {
    if (latest.inputTokens > 0) {
      parts.push(Text({ key: "in", color: COLOR.primary, children: [`${ICON.input} ${fmtTokens(latest.inputTokens)}`] }));
    }
    if (latest.outputTokens > 0) {
      parts.push(Text({ key: "out", color: COLOR.accent, children: [`${ICON.output} ${fmtTokens(latest.outputTokens)}`] }));
    }
    const cached = latest.cacheReadTokens + latest.cacheCreationTokens;
    if (cached > 0) {
      parts.push(Text({ key: "cache", color: COLOR.cool, children: [`${ICON.cache} ${fmtTokens(cached)}`] }));
    }
  }
  return row(Box, Text, "context", parts);
}

/** » TTFT 840ms │ 62.4 tok/s │ 8 req */
function timingRow(Box, Text) {
  const parts = [];
  const ttft = latestTtft();
  if (ttft !== null) {
    parts.push(Text({ key: "ttft", color: COLOR.muted, children: [`${ICON.speed} TTFT ${fmtDuration(ttft)}`] }));
  }
  const decode = sessionDecodeRate();
  if (decode !== null) {
    parts.push(Text({ key: "decode", color: COLOR.primary, children: [`${fmtRate(decode)} tok/s`] }));
  }
  if (totals.requests > 0) {
    parts.push(Text({ key: "reqs", color: COLOR.muted, children: [`${totals.requests} req`] }));
  }
  return row(Box, Text, "timing", parts);
}

/** ↻ Bash: cmd */
function activityRow(Box, Text) {
  const parts = runningTools.slice(-3).map((tool, index) =>
    Text({
      key: `run-${index}`,
      color: COLOR.warm,
      children: [`${ICON.running} ${tool.name}${tool.target ? `: ${tool.target}` : ""}`],
    }),
  );
  if (guardEvents.length) {
    parts.push(Text({ key: "guarded", color: COLOR.danger, children: [`${ICON.warn} ${guardEvents.length}`] }));
  }
  return row(Box, Text, "activity", parts);
}

/**
 * Work that already finished: ✔ n │ ✘ n │ ⌀ average.
 *
 * A statusline can only see this after re-reading the transcript; the counters
 * here come from the tool events as they complete.
 */
function countersRow(Box, Text) {
  if (counters.completed === 0) return [];
  const parts = [
    Text({ key: "done", color: COLOR.positive, children: [`${ICON.done} ${counters.completed}`] }),
  ];
  if (counters.failed > 0) {
    parts.push(Text({ key: "failed", color: COLOR.danger, children: [`${ICON.warn} ${counters.failed}`] }));
  }
  const average = averageMs(counters);
  if (average !== null) {
    parts.push(Text({ key: "avg", color: COLOR.muted, children: [`⌀ ${fmtDuration(average)}`] }));
  }
  return row(Box, Text, "counters", parts);
}

/** Running subagents: ↻ Task [model] */
function agentsRow(Box, Text) {
  const running = agents.latest(3);
  if (!running.length) return [];
  return row(
    Box,
    Text,
    "agents",
    running.map((agent, index) =>
      Text({
        key: `agent-${index}`,
        color: COLOR.accent,
        children: [`${ICON.running} ${agent.type}`],
      }),
    ),
  );
}

/**
 * One hint, shown only when something needs attention.
 *
 * The wording is picked from what actually happened this session, which is the
 * part a static snapshot cannot produce.
 */
function hintRow(Box, Text) {
  const hint = suggestion({
    failed: counters.failed,
    running: runningTools.length,
    contextPercent: contextPercent(),
    requests: totals.requests,
  });
  if (!hint) return [];
  return row(Box, Text, "hint", [Text({ key: "hint-text", color: COLOR.warm, children: [hint] })]);
}

/** ▸ the next prompt waiting to be sent (+2) */
function queueRow(Box, Text) {
  if (!config.queue) return [];
  const line = describeQueue(queue);
  if (!line) return [];
  return row(Box, Text, "queue", [Text({ key: "queue-text", color: COLOR.cool, children: [line] })]);
}

/** (•‿•) Lv3 ✔4 ⎇2 */
function companionRow(Box, Text) {
  if (!config.companion) return [];
  if (companion.xp <= 0) return [];
  return row(Box, Text, "companion", [
    Text({ key: "pet", color: COLOR.accent, children: [describeCompanion(companion)] }),
  ]);
}

/** ⊡ +2.4%/turn · ~7 turns left */
function lensRow(Box, Text) {
  if (!config.lens) return [];
  const used = contextPercent();
  if (used === null) return [];
  const line = describeLens(lens, used);
  if (!line) return [];
  return row(Box, Text, "lens", [Text({ key: "lens-text", color: COLOR.muted, children: [line] })]);
}

/** ⌀ Bash 3s · Read 1.2s · Edit 800ms */
function latencyRow(Box, Text) {
  if (!config.latency) return [];
  const line = describeLatency(latencies);
  if (!line) return [];
  return row(Box, Text, "latency", [Text({ key: "latency-text", color: COLOR.muted, children: [`⌀ ${line}`] })]);
}

let lastCwd = null;
let lastGit = null;
let home = "";
/**
 * Tokens seen in the current turn, summed from its requests.
 *
 * A turn can make several requests, and `turn.complete` may report no usage at
 * all, so this is what the ledger falls back to. It resets when the next turn
 * starts, so counts never carry across turns.
 */
let turnUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
let turnToolCount = 0;

/**
 * Read the plugin config.
 *
 * `$.fs` and `$.env` stay at the call site; this helper only assembles the
 * values they return. A missing file is not an error — it means defaults.
 */
async function readConfig($) {
  try {
    home = (await $.env.get("HOME")) || "";
  } catch {
    home = "";
  }
  if (!home) return { ...DEFAULT_CONFIG };
  try {
    const raw = await $.fs.read(configFile(home));
    return parseConfig(raw);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function configFile(homeDir) {
  return configPath(homeDir);
}

/**
 * Branch and dirty state, read once per session.
 *
 * The statusline re-runs `git` on every redraw because it is a fresh process
 * each time. Here it is read at session start and refreshed after a turn, which
 * keeps a redraw from spawning a process.
 */
async function gitStatus($, cwd) {
  if (!cwd) return null;
  try {
    const branch = await $.process.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    if (branch.exitCode !== 0) return null;
    const porcelain = await $.process.run(["git", "status", "--porcelain"], { cwd });
    return {
      branch: branch.stdout.trim(),
      isDirty: porcelain.stdout.trim().length > 0,
      ahead: 0,
      behind: 0,
    };
  } catch {
    return null;
  }
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
/** The `/shannon` pane: the same rows as the band, plus today's rollup. */
function drawPane($, e) {
  const { Box, Text } = $.ui.resolve(e);
  const rows = [
    ...projectRow(Box, Text),
    ...contextRow(Box, Text),
    ...timingRow(Box, Text),
    ...activityRow(Box, Text),
    ...countersRow(Box, Text),
    ...agentsRow(Box, Text),
    ...queueRow(Box, Text),
    ...companionRow(Box, Text),
    ...lensRow(Box, Text),
    ...latencyRow(Box, Text),
    ...hintRow(Box, Text),
    ...toolsRow(Box, Text),
    ...todayRow(Box, Text),
    ...guardRow(Box, Text),
  ];

  return Box({ key: "cc-shannon-pane", flexDirection: "column", children: rows });
}

/** The slowest tools, one per row, for the pane. */
function toolsRow(Box, Text) {
  if (!config.latency) return [];
  const ranked = slowestLatency(latencies);
  if (!ranked.length) return [];
  return ranked.map((entry, index) =>
    Box({
      key: `tool-${index}`,
      flexDirection: "row",
      columnGap: 1,
      children: [
        Text({ color: COLOR.muted, children: [`${index + 1}.`] }),
        Text({ color: entry.failed ? COLOR.danger : COLOR.primary, children: [entry.name] }),
        Text({ color: COLOR.muted, children: [formatLatencyMs(entry.durationMs)] }),
      ],
    }),
  );
}

/** ✔ 12 turns │ ↑40k ↓8k │ 62% cache */
function todayRow(Box, Text) {
  const day = dayTotal(ledger, Date.now());
  if (!day || day.turns === 0) return [];
  const parts = [
    Text({ key: "t-turns", children: [`${ICON.done} ${day.turns} turns`] }),
    Text({ key: "t-out", color: COLOR.accent, children: [`${ICON.output} ${fmtTokens(day.outputTokens)}`] }),
    Text({ key: "t-in", color: COLOR.primary, children: [`${ICON.input} ${fmtTokens(day.inputTokens)}`] }),
  ];
  const ratio = cacheHitRatio(day);
  if (ratio !== null) {
    parts.push(
      Text({ key: "t-cache", color: COLOR.cool, children: [`${ICON.cache} ${Math.round(ratio * 100)}% cache`] }),
    );
  }
  return row(Box, Text, "today", parts);
}

/** ⚠ guard on │ then the commands it questioned */
function guardRow(Box, Text) {
  const parts = [
    Text({
      key: "guard-state",
      color: guardEnabled ? COLOR.positive : COLOR.warm,
      children: [`${ICON.warn} guard ${guardEnabled ? "on" : "off"}`],
    }),
  ];
  for (const [index, event] of guardEvents.slice(-3).entries()) {
    parts.push(
      Text({
        key: `guard-${index}`,
        color: event.allowed ? COLOR.warm : COLOR.danger,
        children: [`${event.allowed ? "ran" : "blocked"} ${event.because}`],
      }),
    );
  }
  return row(Box, Text, "guard", parts);
}


export function register(on) {
  on("session.start", async ($, e, next) => {
    resetSession();
    startedAt = Date.now();
    config = await readConfig($);
    lastCwd = await $.session.cwd();
    lastGit = await gitStatus($, lastCwd);

    const saved = await $.store.get(LEDGER_KEY);
    ledger = normalizeLedger(saved);
    const savedPet = await $.store.get(COMPANION_KEY);
    companion = normalizeCompanion(savedPet);

    await $.command.register({
      name: "shannon",
      description: "Open the cc-shannon pane",
    });
    await $.command.register({
      name: "shannon-guard",
      description: "Turn the risky-command guard on or off",
    });
    await $.command.register({
      name: "shannon-rain",
      description: "Turn the matrix rain on or off",
    });
    await $.command.register({
      name: "shannon-toggle",
      description: `Turn a feature on or off: ${Object.keys(DEFAULT_CONFIG).join(", ")}`,
      argumentHint: `<${Object.keys(DEFAULT_CONFIG).join("|")}>`,
    });
    await $.command.register({
      name: "q",
      description: "Queue a prompt to send when this turn ends",
      argumentHint: "<text>",
    });
    await $.command.register({
      name: "shannon-queue",
      description: "Show or manage the queued prompts: list, drop <n>, up <n>, down <n>",
      argumentHint: "[list|drop n|up n|down n]",
    });

    // The rain moves, so the band needs a redraw on a timer.
    if (config.rain) {
      $.clock.every(320, () => $.ui.invalidate("ui.render"));
    }

    return next(e);
  });

  // ── turn metrics ──
  on("turn.start", async ($, e, next) => {
    turnUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
    turnToolCount = 0;
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
    turnUsage = {
      inputTokens: turnUsage.inputTokens + record.inputTokens,
      outputTokens: turnUsage.outputTokens + record.outputTokens,
      cacheReadTokens: turnUsage.cacheReadTokens + record.cacheReadTokens,
      cacheCreationTokens: turnUsage.cacheCreationTokens + record.cacheCreationTokens,
    };

    if (result?.usage) {
      lastModel = result.usage.model ?? lastModel;
    }
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    // A completed turn may carry its own totals. When it does not, the sum of
    // this turn's requests is the source, so the ledger gets real counts
    // instead of zeros.
    await commitTurn($, {
      inputTokens: e.usage?.input_tokens ?? turnUsage.inputTokens,
      outputTokens: e.usage?.output_tokens ?? turnUsage.outputTokens,
      cacheReadTokens: e.usage?.cache_read_input_tokens ?? turnUsage.cacheReadTokens,
      cacheCreationTokens: e.usage?.cache_creation_input_tokens ?? turnUsage.cacheCreationTokens,
      totalMs: e.durationMs ?? null,
    }, turnToolCount);
    $.ui.invalidate("ui.render");

    // A turn is the natural sampling point for context growth. `session.measure`
    // may only report once, which would leave the lens with a single sample and
    // no growth to show.
    try {
      const usage = await $.session.usage();
      if (usage?.context) {
        lastContext = {
          percent: usage.context.percent ?? null,
          window: usage.context.window ?? lastContext?.window ?? null,
        };
        if (lastContext.percent !== null) lens = sample(lens, lastContext.percent);
      }
    } catch {
      // Context sampling is best effort; a turn must still complete.
    }

    // Branch, dirty state, and ahead/behind can all change during a turn.
    lastGit = await gitStatus($, lastCwd);

    // A queued prompt goes out when the turn ends. Submitting it here is safe
    // because the session is idle at this point.
    if (config.queue && queue.length) {
      const queued = dequeue(queue);
      queue = queued.queue;
      if (queued.text) {
        try {
          await $.prompt.submit({ text: queued.text });
        } catch {
          // If it cannot be sent, it goes back to the front rather than
          // disappearing.
          queue = [queued.text, ...queue];
        }
      }
    }
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
      // Each reading feeds the growth estimate, which is what turns a bare
      // percentage into "how many turns are left".
      if (lastContext.percent !== null) lens = sample(lens, lastContext.percent);
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

    const startedAt = await $.clock.now();
    const entry = {
      id: `${e.tool}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: e.tool,
      target: summarizeTarget(e),
    };
    runningTools = [...runningTools, entry];
    // The command is kept so the companion can tell a test run from any other
    // Bash call once the tool finishes.
    tools.add(entry.id, {
      name: entry.name,
      target: entry.target,
      command: e.command ?? "",
      startedAt,
    });
    turnToolCount += 1;
    $.ui.invalidate("ui.render");

    let result;
    try {
      if (guardEnabled && e.tool === "Bash") {
        const decision = await guardCommand($, e);
        if (decision) {
          guardEvents = [...guardEvents, decision].slice(-20);
          if (!decision.allowed) {
            return { deny: `Blocked by cc-shannon guard: ${decision.reason}. ${decision.denial}` };
          }
        }
      }
      result = await next(e);
      return result;
    } finally {
      runningTools = runningTools.filter((item) => item.id !== entry.id);
      const finished = tools.remove(entry.id);
      if (finished) {
        const succeeded = !(result?.isError || result?.deny);
        const durationMs = Math.max(0, (await $.clock.now()) - finished.startedAt);
        latencies = recordLatency(latencies, {
          name: finished.name,
          target: finished.target,
          durationMs,
          failed: !succeeded,
        });
        counters = recordCompletion(counters, {
          durationMs,
          failed: !succeeded,
          label: finished.target ? `${finished.name}: ${finished.target}` : finished.name,
        });

        // A passing test run or a commit feeds the companion. A failure does
        // not, so a red build never grows it.
        if (config.companion && finished.name === "Bash") {
          const kind = classify(finished.command);
          if (kind) {
            companion = feed(companion, kind, { succeeded });
            await $.store.set(COMPANION_KEY, companion);
          }
        }
      }
      $.ui.invalidate("ui.render");
    }
  });

  // ── subagents, which the statusline can only infer from the transcript ──
  on("agent.spawn", async ($, e, next) => {
    agents.add(`${e.agentId ?? e.type ?? "agent"}-${Date.now()}`, {
      type: e.type ?? "agent",
    });
    $.ui.invalidate("ui.render");
    return next(e);
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

  on("command.run", { command: "shannon-rain" }, async ($) => {
    config = { ...config, rain: !config.rain };
    try {
      await $.fs.write(configFile(home), serializeConfig(config));
    } catch {
      // A config that cannot be written still applies for this session.
    }
    $.ui.invalidate("ui.render");
    return { text: `cc-shannon rain is now ${config.rain ? "on" : "off"}.` };
  });

  on("command.run", { command: "shannon-toggle" }, async ($, e) => {
    const name = String(e.args ?? "").trim();
    if (!(name in DEFAULT_CONFIG)) {
      return { text: `Usage: /shannon-toggle <${Object.keys(DEFAULT_CONFIG).join("|")}>` };
    }
    config = { ...config, [name]: !config[name] };
    try {
      await $.fs.write(configFile(home), serializeConfig(config));
    } catch {
      // Applies for this session even when it cannot be persisted.
    }
    $.ui.invalidate("ui.render");
    return { text: `cc-shannon ${name} is now ${config[name] ? "on" : "off"}.` };
  });

  // Queue a prompt while Claude is still working. It is sent when the turn ends.
  on("command.run", { command: "q" }, async ($, e) => {
    if (!config.queue) {
      return { text: "The queue is off. /shannon-toggle queue turns it on." };
    }
    const next = enqueue(queue, e.args);
    if (!next) {
      return { text: "Nothing to queue, or the queue is full." };
    }
    queue = next;
    $.ui.invalidate("ui.render");
    return { text: `Queued (${queue.length}): ${queue[queue.length - 1]}` };
  });

  on("command.run", { command: "shannon-queue" }, async ($, e) => {
    const args = String(e.args ?? "").trim();
    const [action, rawIndex] = args.split(/\s+/);
    const index = Number(rawIndex) - 1;

    if (action === "drop") {
      queue = removeAt(queue, index);
      $.ui.invalidate("ui.render");
      return { text: `Queue: ${queue.length} waiting.` };
    }
    if (action === "up" || action === "down") {
      queue = moveQueue(queue, index, action);
      $.ui.invalidate("ui.render");
      return { text: `Queue: ${queue.length} waiting.` };
    }
    if (!queue.length) return { text: "The queue is empty." };
    const list = queue.map((item, i) => `${i + 1}. ${item}`).join("\n");
    return { text: `${queue.length} queued:\n${list}` };
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

  // ── the spinner, which a statusline cannot reach at all ──
  // Keeps Claude Code's own spinner and appends live progress to it: the tool
  // that is running, and how many it has finished this turn.
  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    const parts = [];
    const current = runningTools[runningTools.length - 1];
    if (current) {
      parts.push(`${current.name}${current.target ? `: ${current.target}` : ""}`);
    }
    if (turnToolCount > 0) parts.push(`${turnToolCount} tool${turnToolCount === 1 ? "" : "s"}`);
    if (!parts.length) return next(e);

    const suffix = `${e.props?.suffix ?? ""} · ${parts.join(" · ")}`;
    return next({ ...e, props: { ...e.props, suffix } });
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
  let answer = "Refuse";
  let asked = false;
  try {
    answer = await $.ui.ask(
      `cc-shannon noticed ${reason}. Run this?\n\n${e.command}`,
      ["Run it", "Refuse"],
    );
    asked = true;
  } catch {
    // Dismissed, or no one to ask (for example `claude -p`). Fail safe.
    answer = "Refuse";
  }

  const allowed = answer === "Run it";
  // The denial text tells the model that a person refused, not that the syntax
  // was rejected. Without that, a model simply rewrites the command and the
  // deletion happens anyway.
  const denial = asked
    ? "The user declined this command. Do not retry it in another form; ask what they want instead."
    : "No one was available to approve this command. Do not retry it in another form.";
  return { allowed, reason, denial };
}
