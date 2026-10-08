/**
 * cc-shannon-bloom — a live Gource-style map of a Claude Code session.
 *
 * Bloom films a day of recorded OpenCode history. This runs the same world
 * simulation on the live event stream instead: each working directory becomes a
 * project hub, each session a star around it, subagents branch off their parent,
 * tool calls fly as sparks, and the person's prompts arrive as a warm comet. It
 * draws in a pane beside the transcript, in the same slot flightdeck uses.
 *
 * The simulation, camera and renderer are pure modules beside this file; this
 * hook is the only part that touches the mods API.
 */

import { createCamera } from "./camera.js";
import { createWorld } from "./sim.js";
import { activityStrip, frameHeader, renderFrame } from "./render.js";

const PANE = "cc-shannon-bloom";
const TITLE = "Bloom";
/** Docked width, and the inline height when the pane sits above the prompt. */
const PANE_COLUMNS = 72;
const PANE_ROWS = 20;
/** The pane's own frame clock; 8 fps reads as motion without burning a core. */
const FRAME_MS = 125;

let world = createWorld();
let camera = null;
let cwd = "";
let home = "";
let lastFrame = null;
let frameTimer = null;
/** Session ids seen so far, by the id each event carries. */
const sessionIds = new Map();
let mainSession = null;

/** The label for the person's own comet. */
let label = "you";

function baseName(path) {
  const clean = String(path || "").replace(/\/+$/, "");
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean || "project";
}

/** The project label a working directory belongs to, as bloom shows basenames. */
function hubLabel(dir) {
  return baseName(dir || cwd || "project");
}

/**
 * Register one session id against the world.
 *
 * Claude Code names the session at `session.start`; subagents arrive later with
 * their own id and a parent. A session the world has not seen is created the
 * first time any event names it.
 */
function ensureSession(id, extra = {}) {
  const key = String(id || "");
  if (!key) return null;
  if (!sessionIds.has(key)) {
    const hub = hubLabel(extra.cwd ?? cwd);
    world.session({ id: key, hub, parentId: extra.parentId ?? null, spawned: Boolean(extra.spawned) });
    sessionIds.set(key, { hub });
  }
  return key;
}

function openPane($) {
  // columns apply when docked beside the transcript, rows when seated inline.
  return $.ui.open({ id: PANE, title: TITLE, columns: PANE_COLUMNS, rows: PANE_ROWS });
}

/** The frame the pane currently shows, as the raster's cells. */
function currentFrame(columns, rows, hourOfDay, timeLabel) {
  if (!camera || camera.state.columns !== columns || camera.state.rows !== rows) {
    camera = createCamera({ columns, rows });
  }
  const frame = renderFrame(world, camera, {
    columns,
    rows,
    hourOfDay,
    dt: FRAME_MS / 1000,
    timeLabel,
    label,
  });
  lastFrame = frame;
  return frame;
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    world = createWorld();
    camera = null;
    lastFrame = null;
    sessionIds.clear();
    mainSession = null;
    cwd = e.cwd ?? "";
    try {
      mainSession = await $.session.id();
    } catch {
      mainSession = null;
    }
    try {
      home = (await $.env.get("HOME")) || "";
    } catch {
      home = "";
    }
    if (mainSession) ensureSession(mainSession);

    await $.command.register({ name: "bloom", description: "Open the Bloom map" });
    await $.command.register({
      name: "bloom-toggle",
      description: "Open or close the Bloom map",
    });
    return next(e);
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    const { Box, Text, Raster } = $.ui.resolve(e);
    const columns = Math.max(20, (e.viewport?.columns ?? 120) - 4);
    const rows = Math.max(6, (e.viewport?.rows ?? 24) - 4);
    const now = new Date();
    const timeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const hourOfDay = now.getHours() + now.getMinutes() / 60;

    const frame = currentFrame(columns, rows, hourOfDay, timeLabel);

    // The pane redraws on its own timer: the world moves whether or not any
    // event fired, so a still session still breathes.
    if (!frameTimer) {
      frameTimer = $.clock.every(FRAME_MS, () => $.ui.invalidate("ui.render"));
    }

    const header = frameHeader(world, { timeLabel, label });
    const strip = activityStrip(world, columns);

    return Box({
      key: "cc-shannon-bloom-pane",
      flexDirection: "column",
      children: [
        Text({ key: "bloom-header", color: "yellow", children: [header] }),
        Raster({ key: "bloom-map", columns, rows, cells: frame.cells }),
        Text({ key: "bloom-strip", color: "cyan", children: [strip] }),
      ],
    });
  });

  // ── the live event stream ──
  on("turn.start", async ($, e, next) => {
    if (!mainSession) mainSession = await $.session.id().catch(() => null);
    ensureSession(mainSession ?? "main");
    return next(e);
  });

  on("tool.call", async ($, e, next) => {
    const id = ensureSession(e.agentId ?? mainSession ?? "main", {
      parentId: e.agentId ? mainSession : null,
      spawned: Boolean(e.agentId),
    });
    if (id) {
      world.tool(id, e.tool);
      const file = e.file_path ?? e.path ?? null;
      if (e.tool === "Edit" || e.tool === "Write" || e.tool === "MultiEdit") {
        world.edited(id, file ?? e.tool);
      }
    }
    return next(e);
  });

  on("prompt.submit", async ($, e, next) => {
    const id = ensureSession(mainSession ?? "main");
    if (id) world.prompt(id);
    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const id = ensureSession(mainSession ?? "main");
    if (id) world.answer(id);
    $.ui.invalidate("ui.render");
    return next(e);
  });

  // ── subagents, which branch from the session that spawned them ──
  on("agent.spawn", async ($, e, next) => {
    const parent = ensureSession(mainSession ?? "main");
    const key = String(e.tool_use_id ?? `agent-${Date.now()}`);
    world.session({
      id: key,
      hub: hubLabel(cwd),
      parentId: parent,
      spawned: true,
    });
    sessionIds.set(key, { hub: hubLabel(cwd), parentId: parent });
    $.ui.invalidate("ui.render");
    const result = await next(e);
    // The spawn's answer carries the loop id its own events will use; remember
    // it so later tool calls land on the subagent node, not the main session.
    const agentId = result?.agentId;
    if (agentId) {
      sessionIds.set(String(agentId), { hub: hubLabel(cwd), parentId: parent });
    }
    return result;
  });

  // ── commands ──
  on("command.run", { command: "bloom" }, async ($) => {
    const opened = await openPane($);
    return {
      text: opened?.isPlaced
        ? "Bloom is open."
        : `Bloom could not open: ${opened?.reason ?? "unknown reason"}`,
    };
  });

  on("command.run", { command: "bloom-toggle" }, async ($) => {
    const opened = await openPane($);
    return { text: opened?.isPlaced ? "Bloom is open." : "Bloom is already open." };
  });

  on("session.end", async ($, e, next) => {
    if (frameTimer) {
      frameTimer();
      frameTimer = null;
    }
    return next(e);
  });
}

/** Exposed for the host tests: the frame the pane last produced. */
export function lastRenderedFrame() {
  return lastFrame;
}
