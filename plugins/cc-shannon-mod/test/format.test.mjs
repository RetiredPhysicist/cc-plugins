import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bar,
  contextLevel,
  fmtDuration,
  fmtRate,
  fmtTokens,
  summarize,
  tokensPerSecond,
} from "../hooks/format.js";

test("formats token counts compactly", () => {
  assert.equal(fmtTokens(0), "0");
  assert.equal(fmtTokens(999), "999");
  assert.equal(fmtTokens(1000), "1k");
  assert.equal(fmtTokens(1234), "1.2k");
  assert.equal(fmtTokens(1_234_567), "1.2M");
});

test("token formatting survives bad input", () => {
  assert.equal(fmtTokens(undefined), "0");
  assert.equal(fmtTokens(-5), "0");
  assert.equal(fmtTokens(Number.NaN), "0");
});

test("formats durations across every unit", () => {
  assert.equal(fmtDuration(250), "250ms");
  assert.equal(fmtDuration(1500), "1.5s");
  assert.equal(fmtDuration(45_000), "45s");
  assert.equal(fmtDuration(90_000), "1m30s");
  assert.equal(fmtDuration(3_600_000), "1h0m");
});

test("duration survives bad input", () => {
  assert.equal(fmtDuration(-1), "0s");
  assert.equal(fmtDuration(Number.NaN), "0s");
});

test("computes a token rate", () => {
  assert.equal(tokensPerSecond(100, 1000), 100);
  assert.equal(tokensPerSecond(50, 500), 100);
});

test("a token rate is null when it would be meaningless", () => {
  assert.equal(tokensPerSecond(0, 1000), null);
  assert.equal(tokensPerSecond(100, 0), null);
  assert.equal(tokensPerSecond(Number.NaN, 1000), null);
});

test("formats rates with sensible precision", () => {
  assert.equal(fmtRate(62.44), "62.4");
  assert.equal(fmtRate(150.6), "151");
  assert.equal(fmtRate(0), null);
  assert.equal(fmtRate(Number.NaN), null);
});

test("a bar fills proportionally and always shows a non-zero start", () => {
  assert.equal(bar(0, 10), "░".repeat(10));
  assert.equal(bar(100, 10), "█".repeat(10));
  assert.equal(bar(50, 10), "█".repeat(5) + "░".repeat(5));
  assert.equal(bar(1, 10), "█" + "░".repeat(9));
  assert.equal(bar(200, 4), "█".repeat(4));
  assert.equal(bar(-10, 4), "░".repeat(4));
});

test("classifies context levels at the boundaries", () => {
  assert.equal(contextLevel(0), "ok");
  assert.equal(contextLevel(49), "ok");
  assert.equal(contextLevel(50), "notice");
  assert.equal(contextLevel(74), "notice");
  assert.equal(contextLevel(75), "warning");
  assert.equal(contextLevel(89), "warning");
  assert.equal(contextLevel(90), "critical");
  assert.equal(contextLevel(100), "critical");
});

test("summarizes numeric series and ignores the rest", () => {
  const result = summarize([10, 20, Number.NaN, 30]);
  assert.deepEqual(result, { count: 3, min: 10, max: 30, average: 20 });
});

test("summarizing an empty series is null", () => {
  assert.equal(summarize([]), null);
  assert.equal(summarize([Number.NaN]), null);
});
