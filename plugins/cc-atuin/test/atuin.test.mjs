import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATUIN_AUTHOR,
  endArgs,
  parseHistory,
  parseHistoryId,
  searchArgs,
  startArgs,
  versionArgs,
} from "../hooks/atuin.js";

test("versionArgs asks for the atuin version", () => {
  assert.deepEqual(versionArgs(), ["atuin", "--version"]);
});

test("startArgs marks the author and separates the command", () => {
  assert.deepEqual(startArgs("ls -la"), [
    "atuin", "history", "start", "--author", ATUIN_AUTHOR, "--", "ls -la",
  ]);
});

test("the author is the claude-code marker", () => {
  assert.equal(ATUIN_AUTHOR, "claude-code");
});

test("endArgs carries the exit code", () => {
  assert.deepEqual(endArgs("42", 3), ["atuin", "history", "end", "42", "--exit", "3"]);
});

test("searchArgs uses the tab-separated format", () => {
  const args = searchArgs({ limit: 25 });
  assert.deepEqual(args.slice(0, 3), ["atuin", "search", "--limit"]);
  assert.equal(args[3], "25");
  assert.ok(args.includes("--format"));
  assert.ok(args.includes("{time}\t{command}"));
  assert.ok(!args.includes("--search-mode"));
});

test("searchArgs adds fuzzy mode only when a query is present", () => {
  const args = searchArgs({ limit: 5, query: "git" });
  assert.ok(args.includes("--search-mode"));
  assert.ok(args.includes("fuzzy"));
  assert.equal(args.at(-1), "git");
});

test("parseHistory splits the time and command on the tab", () => {
  const entries = parseHistory(
    "2026-10-03 09:00:00\tgit status\n2026-10-03 09:05:00\tdocker ps\n",
  );
  assert.equal(entries.length, 2);
  assert.equal(entries[0].text, "git status");
  assert.equal(entries[1].text, "docker ps");
  assert.equal(entries[0].source, "atuin");
  assert.ok(entries[0].timestamp > 0);
});

test("parseHistory skips lines without a tab", () => {
  const entries = parseHistory("garbage\nok\tcmd\n");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, "cmd");
});

test("parseHistory skips empty commands", () => {
  assert.deepEqual(parseHistory("2026-10-03 09:00:00\t\n"), []);
});

test("parseHistory tolerates empty and malformed input", () => {
  assert.deepEqual(parseHistory(""), []);
  assert.deepEqual(parseHistory(null), []);
  const [entry] = parseHistory("not-a-date\tcmd\n");
  assert.equal(entry.text, "cmd");
  assert.ok(entry.timestamp > 0);
});

test("parseHistoryId trims and rejects empty output", () => {
  assert.equal(parseHistoryId("  42\n"), "42");
  assert.equal(parseHistoryId(""), null);
  assert.equal(parseHistoryId("   "), null);
  assert.equal(parseHistoryId(null), null);
});
