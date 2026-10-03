/**
 * Usage accounting, kept in `$.store` so it survives restarts.
 *
 * The shape is deliberately small and append-only per day: a session adds its
 * turn totals to today's bucket, and reads roll up the recent days.
 */

export const LEDGER_KEY = "ledger.v1";
const KEEP_DAYS = 30;

/** YYYY-MM-DD in local time, which is what a user means by "today". */
export function dayKey(timestamp) {
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A fresh ledger for a first run. */
export function emptyLedger() {
  return { version: 1, days: {} };
}

/**
 * Normalize whatever came out of the store. A corrupt or older value degrades to
 * an empty ledger instead of throwing inside a hook.
 */
export function normalizeLedger(value) {
  if (!value || typeof value !== "object") return emptyLedger();
  const days = value.days;
  if (!days || typeof days !== "object") return emptyLedger();

  const clean = {};
  for (const [key, bucket] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (!bucket || typeof bucket !== "object") continue;
    clean[key] = {
      turns: numberOrZero(bucket.turns),
      inputTokens: numberOrZero(bucket.inputTokens),
      outputTokens: numberOrZero(bucket.outputTokens),
      cacheReadTokens: numberOrZero(bucket.cacheReadTokens),
      cacheCreationTokens: numberOrZero(bucket.cacheCreationTokens),
      tools: numberOrZero(bucket.tools),
      durationMs: numberOrZero(bucket.durationMs),
    };
  }
  return { version: 1, days: clean };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** Add one turn to a day's bucket, returning a new ledger. */
export function recordTurn(ledger, timestamp, usage) {
  const base = normalizeLedger(ledger);
  const key = dayKey(timestamp);
  const bucket = base.days[key] ?? {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    tools: 0,
    durationMs: 0,
  };

  const next = {
    ...base.days,
    [key]: {
      turns: bucket.turns + 1,
      inputTokens: bucket.inputTokens + numberOrZero(usage?.inputTokens),
      outputTokens: bucket.outputTokens + numberOrZero(usage?.outputTokens),
      cacheReadTokens: bucket.cacheReadTokens + numberOrZero(usage?.cacheReadTokens),
      cacheCreationTokens:
        bucket.cacheCreationTokens + numberOrZero(usage?.cacheCreationTokens),
      tools: bucket.tools + numberOrZero(usage?.tools),
      durationMs: bucket.durationMs + numberOrZero(usage?.durationMs),
    },
  };

  return { version: 1, days: pruneDays(next) };
}

/**
 * Keep only the newest `KEEP_DAYS` buckets so the store cannot grow forever.
 *
 * The cut is by date order, not by a window around the incoming timestamp: a
 * backfill writes older days on purpose, and a window would let every one of
 * those entries survive.
 */
function pruneDays(days) {
  const keys = Object.keys(days).sort();
  if (keys.length <= KEEP_DAYS) return days;
  const kept = {};
  for (const key of keys.slice(-KEEP_DAYS)) {
    kept[key] = days[key];
  }
  return kept;
}

/** Totals for one day, or null when that day has no data. */
export function dayTotal(ledger, timestamp) {
  const base = normalizeLedger(ledger);
  return base.days[dayKey(timestamp)] ?? null;
}

/** Totals across the last `days` days, including today. */
export function recentTotal(ledger, timestamp, days = 7) {
  const base = normalizeLedger(ledger);
  const now = Number.isFinite(timestamp) ? timestamp : Date.now();
  const cutoff = dayKey(now - (days - 1) * 24 * 60 * 60 * 1000);

  const total = {
    days: 0,
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    tools: 0,
    durationMs: 0,
  };

  for (const [key, bucket] of Object.entries(base.days)) {
    if (key < cutoff) continue;
    total.days += 1;
    total.turns += bucket.turns;
    total.inputTokens += bucket.inputTokens;
    total.outputTokens += bucket.outputTokens;
    total.cacheReadTokens += bucket.cacheReadTokens;
    total.cacheCreationTokens += bucket.cacheCreationTokens;
    total.tools += bucket.tools;
    total.durationMs += bucket.durationMs;
  }
  return total;
}

/**
 * Share of prompt tokens served from cache. Higher is cheaper; null when there
 * were no input tokens to judge.
 */
export function cacheHitRatio(bucket) {
  if (!bucket) return null;
  const fresh = numberOrZero(bucket.inputTokens);
  const read = numberOrZero(bucket.cacheReadTokens);
  const total = fresh + read;
  if (total <= 0) return null;
  return read / total;
}
