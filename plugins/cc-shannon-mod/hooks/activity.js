/**
 * Activity bookkeeping: what is running, what finished, and what is going
 * wrong.
 *
 * The statusline reads a transcript snapshot and infers all of this. A mod gets
 * the events themselves, so this tracks them directly.
 */

/**
 * A bounded, id-keyed set of in-flight entries.
 *
 * Tools and subagents both start and finish, so both use this. Bounding the set
 * means a long session cannot grow memory without limit.
 */
export function createTracker(limit = 20) {
  let items = [];

  return {
    add(id, value) {
      items = [...items, { id, at: Date.now(), ...value }].slice(-limit);
      return items.length;
    },
    remove(id) {
      const entry = items.find((item) => item.id === id) ?? null;
      items = items.filter((item) => item.id !== id);
      return entry;
    },
    all() {
      return items.slice();
    },
    /** Oldest first, capped, for display. */
    latest(count) {
      return items.slice(-Math.max(0, count));
    },
    clear() {
      items = [];
    },
    get size() {
      return items.length;
    },
  };
}

/**
 * Rolling counters for finished work.
 *
 * `errors` keeps the most recent failures so the pane can name them instead of
 * only counting them.
 */
export function createCounters() {
  return {
    completed: 0,
    failed: 0,
    totalMs: 0,
    errors: [],
  };
}

export function recordCompletion(counters, { durationMs = 0, failed = false, label = "" } = {}) {
  return {
    completed: counters.completed + 1,
    failed: counters.failed + (failed ? 1 : 0),
    totalMs: counters.totalMs + Math.max(0, Number(durationMs) || 0),
    errors: failed
      ? [...counters.errors, { label, at: Date.now() }].slice(-5)
      : counters.errors,
  };
}

/** Average duration of finished work, or null when none was measured. */
export function averageMs(counters) {
  if (!counters.completed || counters.totalMs <= 0) return null;
  return counters.totalMs / counters.completed;
}

/**
 * A one-line hint about what to do next, derived from what just happened.
 *
 * This is the part a statusline cannot offer: it is chosen from the event
 * stream, not from a snapshot.
 */
export function suggestion({ failed = 0, running = 0, contextPercent = null, requests = 0 } = {}) {
  if (failed >= 2) return "several failures in a row — consider a different approach";
  if (contextPercent !== null && contextPercent >= 90) return "context nearly full — /compact";
  if (running > 3) return "many tools at once — check what is running";
  // A quiet session needs no advice, so there is no default line.
  return "";
}
