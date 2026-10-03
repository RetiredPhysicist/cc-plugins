import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cacheHitRatio,
  dayKey,
  dayTotal,
  emptyLedger,
  normalizeLedger,
  recentTotal,
  recordTurn,
} from "../hooks/ledger.js";

const DAY = 24 * 60 * 60 * 1000;

test("dayKey formats a local date", () => {
  const key = dayKey(new Date(2026, 9, 3, 22, 30).getTime());
  assert.equal(key, "2026-10-03");
});

test("a fresh ledger is empty", () => {
  assert.deepEqual(emptyLedger(), { version: 1, days: {} });
});

test("normalize degrades bad input instead of throwing", () => {
  assert.deepEqual(normalizeLedger(null), emptyLedger());
  assert.deepEqual(normalizeLedger("nope"), emptyLedger());
  assert.deepEqual(normalizeLedger({ days: "nope" }), emptyLedger());
});

test("normalize drops malformed days and fixes bad numbers", () => {
  const ledger = normalizeLedger({
    days: {
      "2026-10-03": { turns: 2, outputTokens: "10", inputTokens: -5 },
      "not-a-day": { turns: 9 },
    },
  });
  assert.deepEqual(Object.keys(ledger.days), ["2026-10-03"]);
  assert.equal(ledger.days["2026-10-03"].turns, 2);
  assert.equal(ledger.days["2026-10-03"].outputTokens, 10);
  assert.equal(ledger.days["2026-10-03"].inputTokens, 0);
});

test("recording a turn accumulates into one day", () => {
  const now = new Date(2026, 9, 3, 12).getTime();
  let ledger = emptyLedger();
  ledger = recordTurn(ledger, now, { outputTokens: 100, inputTokens: 10, tools: 2, durationMs: 1000 });
  ledger = recordTurn(ledger, now, { outputTokens: 50, inputTokens: 5, tools: 1, durationMs: 500 });

  const today = dayTotal(ledger, now);
  assert.equal(today.turns, 2);
  assert.equal(today.outputTokens, 150);
  assert.equal(today.inputTokens, 15);
  assert.equal(today.tools, 3);
  assert.equal(today.durationMs, 1500);
});

test("recording does not mutate the input ledger", () => {
  const now = Date.now();
  const before = emptyLedger();
  const after = recordTurn(before, now, { outputTokens: 10 });
  assert.deepEqual(before.days, {});
  assert.equal(dayTotal(after, now).outputTokens, 10);
});

test("recentTotal sums a window and ignores older days", () => {
  const now = new Date(2026, 9, 10, 12).getTime();
  let ledger = emptyLedger();
  ledger = recordTurn(ledger, now, { outputTokens: 10 });
  ledger = recordTurn(ledger, now - 2 * DAY, { outputTokens: 20 });
  ledger = recordTurn(ledger, now - 30 * DAY, { outputTokens: 999 });

  const week = recentTotal(ledger, now, 7);
  assert.equal(week.outputTokens, 30);
  assert.equal(week.days, 2);
});

test("dayTotal is null for a day with no data", () => {
  assert.equal(dayTotal(emptyLedger(), Date.now()), null);
});

test("cache hit ratio measures reuse", () => {
  assert.equal(cacheHitRatio({ inputTokens: 0, cacheReadTokens: 0 }), null);
  assert.equal(cacheHitRatio({ inputTokens: 100, cacheReadTokens: 0 }), 0);
  assert.equal(cacheHitRatio({ inputTokens: 25, cacheReadTokens: 75 }), 0.75);
});

test("the ledger is pruned to a bounded window", () => {
  const now = new Date(2026, 9, 30, 12).getTime();
  let ledger = emptyLedger();
  for (let i = 0; i < 45; i += 1) {
    ledger = recordTurn(ledger, now - i * DAY, { outputTokens: 1 });
  }
  assert.ok(Object.keys(ledger.days).length <= 30, "expected at most 30 days kept");
});
