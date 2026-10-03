import { test } from "node:test";
import assert from "node:assert/strict";
import { createLatency, describe, record, slowest } from "../hooks/latency.js";

test("recording keeps the measured duration", () => {
  const state = record(createLatency(), { name: "Bash", durationMs: 1200 });
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].durationMs, 1200);
});

test("bad durations are ignored", () => {
  const empty = createLatency();
  assert.deepEqual(record(empty, { name: "Bash", durationMs: Number.NaN }).entries, []);
  assert.deepEqual(record(empty, { name: "Bash", durationMs: -1 }).entries, []);
  assert.deepEqual(record(empty, { durationMs: 1 }).entries, []);
});

test("the list is bounded", () => {
  let state = createLatency(3);
  for (let i = 0; i < 10; i += 1) state = record(state, { name: "Bash", durationMs: i });
  assert.equal(state.entries.length, 3);
  assert.equal(state.entries[0].durationMs, 7);
});

test("slowest keeps one sample per tool and sorts longest first", () => {
  let state = createLatency();
  state = record(state, { name: "Read", durationMs: 100 });
  state = record(state, { name: "Bash", durationMs: 900 });
  state = record(state, { name: "Read", durationMs: 400 });
  assert.deepEqual(
    slowest(state).map((entry) => [entry.name, entry.durationMs]),
    [["Bash", 900], ["Read", 400]],
  );
});

test("the line is compact and empty without samples", () => {
  assert.equal(describe(createLatency()), "");
  let state = createLatency();
  state = record(state, { name: "Bash", durationMs: 1200 });
  state = record(state, { name: "Edit", durationMs: 800 });
  assert.equal(describe(state), "Bash 1.2s · Edit 800ms");
});
