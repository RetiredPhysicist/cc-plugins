/**
 * Per-tool latency, kept from the tool events themselves.
 *
 * A statusline can only reconstruct timings from transcript timestamps. Here
 * both ends of a tool call are observed live, so the numbers are measured.
 */

const DEFAULT_LIMIT = 50;

export function createLatency(limit = DEFAULT_LIMIT) {
  const value = Number(limit);
  const size = Math.max(1, Math.floor(Number.isFinite(value) ? value : DEFAULT_LIMIT));
  return { entries: [], limit: size };
}

/** Record one finished tool. Bad durations are ignored rather than stored. */
export function record(latencies, { name, target = null, durationMs, failed = false } = {}) {
  const value = Number(durationMs);
  if (!name || !Number.isFinite(value) || value < 0) {
    return normalize(latencies);
  }
  const state = normalize(latencies);
  const list = state.entries.slice();
  list.push({ name: String(name), target: target || null, durationMs: value, failed: Boolean(failed) });
  return { entries: list.slice(-state.limit), limit: state.limit };
}

/**
 * The slowest measured tools, longest first.
 *
 * One sample per tool name avoids a single hot loop crowding out everything
 * else on the row.
 */
export function slowest(latencies, limit = 3) {
  const list = normalize(latencies).entries;
  const byName = new Map();
  for (const item of list) {
    const current = byName.get(item.name);
    if (!current || item.durationMs > current.durationMs) byName.set(item.name, item);
  }
  return [...byName.values()]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, Math.max(0, limit));
}

/** One compact line, or empty when nothing has been measured. */
export function describe(latencies) {
  const entries = slowest(latencies);
  if (!entries.length) return "";
  return entries
    .map((entry) => `${entry.name} ${formatMs(entry.durationMs)}`)
    .join(" · ");
}

function normalize(latencies) {
  if (latencies && typeof latencies === "object" && Array.isArray(latencies.entries)) {
    return {
      entries: latencies.entries.slice(),
      limit: Math.max(1, Math.floor(Number(latencies.limit) || DEFAULT_LIMIT)),
    };
  }
  return { entries: Array.isArray(latencies) ? latencies.slice() : [], limit: DEFAULT_LIMIT };
}

export function formatMs(value) {
  if (value >= 1000) {
    const seconds = value / 1000;
    return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)}s`;
  }
  return `${Math.round(value)}ms`;
}
