import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, dequeue, emptyQueue, enqueue, move, removeAt } from "../hooks/queue.js";

test("enqueue appends and trims", () => {
  const queue = enqueue(emptyQueue(), "  first  ");
  assert.deepEqual(queue, ["first"]);
});

test("empty or whitespace text is refused", () => {
  assert.equal(enqueue([], ""), null);
  assert.equal(enqueue([], "   "), null);
  assert.equal(enqueue([], null), null);
});

test("the queue is bounded", () => {
  let queue = [];
  for (let i = 0; i < 20; i += 1) queue = enqueue(queue, `item ${i}`);
  assert.equal(enqueue(queue, "one too many"), null);
  assert.equal(queue.length, 20);
});

test("a very long prompt is clamped", () => {
  const queue = enqueue([], "x".repeat(5000));
  assert.equal(queue[0].length, 2000);
});

test("dequeue takes from the front", () => {
  const first = dequeue(["a", "b"]);
  assert.equal(first.text, "a");
  assert.deepEqual(first.queue, ["b"]);
});

test("dequeuing an empty queue yields nothing", () => {
  const result = dequeue([]);
  assert.equal(result.text, null);
  assert.deepEqual(result.queue, []);
});

test("removeAt drops one item and ignores bad indexes", () => {
  assert.deepEqual(removeAt(["a", "b", "c"], 1), ["a", "c"]);
  assert.deepEqual(removeAt(["a"], 9), ["a"]);
  assert.deepEqual(removeAt(["a"], -1), ["a"]);
});

test("move reorders within bounds", () => {
  assert.deepEqual(move(["a", "b", "c"], 1, "up"), ["b", "a", "c"]);
  assert.deepEqual(move(["a", "b", "c"], 0, "down"), ["b", "a", "c"]);
  // Moves past either end do nothing.
  assert.deepEqual(move(["a", "b"], 0, "up"), ["a", "b"]);
  assert.deepEqual(move(["a", "b"], 1, "down"), ["a", "b"]);
});

test("describe previews the head and counts the rest", () => {
  assert.equal(describe([]), "");
  assert.equal(describe(["only"]), "▸ only");
  assert.equal(describe(["one", "two", "three"]), "▸ one (+2)");
  const long = describe(["y".repeat(80)]);
  assert.ok(long.length < 60, long);
});
