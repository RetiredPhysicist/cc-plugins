/**
 * The world simulation, adapted from opencode-bloom (MIT, Kit Langton).
 *
 * Bloom steps a whole day of recorded OpenCode events at a fixed 1/480 s of
 * video time. Here the same forces, springs and comets run on live Claude Code
 * events instead: a project hub per working directory, a session node per
 * session, subagent nodes branching from their parents, and tool calls thrown
 * off as sparks. Nothing reads the disk or the clock — the caller advances the
 * world and feeds it events, so it stays pure and unit-testable.
 *
 * Pure values only — no mods API here.
 */

import { PALETTE, RGB, TOOL_COLORS, mix, toolKind } from "./palette.js";

export const STEP = 1 / 480;
/** A parent gathers itself this long (video seconds) before releasing a child. */
export const ANTICIPATION = 0.16;
const MAX_SPARKS = 6000;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smootherstep = (u) => u * u * u * (u * (u * 6 - 15) + 10);

/** A quadratic arc bowed sideways by `bend` (fraction of the chord). */
export function arc(ax, ay, bx, by, bend, s) {
  const dx = bx - ax;
  const dy = by - ay;
  const mx = (ax + bx) / 2 - dy * bend;
  const my = (ay + by) / 2 + dx * bend;
  const i = 1 - s;
  return [i * i * ax + 2 * i * s * mx + s * s * bx, i * i * ay + 2 * i * s * my + s * s * by];
}

/**
 * The live world. The caller names a project (by its display label) and a
 * session, and the world creates whatever it needs; there is no fixed roster.
 */
