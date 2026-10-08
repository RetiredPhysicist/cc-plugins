import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTE, RGB, TOOL_COLORS, packed, skyAt, toolKind, mix } from "../hooks/palette.js";

test("the palette keeps bloom's ordering and size", () => {
  assert.equal(PALETTE.length, 11);
  assert.deepEqual(PALETTE[0], [0.48, 0.64, 1.0]);
  assert.equal(TOOL_COLORS.length, 5);
});

test("packs an rgb triple into 0xRRGGBB", () => {
  assert.equal(packed([1, 1, 1], 1), 0xffffff);
  assert.equal(packed([0, 0, 0], 1), 0x000000);
  assert.equal(packed([1, 0, 0], 1), 0xff0000);
  // 0.5 rounds up to 0x80, not down to 0x7f: the channel is Math.round.
  assert.equal(packed([1, 1, 1], 0.5), 0x808080);
});

test("packing clamps out-of-range values", () => {
  assert.equal(packed([2, -1, 0.5], 1), 0xff0080);
  assert.equal(packed([1, 1, 1], 5), 0xffffff);
  assert.equal(packed([1, 1, 1], -1), 0x000000);
});

test("a tool name maps to its kind, unknown names to delegate", () => {
  assert.equal(toolKind("Read"), 0);
  assert.equal(toolKind("Grep"), 0);
  assert.equal(toolKind("Edit"), 1);
  assert.equal(toolKind("Write"), 1);
  assert.equal(toolKind("Bash"), 2);
  assert.equal(toolKind("WebSearch"), 3);
  assert.equal(toolKind("Agent"), 4);
  assert.equal(toolKind("mcp__server__thing"), 4);
  assert.equal(toolKind(undefined), 4);
});

test("mixing walks between two colors", () => {
  assert.deepEqual(mix([0, 0, 0], [1, 1, 1], 0.5), [0.5, 0.5, 0.5]);
  assert.deepEqual(mix([1, 0, 0], [0, 1, 0], 0), [1, 0, 0]);
  assert.deepEqual(mix([1, 0, 0], [0, 1, 0], 1), [0, 1, 0]);
});

test("the sky is darkest at night and has a dawn", () => {
  const midnight = skyAt(0);
  const noon = skyAt(12);
  const dawn = skyAt(6.7);
  // Midday is a cool dark blue, not a bright sky: bloom keeps stars readable.
  assert.ok(noon[2] > midnight[2], "the day is bluer than the night");
  assert.ok(noon[2] < 0.15, "the day stays dark");
  // Dawn is warmer: more red than the day is.
  assert.ok(dawn[0] > noon[0], "dawn is warmer than midday");
});

test("the sky wraps past midnight", () => {
  assert.deepEqual(skyAt(24), skyAt(0));
  assert.deepEqual(skyAt(25), skyAt(1));
  assert.deepEqual(skyAt(-1), skyAt(23));
});

test("kit and gold are distinct warm colors", () => {
  assert.notDeepEqual(RGB.kit, RGB.gold);
  assert.ok(RGB.kit[0] > RGB.kit[2], "kit reads warm");
});
