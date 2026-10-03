import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  describe,
  emptyCompanion,
  face,
  feed,
  level,
  normalizeCompanion,
} from "../hooks/companion.js";

test("recognizes a test run", () => {
  for (const command of ["npm test", "npm run test", "pnpm test", "bun test", "pytest", "go test ./...", "cargo test", "make test"]) {
    assert.equal(classify(command), "test", command);
  }
});

test("recognizes a commit", () => {
  assert.equal(classify("git commit -m 'x'"), "commit");
  assert.equal(classify("git commit --amend"), "commit");
});

test("commit wins over test when a command does both", () => {
  // A commit that also mentions tests is still a commit.
  assert.equal(classify("npm test && git commit -m 'green'"), "commit");
});

test("ordinary commands are not food", () => {
  for (const command of ["ls", "git status", "npm install", "git commitlog", ""]) {
    assert.equal(classify(command), null, command);
  }
});

test("feeding gains experience and counts the kind", () => {
  let pet = emptyCompanion();
  pet = feed(pet, "test");
  pet = feed(pet, "commit");
  assert.equal(pet.xp, 4);
  assert.equal(pet.tests, 1);
  assert.equal(pet.commits, 1);
});

test("a failed command does not feed it", () => {
  const pet = feed(emptyCompanion(), "test", { succeeded: false });
  assert.equal(pet.xp, 0);
});

test("unknown food is ignored", () => {
  assert.equal(feed(emptyCompanion(), "pizza").xp, 0);
  assert.equal(feed(emptyCompanion(), null).xp, 0);
});

test("level rises every five experience and starts at one", () => {
  assert.equal(level({ xp: 0 }), 1);
  assert.equal(level({ xp: 4 }), 1);
  assert.equal(level({ xp: 5 }), 2);
  assert.equal(level({ xp: 9 }), 2);
  assert.equal(level({ xp: 10 }), 3);
});

test("bad stored data becomes a fresh pet", () => {
  assert.deepEqual(normalizeCompanion(null), emptyCompanion());
  assert.deepEqual(normalizeCompanion({ xp: "nope", tests: -3 }), {
    xp: 0,
    tests: 0,
    commits: 0,
    lastFedAt: 0,
  });
});

test("the face reflects level and freshness", () => {
  const now = 1_000_000;
  assert.equal(face({ xp: 0, lastFedAt: 0 }, now), "( · )");
  // Level 5 needs 20 experience, and a recent feed is the delighted face.
  assert.equal(face({ xp: 20, lastFedAt: now - 1000 }, now), "(^‿^)");
  assert.equal(face({ xp: 5, lastFedAt: now - 1000 }, now), "(•‿•)");
  // Idle for over half an hour, it dozes.
  assert.equal(face({ xp: 5, lastFedAt: now - 60 * 60 * 1000 }, now), "(-.-)");
});

test("the line stays short", () => {
  const line = describe({ xp: 10, tests: 3, commits: 2 }, 1_000_000);
  assert.match(line, /Lv3/);
  assert.match(line, /✔3/);
  assert.match(line, /⎇2/);
});
