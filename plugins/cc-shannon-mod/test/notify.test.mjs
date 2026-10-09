import { test } from "node:test";
import assert from "node:assert/strict";
import { guardNotice, shouldNotify } from "../hooks/notify.js";

test("notifications are off unless the config asks for them", () => {
  assert.equal(shouldNotify({ notify: true }), true);
  assert.equal(shouldNotify({ notify: false }), false);
  assert.equal(shouldNotify({}), false);
  assert.equal(shouldNotify(undefined), false);
  // A truthy non-boolean is not the setting: only true counts.
  assert.equal(shouldNotify({ notify: "yes" }), false);
});

test("a guard notice names the risk and the command", () => {
  const text = guardNotice({ reason: "recursive delete", command: "rm -rf /tmp/x" });
  assert.match(text, /cc-shannon guard/);
  assert.match(text, /recursive delete/);
  assert.match(text, /rm -rf \/tmp\/x/);
});

test("a guard notice stays one line", () => {
  const text = guardNotice({
    reason: "recursive delete\nand a second reason",
    command: "rm -rf /tmp/x\nrm -rf /tmp/y",
  });
  assert.equal(text.includes("\n"), false, "no newlines reach the banner");
});

test("a guard notice is bounded even for a huge command", () => {
  const text = guardNotice({ reason: "force push", command: `git push --force ${"a".repeat(500)}` });
  assert.ok(text.length < 260, `notice is bounded, got ${text.length}`);
});

test("a guard notice survives missing fields", () => {
  const text = guardNotice({});
  assert.equal(typeof text, "string");
  assert.match(text, /cc-shannon guard/);
});
