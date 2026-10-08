import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SPARKS, arc, createWorld, smootherstep } from "../hooks/sim.js";

/** Advance the world by `seconds` at its fixed step. */
function run(world, seconds) {
  const steps = Math.round(seconds * 480);
  for (let i = 0; i < steps; i += 1) world.step();
}

test("a session creates its project hub", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "cc-plugins" });
  assert.equal(world.hubs.length, 1);
  assert.equal(world.hubs[0].label, "cc-plugins");
  assert.equal(world.nodes.length, 1);
  assert.equal(world.counts.sessions, 1);
});

test("two projects get distinct, contrasting colors", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.session({ id: "s2", hub: "beta" });
  assert.notDeepEqual(world.hubs[0].color, world.hubs[1].color);
  assert.equal(world.hubs.length, 2);
});

test("a subagent branches from its parent", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  const child = world.session({ id: "a1", hub: "alpha", parentId: "s1", spawned: true });
  assert.ok(child !== null);
  assert.equal(world.nodes[1].parent, 0);
  // The child is held back by the parent's anticipation, then born.
  assert.equal(world.counts.subagents, 0);
  run(world, 0.5);
  assert.equal(world.counts.subagents, 1);
});

test("reusing a session id does not create a second node", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.session({ id: "s1", hub: "alpha" });
  world.session({ id: "s1", hub: "alpha" });
  assert.equal(world.nodes.length, 1);
});

test("a tool call throws a spark and counts", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  const before = world.sparks().length;
  world.tool("s1", "Bash");
  assert.equal(world.counts.tools, 1);
  assert.ok(world.sparks().length > before, "a spark is in the air");
});

test("tool kinds color the spark differently", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.tool("s1", "Read");
  world.tool("s1", "Bash");
  const sparks = world.sparks();
  assert.equal(sparks.length, 2);
  assert.equal(sparks[0].kind, 0);
  assert.equal(sparks[1].kind, 2);
  assert.notDeepEqual(sparks[0].color, sparks[1].color);
});

test("a tool for an unknown session is ignored, not a crash", () => {
  const world = createWorld();
  world.tool("nobody", "Bash");
  assert.equal(world.counts.tools, 0);
});

test("an edit drifts the file's basename, and is rate-limited", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.edited("s1", "/Users/x/project/src/main.ts");
  assert.equal(world.drifts.length, 1);
  assert.equal(world.drifts[0].name, "main.ts");
  // A second edit a moment later is dropped by the rate limit.
  run(world, 0.1);
  world.edited("s1", "/Users/x/project/src/other.ts");
  assert.equal(world.drifts.length, 1);
});

test("a prompt sends the warm comet to the session", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.prompt("s1");
  assert.equal(world.counts.messages, 1);
  assert.ok(world.avatar.alive, "the comet woke");
  assert.ok(world.avatar.flight, "the comet launched toward the session");
  run(world, 1);
  // The flight is short (a fraction of a second); afterwards it orbits the
  // session it reached, and the landing opened a ring that lingers a beat.
  assert.equal(world.avatar.flight, null);
  assert.equal(world.avatar.target, 0);
  assert.ok(world.rings.length > 0, "the landing opened a ring");
});

test("sampling the comet's trail keeps a bounded tail", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.prompt("s1");
  for (let i = 0; i < 60; i += 1) {
    world.step();
    world.sampleTrail();
  }
  assert.ok(world.avatar.trail.length > 0, "the trail filled");
  assert.ok(world.avatar.trail.length <= 14, "and is bounded");
});

test("a cross-session prompt flies a comet between the two nodes", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.session({ id: "s2", hub: "beta" });
  world.cross("s1", "s2");
  assert.equal(world.comets.length, 1);
  assert.equal(world.comets[0].kind, "cross");
});

test("spawn anticipation delays the child's birth", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  run(world, 2);
  world.session({ id: "a1", hub: "alpha", parentId: "s1", spawned: true });
  assert.equal(world.nodes[1].alive, false, "not born yet: the parent is gathering");
  run(world, 0.5);
  assert.equal(world.nodes[1].alive, true, "born once the anticipation passed");
});

test("the world keeps evolving: nodes move and settle", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  world.session({ id: "s2", hub: "beta" });
  world.session({ id: "a1", hub: "alpha", parentId: "s1", spawned: true });
  run(world, 1);
  const before = world.nodes.map((n) => [n.x, n.y]);
  run(world, 5);
  const after = world.nodes.map((n) => [n.x, n.y]);
  assert.notDeepEqual(before, after, "the map moved");
  for (const n of world.nodes) {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), "positions stay finite");
    assert.ok(Number.isFinite(n.r) && n.r >= 0, "radii stay sane");
  }
});

test("the spark ring buffer is bounded", () => {
  const world = createWorld();
  world.session({ id: "s1", hub: "alpha" });
  for (let i = 0; i < MAX_SPARKS + 500; i += 1) world.tool("s1", "Bash");
  // The live count never exceeds the ring, however many were thrown.
  assert.ok(world.sparks().length <= MAX_SPARKS);
  assert.equal(world.counts.tools, MAX_SPARKS + 500);
});

test("smootherstep has zero velocity at both ends", () => {
  assert.equal(smootherstep(0), 0);
  assert.equal(smootherstep(1), 1);
  assert.equal(smootherstep(0.5), 0.5);
});

test("an arc bows away from its chord", () => {
  const straight = arc(0, 0, 10, 0, 0, 0.5);
  assert.deepEqual(straight, [5, 0]);
  const bowed = arc(0, 0, 10, 0, 0.3, 0.5);
  assert.notDeepEqual(bowed, [5, 0]);
  assert.equal(bowed[0], 5);
});
