import { test } from "node:test";
import assert from "node:assert/strict";
import { createLens, describe, growthPerTurn, sample, turnsLeft } from "../hooks/lens.js";

test("sampling appends and ignores repeats", () => {
  let lens = sample(createLens(), 10);
  lens = sample(lens, 10);
  assert.deepEqual(lens, [10]);
  lens = sample(lens, 20);
  assert.deepEqual(lens, [10, 20]);
});

test("sampling rejects nonsense", () => {
  assert.deepEqual(sample([1], Number.NaN), [1]);
  assert.deepEqual(sample([1], -5), [1]);
  assert.deepEqual(sample([1], "no"), [1]);
});

test("samples are bounded", () => {
  let lens = createLens();
  for (let i = 0; i < 30; i += 1) lens = sample(lens, i);
  assert.equal(lens.length, 12);
});

test("growth averages only the rises", () => {
  // 10 -> 20 (+10), 20 -> 15 (a drop, ignored), 15 -> 25 (+10)
  assert.equal(growthPerTurn([10, 20, 15, 25]), 10);
});

test("growth is null without at least one rise", () => {
  assert.equal(growthPerTurn([]), null);
  assert.equal(growthPerTurn([10]), null);
  assert.equal(growthPerTurn([20, 10]), null);
});

test("turns left divides the remaining room by the growth", () => {
  assert.equal(turnsLeft([10, 20], 55, { ceiling: 95 }), 4);
});

test("turns left is zero at the ceiling and null when flat", () => {
  assert.equal(turnsLeft([10, 20], 96), 0);
  assert.equal(turnsLeft([10, 10], 50), null);
  assert.equal(turnsLeft([], 50), null);
});

test("the line reports growth and runway", () => {
  assert.equal(describe([10, 20], 50), "+10.0%/turn · ~4 turns left");
  assert.equal(describe([10, 10], 50), "");
});
