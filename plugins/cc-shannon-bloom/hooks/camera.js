/**
 * Camera and grid projection.
 *
 * Bloom's camera fits the whole map (with a pull toward whatever is active) and
 * eases its target with a spring. The pane is a character grid instead of a
 * canvas, so the camera keeps the same behaviour but yields the character extent
 * of each body rather than pixel quads.
 *
 * Pure values only — no mods API here.
 */

import { STEP, smootherstep } from "./sim.js";

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export function createCamera({ columns, rows }) {
  const state = {
    columns,
    rows,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    lz: 0,
    vz: 0,
    primed: false,
  };

  /** The world rectangle to frame, biased toward what was active recently. */
  function fit(world) {
    let ax0 = Infinity;
    let ay0 = Infinity;
    let ax1 = -Infinity;
    let ay1 = -Infinity;
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    let active = 0;

    for (const n of world.nodes) {
      if (!n.alive) continue;
      const pad = n.r + 26;
      bx0 = Math.min(bx0, n.x - pad);
      by0 = Math.min(by0, n.y - pad);
      bx1 = Math.max(bx1, n.x + pad);
      by1 = Math.max(by1, n.y + pad);
      const recent = world.time - n.lastActive < 5 || world.time - n.born < 2;
      if (recent) {
        active += 1;
        ax0 = Math.min(ax0, n.x - pad);
        ay0 = Math.min(ay0, n.y - pad);
        ax1 = Math.max(ax1, n.x + pad);
        ay1 = Math.max(ay1, n.y + pad);
      }
    }
    for (const h of world.hubs) {
      if (!h.alive) continue;
      bx0 = Math.min(bx0, h.x - 60);
      by0 = Math.min(by0, h.y - 30);
      bx1 = Math.max(bx1, h.x + 60);
      by1 = Math.max(by1, h.y + 30);
    }
    if (!Number.isFinite(bx0)) return null;

    let x0 = bx0;
    let y0 = by0;
    let x1 = bx1;
    let y1 = by1;
    if (active) {
      // Keep the whole city partly in mind so the camera does not lurch.
      const k = 0.4;
      x0 = ax0 + (bx0 - ax0) * k;
      y0 = ay0 + (by0 - ay0) * k;
      x1 = ax1 + (bx1 - ax1) * k;
      y1 = ay1 + (by1 - ay1) * k;
    }
    return { x0, y0, x1, y1 };
  }

  function update(world, dt) {
    const box = fit(world);
    if (!box) return;
    const W = state.columns;
    const H = state.rows;
    // Character cells are much taller than wide, so the vertical world scale is
    // about half the horizontal one; a fixed aspect keeps the map from squashing.
    const aspect = 0.5;
    const mx = W * 0.06;
    const mt = H * 0.12;
    const mb = H * 0.12;
    const bw = Math.max(240, box.x1 - box.x0);
    const bh = Math.max(200, box.y1 - box.y0);
    const zx = (W - 2 * mx) / bw;
    const zy = (H - mt - mb) / (bh * aspect);
    const target = Math.log(clamp(Math.min(zx, zy), 0.012, 0.9));

    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const ty = cy - (mt - mb) / 2 / (Math.exp(state.lz) * aspect);

    if (!state.primed) {
      state.primed = true;
      state.x = cx;
      state.y = ty;
      state.lz = target;
    }

    const steps = Math.max(1, Math.round(dt / STEP));
    const wc = 1.5;
    const wz = 1.1;
    for (let i = 0; i < steps; i += 1) {
      state.vx += (-(state.x - cx) * wc * wc - 2 * wc * state.vx) * STEP;
      state.vy += (-(state.y - ty) * wc * wc - 2 * wc * state.vy) * STEP;
      state.vz += (-(state.lz - target) * wz * wz - 2 * wz * state.vz) * STEP;
      state.x += state.vx * STEP;
      state.y += state.vy * STEP;
      state.lz += state.vz * STEP;
    }
  }

  /**
   * World point to a fractional cell. `y` is flipped so positive world y is up,
   * as bloom's shader does.
   */
  function project(x, y) {
    const zoom = Math.exp(state.lz);
    const col = state.columns / 2 + (x - state.x) * zoom;
    const row = state.rows / 2 + (y - state.y) * zoom * 0.5;
    return [col, row];
  }

  /** A world radius, in cell columns; rows use half of it. */
  function scale(radius) {
    return radius * Math.exp(state.lz);
  }

  return { state, update, project, scale, smootherstep };
}
