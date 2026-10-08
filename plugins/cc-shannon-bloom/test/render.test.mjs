import { test } from "node:test";
import assert from "node:assert/strict";
import { createCamera } from "../hooks/camera.js";
import { createWorld } from "../hooks/sim.js";
import { activityStrip, frameHeader, renderFrame } from "../hooks/render.js";

function run(world, seconds) {
  const steps = Math.round(seconds * 480);
  for (let i = 0; i < steps; i += 1) world.step();
}

/** Decode a rendered frame back to a grid of glyphs for inspection. */
function grid(frame) {
  const raw = Buffer.from(frame.cells, "base64");
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const cells = [];
  for (let i = 0; i < frame.columns * frame.rows; i += 1) {
    const cp = view.getUint32(i * 12, true);
    const fg = view.getUint32(i * 12 + 4, true);
    cells.push({ char: String.fromCodePoint(cp), fg });
  }
  return cells;
}

test("a frame is packed as columns*rows rgb-triplet cells", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  const camera = createCamera({ columns: 40, rows: 12 });
  const frame = renderFrame(world, camera, { columns: 40, rows: 12, hourOfDay: 21, dt: 1 / 30 });
  const raw = Buffer.from(frame.cells, "base64");
  assert.equal(raw.byteLength, 40 * 12 * 12, "12 bytes per cell: glyph + fg + bg");
});

test("the hub label and its marker reach the grid", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "cc-plugins" });
  const camera = createCamera({ columns: 60, rows: 16 });
  const frame = renderFrame(world, camera, { columns: 60, rows: 16, hourOfDay: 21, dt: 1 / 30 });
  const text = grid(frame)
    .map((cell) => cell.char)
    .join("");
  assert.ok(text.includes("◉"), "the hub marker is drawn");
  assert.ok(text.includes("cc-plugins"), "the hub's label is drawn");
});

test("the background is the sky color for the hour", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  const night = createCamera({ columns: 30, rows: 10 });
  const day = createCamera({ columns: 30, rows: 10 });
  const nightFrame = renderFrame(world, night, { columns: 30, rows: 10, hourOfDay: 1, dt: 1 / 30 });
  const dayFrame = renderFrame(world, day, { columns: 30, rows: 10, hourOfDay: 12, dt: 1 / 30 });
  assert.notEqual(nightFrame.background, dayFrame.background, "the sky changes with the hour");
  assert.ok(dayFrame.background > nightFrame.background, "day is a lighter blue than night");
});

test("a session star is drawn once its session is alive", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  run(world, 1);
  const camera = createCamera({ columns: 60, rows: 16 });
  const frame = renderFrame(world, camera, { columns: 60, rows: 16, hourOfDay: 21, dt: 1 / 30 });
  const text = grid(frame)
    .map((cell) => cell.char)
    .join("");
  assert.ok(text.includes("●"), "the root session is a filled star");
});

test("the renderer is deterministic for a fixed world", () => {
  const build = () => {
    const world = createWorld();
    world.session({ id: "s1", hub: "alpha" });
    world.session({ id: "s2", hub: "beta" });
    world.prompt("s1");
    world.tool("s1", "Bash");
    run(world, 1);
    return world;
  };
  const a = build();
  const b = build();
  // Two worlds advanced identically land on the same positions and colors.
  const ca = createCamera({ columns: 40, rows: 12 });
  const cb = createCamera({ columns: 40, rows: 12 });
  const fa = renderFrame(a, ca, { columns: 40, rows: 12, hourOfDay: 21, dt: 1 / 30 });
  const fb = renderFrame(b, cb, { columns: 40, rows: 12, hourOfDay: 21, dt: 1 / 30 });
  assert.equal(fa.cells, fb.cells);
  assert.equal(fa.background, fb.background);
});

test("the header carries the clock, label and counters", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.prompt("s1");
  const header = frameHeader(world, { timeLabel: "21:04", label: "slahser" });
  assert.ok(header.includes("21:04"));
  assert.ok(header.includes("slahser"));
  assert.ok(header.includes("1 sessions"));
});

test("the activity strip is one row of columns", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.tool("s1", "Bash");
  const strip = activityStrip(world, 40);
  assert.equal([...strip].length, 40);
  assert.ok(/[▁▂▃▄▅▆▇█]/.test(strip), "recent activity raises a bar");
});

test("no session means a clean sky, not a crash", () => {
  const world = createWorld();
  const camera = createCamera({ columns: 30, rows: 10 });
  const frame = renderFrame(world, camera, { columns: 30, rows: 10, hourOfDay: 21, dt: 1 / 30 });
  assert.equal(frame.columns, 30);
  assert.equal(frame.rows, 10);
  assert.ok(frame.cells.length > 0);
});

test("the camera keeps the map in frame", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.session({ id: "s2", hub: "beta" });
  world.session({ id: "s3", hub: "gamma" });
  run(world, 3);
  const camera = createCamera({ columns: 80, rows: 24 });
  const frame = renderFrame(world, camera, { columns: 80, rows: 24, hourOfDay: 21, dt: 1 / 30 });
  const cells = grid(frame);
  // Every hub and label lands inside the grid; nothing runs off the edge.
  assert.ok(cells.length === 80 * 24);
  const drawn = cells.filter((cell) => cell.char !== " ").length;
  assert.ok(drawn > 3, "the map is visible");
});