export function createWorld(options = {}) {
  const rand = rng(options.seed ?? 7);
  const state = {
    time: 0,
    hubs: [],
    nodes: [],
    rings: [],
    comets: [],
    pulses: [],
    drifts: [],
    /** the warm comet that flies to a session each time the person prompts. */
    avatar: {
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      target: -1,
      lastArrive: -1e9,
      flight: null,
      queue: [],
      trail: [],
      orbit: 0,
      flights: 0,
    },
    counts: { sessions: 0, subagents: 0, messages: 0, tools: 0 },
    sx: new Float32Array(MAX_SPARKS),
    sy: new Float32Array(MAX_SPARKS),
    svx: new Float32Array(MAX_SPARKS),
    svy: new Float32Array(MAX_SPARKS),
    sage: new Float32Array(MAX_SPARKS),
    slife: new Float32Array(MAX_SPARKS),
    ssize: new Float32Array(MAX_SPARKS),
    shub: new Int16Array(MAX_SPARKS),
    skind: new Int8Array(MAX_SPARKS),
    sparkHead: 0,
    nextHue: 0,
    bornOrder: 0,
  };

  let lastDrift = -1e9;
  const lastDriftBy = new Map();

  /** The index of a hub by label, creating it on first sight. */
  function hubFor(label, parentLabel = null) {
    const name = String(label || "unknown");
    const found = state.hubs.findIndex((hub) => hub.label === name);
    if (found >= 0) return found;

    let color;
    let parent = null;
    if (parentLabel) {
      const parentIndex = state.hubs.findIndex((hub) => hub.label === String(parentLabel));
      if (parentIndex >= 0) {
        parent = parentIndex;
        const base = state.hubs[parentIndex].color;
        color = [base[0] * 0.7 + 0.3, base[1] * 0.7 + 0.3, base[2] * 0.7 + 0.3];
      }
    }
    if (!color) color = PALETTE[state.nextHue++ % PALETTE.length];

    state.hubs.push({
      label: name,
      parent,
      color,
      alive: false,
      born: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      count: 0,
      heat: 0,
      extent: 20,
      lastActive: -1e9,
    });
    return state.hubs.length - 1;
  }

  /** The index of a session node, creating it on first sight. */
  function nodeFor({ id, hub, parentId = null, title = "", root = false }) {
    const key = String(id);
    const found = state.nodes.findIndex((node) => node.key === key);
    if (found >= 0) {
      if (title) state.nodes[found].title = title;
      return found;
    }

    let parent = null;
    if (parentId) {
      const parentIndex = state.nodes.findIndex((node) => node.key === String(parentId));
      if (parentIndex >= 0) parent = parentIndex;
    }

    state.nodes.push({
      key,
      cluster: hubFor(hub),
      parent,
      root: root || parent === null,
      title,
      alive: false,
      born: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 0,
      rv: 0,
      msgs: 0,
      energy: 0,
      lastActive: -1e9,
      spawnFlash: 0,
      gather: 0,
    });
    return state.nodes.length - 1;
  }

  function bornHub(i, near) {
    const h = state.hubs[i];
    if (h.alive) return;
    if (h.parent !== null) bornHub(h.parent);
    h.alive = true;
    h.born = state.time;
    const alive = state.hubs.filter((other) => other.alive && other !== h);
    if (h.parent !== null) {
      const p = state.hubs[h.parent];
      const a = Math.atan2(p.y, p.x) + (rand() - 0.5) * 1.6;
      h.x = p.x + Math.cos(a) * 170;
      h.y = p.y + Math.sin(a) * 170;
    } else if (near) {
      const a = rand() * Math.PI * 2;
      h.x = near.x + Math.cos(a) * 200;
      h.y = near.y + Math.sin(a) * 200;
    } else if (alive.length === 0) {
      h.x = 0;
      h.y = 0;
    } else {
      // Golden-angle spiral leaves room around the existing city.
      const k = state.bornOrder;
      const a = k * 2.39996 + 0.6;
      const rad = 140 + 95 * Math.sqrt(k);
      h.x = Math.cos(a) * rad;
      h.y = Math.sin(a) * rad * 0.8;
    }
    state.bornOrder += 1;
  }

  function born(n, spawned) {
    const node = state.nodes[n];
    if (node.alive) return;
    node.alive = true;
    node.born = state.time;
    node.lastActive = state.time;
    const hub = state.hubs[node.cluster];
    if (node.parent !== null && state.nodes[node.parent].alive) {
      const p = state.nodes[node.parent];
      const anchor = p.parent !== null ? state.nodes[p.parent] : state.hubs[p.cluster];
      const base = Math.atan2(p.y - anchor.y, p.x - anchor.x);
      const a = base + (rand() - 0.5) * 2.2;
      node.x = p.x + Math.cos(a) * 4;
      node.y = p.y + Math.sin(a) * 4;
      const kick = spawned ? 260 : 60;
      node.vx = p.vx + Math.cos(a) * kick;
      node.vy = p.vy + Math.sin(a) * kick;
      if (spawned) {
        state.pulses.push({ from: node.parent, to: n, t0: state.time, dur: 0.35 });
        burst(node.parent, 10, 140);
      }
    } else {
      bornHub(node.cluster);
      const a = rand() * Math.PI * 2;
      node.x = hub.x + Math.cos(a) * 6;
      node.y = hub.y + Math.sin(a) * 6;
      node.vx = Math.cos(a) * 120;
      node.vy = Math.sin(a) * 120;
    }
    node.r = 0;
    node.rv = 0;
    node.spawnFlash = spawned ? 1 : 0.5;
    hub.count += 1;
    if (node.root) state.counts.sessions += 1;
    else state.counts.subagents += 1;
  }

  function spark(n, speed, life, size, angle, kind = 4) {
    const node = state.nodes[n];
    if (!node || !node.alive) return;
    const i = state.sparkHead;
    state.sparkHead = (state.sparkHead + 1) % MAX_SPARKS;
    const a = angle ?? rand() * Math.PI * 2;
    const s = speed * (0.6 + rand() * 0.8);
    const r = node.r * 0.8;
    state.sx[i] = node.x + Math.cos(a) * r;
    state.sy[i] = node.y + Math.sin(a) * r;
    state.svx[i] = node.vx * 0.5 + Math.cos(a) * s;
    state.svy[i] = node.vy * 0.5 + Math.sin(a) * s;
    state.sage[i] = 0;
    state.slife[i] = life * (0.7 + rand() * 0.6);
    state.ssize[i] = size;
    state.shub[i] = node.cluster;
    state.skind[i] = kind;
  }

  function burst(n, count, speed) {
    const off = rand() * Math.PI * 2;
    for (let k = 0; k < count; k += 1) spark(n, speed, 0.9, 1.5, off + (k / count) * Math.PI * 2);
  }

  function touch(n, energy) {
    const node = state.nodes[n];
    if (!node) return;
    node.energy = Math.min(2.5, node.energy + energy);
    node.lastActive = state.time;
    const hub = state.hubs[node.cluster];
    hub.lastActive = state.time;
    hub.heat = Math.min(1.5, hub.heat + energy * 0.15);
  }

  /** Kit's prompt arrives: the session flashes and a warm ring opens. */
  function land(n, strength) {
    const node = state.nodes[n];
    if (!node) return;
    node.energy = Math.min(2.5, node.energy + 0.5 * strength);
    node.spawnFlash = Math.max(node.spawnFlash, 0.35 * strength);
    state.rings.push({
      node: n,
      t0: state.time,
      dur: 1.0,
      grow: 30 * strength,
      color: RGB.kit,
      width: 1.5,
      alpha: 0.85 * strength,
    });
  }

  function launch() {
    const av = state.avatar;
    const to = av.queue.shift();
    if (to === undefined) return;
    const n = state.nodes[to];
    const d = Math.hypot(n.x - av.x, n.y - av.y);
    const hurry = av.queue.length ? 0.75 : 1;
    av.flight = {
      fx: av.x,
      fy: av.y,
      to,
      t0: state.time,
      dur: Math.min(0.75, Math.max(0.3, 0.22 + d / 900)) * hurry,
      bend: av.flights++ % 2 ? 0.22 : -0.22,
    };
  }

  // ── the caller's event surface ─────────────────────────────

  /** A session appeared. `parentId` makes it a subagent of that session. */
  function session({ id, hub, parentId = null, parentHub = null, title = "", spawned = false }) {
    const n = nodeFor({ id, hub, parentId, title, root: !parentId });
    if (!state.nodes[n].alive && spawned && state.nodes[n].parent !== null) {
      const p = state.nodes[n].parent;
      if (state.nodes[p].alive) {
        const parent = state.nodes[p];
        parent.rv -= parent.r * 5;
        parent.gather = 1;
        const node = state.nodes[n];
        node.pendingAt = state.time + ANTICIPATION;
        touch(n, 1);
        return n;
      }
    }
    born(n, spawned);
    return n;
  }

  /** The person prompted a session: the warm comet flies there. */
  function prompt(id) {
    const n = state.nodes.findIndex((node) => node.key === String(id));
    if (n < 0) return;
    const node = state.nodes[n];
    node.msgs += 1;
    touch(n, 0.9);
    state.counts.messages += 1;
    const av = state.avatar;
    if (!av.alive) {
      av.alive = true;
      av.x = node.x + 80;
      av.y = node.y - 80;
    }
    // A backlog is cut short: older prompts land as a quiet flash, no flight.
    while (av.queue.length >= 2) land(av.queue.shift(), 0.4);
    av.queue.push(n);
    if (!av.flight) launch();
  }

  /** The model answered. */
  function answer(id) {
    const n = state.nodes.findIndex((node) => node.key === String(id));
    if (n < 0) return;
    state.counts.messages += 1;
    state.nodes[n].msgs += 1;
    touch(n, 0.32);
  }

  /** A tool ran: one spark, colored and shaped by its kind. */
  function tool(id, name) {
    const n = state.nodes.findIndex((node) => node.key === String(id));
    if (n < 0) return;
    const kind = toolKind(name);
    const big = kind === 1 || kind === 4;
    spark(n, big ? 95 : 70, big ? 1.1 : 0.8, big ? 1.6 : 1.1, undefined, Math.min(4, kind));
    state.counts.tools += 1;
    touch(n, 0.05);
  }

  /** A file was edited: its basename drifts off the session, heavily rate-limited. */
  function edited(id, name) {
    const n = state.nodes.findIndex((node) => node.key === String(id));
    if (n < 0 || !state.nodes[n].alive) return;
    const base = String(name || "").split("/").pop();
    if (!base) return;
    // one name every ~0.45 s overall, one per session per 2.5 s, five in flight.
    if (state.time - lastDrift < 0.45 || state.time - (lastDriftBy.get(n) ?? -1e9) < 2.5) return;
    if (state.drifts.filter((d) => state.time - d.t0 < 1.6).length >= 5) return;
    lastDrift = state.time;
    lastDriftBy.set(n, state.time);
    state.drifts.push({ node: n, name: base, t0: state.time, angle: rand() * Math.PI * 2 });
  }

  /** A prompt that crossed from one session (or project) to another. */
  function cross(fromId, toId) {
    const from = state.nodes.findIndex((node) => node.key === String(fromId));
    const to = state.nodes.findIndex((node) => node.key === String(toId));
    if (from < 0 || to < 0) return;
    if (!state.nodes[to].alive) born(to, false);
    state.comets.push({
      from,
      to,
      t0: state.time,
      dur: 1.1,
      bend: rand() < 0.5 ? -0.28 : 0.28,
      kind: "cross",
    });
    state.counts.messages += 1;
    touch(from, 0.6);
    state.nodes[to].msgs += 1;
  }

  // ── the world's own physics ────────────────────────────────

  function step() {
    const dt = STEP;
    state.time += dt;
    const t = state.time;
    const { nodes, hubs } = state;

    // Pending births: a parent's anticipation reached its release time.
    for (const node of nodes) {
      if (node.pendingAt !== undefined && node.pendingAt <= t && !node.alive) {
        delete node.pendingAt;
        born(nodes.indexOf(node), true);
        node.energy = Math.max(node.energy, 1);
      }
    }

    // Hub forces: mutual repulsion scaled by cluster size, worktree tethers, gravity.
    for (let i = 0; i < hubs.length; i += 1) {
      const a = hubs[i];
      if (!a.alive) continue;
      let fx = -a.x * 0.22;
      let fy = -a.y * 0.5;
      for (let j = 0; j < hubs.length; j += 1) {
        if (i === j) continue;
        const b = hubs[j];
        if (!b.alive) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy + 1;
        const d = Math.sqrt(d2);
        const want = a.extent + b.extent + 70;
        let f = (26000 / d2) * (1 + Math.sqrt(a.count + b.count) * 0.5);
        if (d < want) f += (want - d) * 9;
        fx += (dx / d) * f;
        fy += (dy / d) * f;
      }
      if (a.parent !== null) {
        const p = hubs[a.parent];
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        const rest = a.extent + p.extent + 60;
        const f = (d - rest) * 3;
        fx += (dx / d) * f;
        fy += (dy / d) * f;
        p.vx -= (dx / d) * f * dt * 0.5;
        p.vy -= (dy / d) * f * dt * 0.5;
      }
      a.vx += fx * dt;
      a.vy += fy * dt;
    }

    // Session forces: tether to the parent (or hub), orbit, and keep clear.
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      if (!a.alive) continue;
      let fx = 0;
      let fy = 0;
      const anchor = a.parent !== null && nodes[a.parent].alive ? nodes[a.parent] : null;
      const hub = hubs[a.cluster];
      const ax = anchor ? anchor.x : hub.x;
      const ay = anchor ? anchor.y : hub.y;
      {
        const dx = ax - a.x;
        const dy = ay - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        const rest = anchor ? anchor.r + a.r + 16 : 30 + a.r;
        const k = anchor ? 70 : 40;
        const f = (d - rest) * k;
        const ux = dx / d;
        const uy = dy / d;
        fx += ux * f;
        fy += uy * f;
        const ma = a.root ? 2 : 1;
        const mb = anchor ? (anchor.root ? 2 : 1) : 4 + hub.count;
        const back = (f * dt * ma) / mb;
        if (anchor) {
          anchor.vx -= ux * back;
          anchor.vy -= uy * back;
        } else {
          hub.vx -= ux * back;
          hub.vy -= uy * back;
        }
        fx /= ma;
        fy /= ma;
        if (anchor && a.parent !== null) {
          // finished leaves settle into fixed points of the map.
          const settled = Math.min(1, Math.max(0, (state.time - a.lastActive - 6) / 8));
          const spin = (a.parent % 2 ? 1 : -1) * 9 * (1 - settled);
          fx += -uy * spin;
          fy += ux * spin;
        }
      }
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        if (!b.alive) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        const cut = 70 + a.r + b.r;
        if (d2 > cut * cut) continue;
        const d = Math.sqrt(d2) + 0.01;
        const fall = 1 - d / cut;
        const f = 5200 * fall * fall * (1 + (a.r + b.r) * 0.05);
        const ux = dx / d;
        const uy = dy / d;
        fx += ux * f;
        fy += uy * f;
        b.vx -= ux * f * dt;
        b.vy -= uy * f * dt;
      }
      a.vx += fx * dt;
      a.vy += fy * dt;
    }

    const damp = Math.exp(-5.5 * dt);
    const hubDamp = Math.exp(-4 * dt);
    for (const h of hubs) {
      if (!h.alive) continue;
      h.vx *= hubDamp;
      h.vy *= hubDamp;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.heat *= Math.exp(-0.45 * dt);
    }

    // Per-cluster territory: measured around the members' own centroid, so a hub
    // that drifts from its sessions cannot inflate its extent and push itself away.
    const spread = new Float64Array(hubs.length);
    const members = new Float64Array(hubs.length);
    const cxs = new Float64Array(hubs.length);
    const cys = new Float64Array(hubs.length);
    for (const n of nodes) {
      if (!n.alive) continue;
      n.vx *= damp;
      n.vy *= damp;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.energy *= Math.exp(-1.1 * dt);
      n.spawnFlash *= Math.exp(-3 * dt);
      n.gather *= Math.exp(-7 * dt);
      // radius spring: underdamped so new sessions pop, then grows with messages.
      const target = (n.root ? 4.2 : 2.6) + Math.sqrt(n.msgs) * (n.root ? 0.62 : 0.5);
      const w = 16;
      const z = 0.42;
      n.rv += (-(n.r - target) * w * w - 2 * z * w * n.rv) * dt;
      n.r += n.rv * dt;
      cxs[n.cluster] += n.x;
      cys[n.cluster] += n.y;
      members[n.cluster] += 1;
    }
    for (const n of nodes) {
      if (!n.alive) continue;
      const m = members[n.cluster];
      const d = Math.hypot(n.x - cxs[n.cluster] / m, n.y - cys[n.cluster] / m) + n.r;
      spread[n.cluster] += d * d;
    }
    for (let i = 0; i < hubs.length; i += 1) {
      const h = hubs[i];
      if (!h.alive) continue;
      const rms = members[i] ? Math.sqrt(spread[i] / members[i]) : 0;
      const want = Math.min(Math.max(24, rms * 1.5 + 10), 40 + 22 * Math.sqrt(members[i]));
      h.extent += (want - h.extent) * (1 - Math.exp(-1 * dt));
    }

    // The warm comet: minimum-jerk travel along an arc, then a slow orbit.
    const av = state.avatar;
    if (av.alive) {
      const f = av.flight;
      if (f) {
        const u = Math.min(1, (t - f.t0) / f.dur);
        const n = nodes[f.to];
        const p = arc(f.fx, f.fy, n.x, n.y, f.bend, smootherstep(u));
        av.vx = (p[0] - av.x) / dt;
        av.vy = (p[1] - av.y) / dt;
        av.x = p[0];
        av.y = p[1];
        if (u >= 1) {
          av.flight = null;
          av.vx = 0;
          av.vy = 0;
          land(f.to, 1);
          av.target = f.to;
          av.lastArrive = t;
          av.orbit = Math.atan2(f.fy - n.y, f.fx - n.x);
          if (av.queue.length) launch();
        }
      } else if (av.target >= 0) {
        const n = nodes[av.target];
        av.orbit += dt * 0.7;
        const rad = n.r + 16;
        const tx = n.x + Math.cos(av.orbit) * rad;
        const ty = n.y + Math.sin(av.orbit) * rad;
        const w = 5;
        const z = 0.95;
        av.vx += (-(av.x - tx) * w * w - 2 * z * w * av.vx) * dt;
        av.vy += (-(av.y - ty) * w * w - 2 * z * w * av.vy) * dt;
        av.x += av.vx * dt;
        av.y += av.vy * dt;
      }
    }

    // Sparks: ballistic with drag.
    const drag = Math.exp(-2.6 * dt);
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      if (state.sage[i] >= state.slife[i]) continue;
      state.sage[i] += dt;
      state.svx[i] *= drag;
      state.svy[i] *= drag;
      state.sx[i] += state.svx[i] * dt;
      state.sy[i] += state.svy[i] * dt;
    }

    if (Math.round(t / dt) % 32 === 0) {
      state.rings = state.rings.filter((r) => t - r.t0 < r.dur);
      state.comets = state.comets.filter((c) => t - c.t0 < c.dur + 2.2);
      state.pulses = state.pulses.filter((p) => t - p.t0 < p.dur + 0.1);
      state.drifts = state.drifts.filter((d) => t - d.t0 < 1.8);
    }
  }

  /** Called once per rendered frame to sample the comet's trail. */
  function sampleTrail() {
    const av = state.avatar;
    if (!av.alive) return;
    av.trail.unshift([av.x, av.y]);
    if (av.trail.length > 14) av.trail.pop();
  }

  /** Live sparks, as { x, y, kind, color, size, alpha } for the renderer. */
  function sparks() {
    const list = [];
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      const age = state.sage[i];
      const life = state.slife[i];
      if (age >= life) continue;
      const k = age / life;
      const hub = state.hubs[state.shub[i]];
      const base = TOOL_COLORS[state.skind[i]] ?? RGB.white;
      list.push({
        x: state.sx[i],
        y: state.sy[i],
        kind: state.skind[i],
        color: hub ? mix(base, hub.color, 0.25) : base,
        size: state.ssize[i],
        alpha: Math.pow(1 - k, 1.6),
      });
    }
    return list;
  }

  // One flat object: the renderer and camera read `world.nodes`, `world.time`
  // and the rest directly, and the caller drives it through the methods.
  return Object.assign(state, {
    session,
    prompt,
    answer,
    tool,
    edited,
    cross,
    step,
    sampleTrail,
    sparks,
  });
}

export { MAX_SPARKS };
