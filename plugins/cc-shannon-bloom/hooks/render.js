/**
 * World to Raster cells.
 *
 * Bloom paints quads through WebGPU; a pane paints characters. The shapes stay
 * the same idea — hubs, session stars, orbiting children, comets with tails,
 * sparks, rings, a sky — but each lands in a cell of the grid with a glyph and a
 * color. Everything here is pure math on the world state.
 *
 * Pure values only — no mods API here.
 */

import { RGB, packed, skyAt } from "./palette.js";

const DEFAULT_BG = 0x01000000;

/** The character and color a tool kind throws off, per bloom's spark table. */
const SPARK_GLYPH = ["·", "✦", "»", "○", "◦"];

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Standard padded base64 over bytes.
 *
 * The engine's environment gives `Uint8Array.prototype.toBase64`; a plain Node
 * run (the unit tests) does not, so this falls back to the same encoding rather
 * than importing a Node module the module environment cannot load.
 */
function toBase64(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(triple >> 18) & 63] + B64[(triple >> 12) & 63];
    out += b === undefined ? "=" : B64[(triple >> 6) & 63];
    out += c === undefined ? "=" : B64[triple & 63];
  }
  return out;
}

function makeGrid(columns, rows) {
  // [codePoint, foreground, background] per cell, row-major.
  const words = new Uint32Array(columns * rows * 3);
  const put = (index, codePoint, fg, bg) => {
    words[index * 3] = codePoint;
    words[index * 3 + 1] = fg;
    words[index * 3 + 2] = bg;
  };
  return { columns, rows, words, put };
}

/**
 * Render one frame.
 *
 * `opts` carries what the world cannot know: the local hour (for the sky), the
 * label of the person's own comet, and whether the clock and counters show.
 */
