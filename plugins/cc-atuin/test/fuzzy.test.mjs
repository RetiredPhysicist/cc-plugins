import { test } from "node:test";
import assert from "node:assert/strict";
import { fuzzyMatch, fuzzySearch } from "../hooks/fuzzy.js";

test("matches a subsequence and reports its indices", () => {
  const match = fuzzyMatch("gco", "git commit");
  assert.ok(match);
  // g(0), c(4), o(5): the `o` of "commit" directly follows the `c`.
  assert.deepEqual(match.indices, [0, 4, 5]);
});

test("returns null when characters are missing or out of order", () => {
  assert.equal(fuzzyMatch("xyz", "git commit"), null);
  assert.equal(fuzzyMatch("tig", "git commit"), null);
});

test("an empty query matches everything with no indices", () => {
  assert.deepEqual(fuzzyMatch("", "anything"), { score: 0, indices: [] });
});

test("is case insensitive", () => {
  assert.ok(fuzzyMatch("GIT", "git commit"));
  assert.ok(fuzzyMatch("git", "GIT COMMIT"));
});

test("prefers adjacent and word-boundary matches", () => {
  const adjacent = fuzzyMatch("commit", "git commit");
  const scattered = fuzzyMatch("commit", "c-o-m-m-i-t spread out");
  assert.ok(adjacent.score > scattered.score);
});

test("ranks the better candidate first", () => {
  const items = [
    { text: "totally unrelated" },
    { text: "git commit" },
    { text: "git checkout" },
  ];
  const results = fuzzySearch("gitco", items);
  assert.ok(results.length > 0);
  assert.match(results[0].item.text, /git c/);
});

test("respects the result limit", () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ text: `task ${i}` }));
  assert.equal(fuzzySearch("task", items, { limit: 10 }).length, 10);
});

test("accepts a custom text accessor", () => {
  const items = [{ cmd: "docker ps" }, { cmd: "git status" }];
  const results = fuzzySearch("docker", items, { text: (item) => item.cmd });
  assert.equal(results.length, 1);
  assert.equal(results[0].item.cmd, "docker ps");
});