export function renderFrame(world, camera, opts = {}) {
  const columns = Math.max(1, Math.floor(opts.columns ?? 80));
  const rows = Math.max(1, Math.floor(opts.rows ?? 24));
  const tiles = makeGrid(columns, rows);

  const sky = skyAt(opts.hourOfDay ?? 12);
  const background = packed(sky, 1);
  const bgColor = background === 0 ? DEFAULT_BG : background;
  for (let i = 0; i < columns * rows; i += 1) tiles.put(i, 32, packed([0, 0, 0], 0), bgColor);

  const at = (col, row) => {
    const x = Math.round(col);
    const y = Math.round(row);
    if (x < 0 || x >= columns || y < 0 || y >= rows) return -1;
    return y * columns + x;
  };
  const stamp = (col, row, glyph, rgb, alpha) => {
    const index = at(col, row);
    if (index < 0) return;
    tiles.put(index, glyph.codePointAt(0) ?? 32, packed(rgb, alpha), bgColor);
  };
  const stampText = (col, row, text, rgb, alpha) => {
    let x = col;
    for (const ch of String(text)) {
      stamp(x, row, ch, rgb, alpha);
      x += 1;
    }
  };

  camera.update(world, opts.dt ?? 1 / 30);
  const project = (x, y) => camera.project(x, y);

  // ── orbit edges: a faint filament from the anchor out to each child ──
  for (const node of world.nodes) {
    if (!node.alive || node.parent === null) continue;
    const anchor = world.nodes[node.parent];
    if (!anchor || !anchor.alive) continue;
    const [x0, y0] = project(anchor.x, anchor.y);
    const [x1, y1] = project(node.x, node.y);
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 1; i < steps; i += 1) {
      const u = i / steps;
      stamp(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, "·", RGB.cool, 0.22);
    }
  }

  // ── spawn pulses: a bead racing down the new edge ──
  for (const pulse of world.pulses) {
    const k = (world.time - pulse.t0) / pulse.dur;
    if (k < 0 || k > 1) continue;
    const from = world.nodes[pulse.from];
    const to = world.nodes[pulse.to];
    if (!from || !to) continue;
    const [x0, y0] = project(from.x, from.y);
    const [x1, y1] = project(to.x, to.y);
    stamp(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, "•", RGB.white, 0.7 * (1 - k) + 0.3);
  }

  // ── comets: agent-to-agent and cross-project prompts ──
  for (const comet of world.comets) {
    const age = world.time - comet.t0;
    if (age < 0) continue;
    const k = Math.min(1, age / comet.dur);
    const cross = comet.kind === "cross";
    const from = world.nodes[comet.from];
    const to = world.nodes[comet.to];
    if (!from || !to) continue;
    const mid = {
      x: (from.x + to.x) / 2 - (to.y - from.y) * comet.bend,
      y: (from.y + to.y) / 2 + (to.x - from.x) * comet.bend,
    };
    const bez = (u) => {
      const i = 1 - u;
      return {
        x: i * i * from.x + 2 * i * u * mid.x + u * u * to.x,
        y: i * i * from.y + 2 * i * u * mid.y + u * u * to.y,
      };
    };

    if (k > 0.9 && cross) {
      // a cross-project comet leaves its arc lingering for a moment.
      const linger = 1 - (k - 0.9) / 0.1;
      for (let i = 0; i <= 10; i += 1) {
        const p = bez(i / 10);
        const [cx, cy] = project(p.x, p.y);
        stamp(cx, cy, "·", RGB.cool, 0.22 * linger);
      }
    }
    if (k <= 1) {
      const head = bez(k);
      // a tapered tail behind the head
      const tail = Math.min(1, 0.22 / Math.max(0.02, age));
      for (let i = 1; i <= 4; i += 1) {
        const u = Math.max(0, k - tail * (i / 4));
        const p = bez(u);
        const [cx, cy] = project(p.x, p.y);
        stamp(cx, cy, "·", RGB.cool, (cross ? 0.5 : 0.35) * (1 - i / 5));
      }
      const [hx, hy] = project(head.x, head.y);
      stamp(hx, hy, cross ? "✦" : "·", RGB.cool, cross ? 0.95 : 0.6);
    }
  }

  // ── the person's comet: warm, with a trail, and a ring where it lands ──
  const avatar = world.avatar;
  if (avatar.alive) {
    for (let i = avatar.trail.length - 1; i >= 0; i -= 1) {
      const [tx, ty] = avatar.trail[i];
      const [cx, cy] = project(tx, ty);
      stamp(cx, cy, "·", RGB.kit, 0.5 * (1 - i / avatar.trail.length));
    }
    const [ax, ay] = project(avatar.x, avatar.y);
    const pulse = Math.exp(-(world.time - avatar.lastArrive) * 5);
    stamp(ax, ay, "◈", RGB.kit, 0.55 + 0.45 * pulse);
    if (pulse > 0.05) {
      const radius = 2 + 6 * pulse;
      for (let a = 0; a < 24; a += 1) {
        const angle = (a / 24) * Math.PI * 2;
        stamp(ax + Math.cos(angle) * radius, ay + Math.sin(angle) * radius * 0.5, "·", RGB.kit, 0.5 * pulse);
      }
    }
  }

  // ── rings: a landing or a spawn, expanding and fading ──
  for (const ring of world.rings) {
    const k = (world.time - ring.t0) / ring.dur;
    if (k < 0 || k > 1) continue;
    const node = world.nodes[ring.node];
    if (!node) continue;
    const [cx, cy] = project(node.x, node.y);
    const radius = camera.scale(node.r + ring.grow * k);
    const alpha = ring.alpha * (1 - k) * (1 - k);
    const points = Math.max(8, Math.round(radius * 4));
    for (let a = 0; a < points; a += 1) {
      const angle = (a / points) * Math.PI * 2;
      stamp(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius * 0.5,
        "·",
        ring.color,
        alpha,
      );
    }
  }

  // ── sparks: one glyph per tool kind, fading as it flies ──
  for (const spark of world.sparks()) {
    const [cx, cy] = project(spark.x, spark.y);
    stamp(cx, cy, SPARK_GLYPH[spark.kind] ?? "·", spark.color, 0.35 + 0.65 * spark.alpha);
  }

  // ── drifted file names, faint and moving outward ──
  for (const drift of world.drifts) {
    const age = world.time - drift.t0;
    if (age < 0 || age > 1.8) continue;
    const node = world.nodes[drift.node];
    if (!node) continue;
    const fade = 1 - age / 1.8;
    const dist = camera.scale(node.r + 6 + age * 90);
    const [cx, cy] = project(node.x + Math.cos(drift.angle) * 0, node.y);
    stampText(cx + dist * 0.4, cy + dist * 0.15, drift.name, RGB.white, 0.5 * fade);
  }

  // ── project hubs first: their caption is annotation, so a session star
  // drawn after can never be hidden behind a label. ──
  for (const hub of world.hubs) {
    if (!hub.alive) continue;
    const [cx, cy] = project(hub.x, hub.y);
    // The marker and label sit clear of the hub's own point: a session star is
    // drawn there, and a star must never be able to split the caption.
    stamp(cx - 3, cy, "◉", hub.color, 0.75 + 0.25 * Math.min(1, hub.heat));
    stampText(cx + 2, cy, hub.label.slice(0, Math.max(0, columns - Math.round(cx) - 3)), hub.color, 0.55 + 0.45 * Math.min(1, hub.heat));
  }

  // ── session stars, drawn last so they always read ──
  for (const node of world.nodes) {
    if (!node.alive) continue;
    const [cx, cy] = project(node.x, node.y);
    const flash = node.spawnFlash;
    const heat = Math.min(1, node.energy / 1.5);
    const alpha = 0.6 + 0.4 * Math.min(1, heat + flash);
    stamp(cx, cy, node.root ? "●" : "•", RGB.white, alpha);
    if (node.gather > 0.05) {
      const radius = 2 + node.gather * 4;
      for (let a = 0; a < 12; a += 1) {
        const angle = (a / 12) * Math.PI * 2;
        stamp(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * 0.5, "·", RGB.cool, 0.5 * node.gather);
      }
    }
  }

  return {
    columns,
    rows,
    cells: toBase64(new Uint8Array(tiles.words.buffer)),
    background: bgColor,
  };
}

/** The header line the panel draws above the raster: clock and counters. */
export function frameHeader(world, opts = {}) {
  const clock = String(opts.timeLabel ?? "--:--");
  const label = String(opts.label ?? "you");
  const { sessions, subagents, messages, tools } = world.counts;
  return `${clock}  ${label}  ·  ${sessions} sessions  ${subagents} agents  ${messages} msgs  ${tools} tools`;
}

/** The activity strip: events per bucket over the recent window, as a row. */
export function activityStrip(world, columns) {
  const width = Math.max(8, Math.floor(columns));
  const buckets = new Array(width).fill(0);
  for (let i = 0; i < world.sage.length; i += 1) {
    if (world.sage[i] >= world.slife[i]) continue;
    const u = (world.sage[i] / world.slife[i]);
    const index = Math.min(width - 1, Math.max(0, Math.floor((1 - u) * (width - 1))));
    buckets[index] += 1;
  }
  const peak = Math.max(1, ...buckets);
  const ramp = " ▁▂▃▄▅▆▇█";
  return buckets
    .map((value) => ramp[Math.min(ramp.length - 1, Math.round((value / peak) * (ramp.length - 1)))])
    .join("");
}
