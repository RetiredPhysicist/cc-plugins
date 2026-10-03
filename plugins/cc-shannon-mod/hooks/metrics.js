/**
 * Turn timing.
 *
 * `turn.step` streams, so the first chunk's arrival is the real time to first
 * token. The statusline can only estimate this from transcript timestamps; here
 * the numbers come from the stream itself.
 */

/** Bounded ring so a long session cannot grow memory without limit. */
export function createRing(limit = 50) {
  const size = Math.max(1, Math.floor(limit));
  const items = [];
  return {
    push(value) {
      items.push(value);
      if (items.length > size) items.shift();
    },
    all() {
      return items.slice();
    },
    latest() {
      return items.length ? items[items.length - 1] : null;
    },
    clear() {
      items.length = 0;
    },
    get size() {
      return items.length;
    },
  };
}

/**
 * Track one request. `markFirstChunk` is idempotent, so it is safe to call from
 * every yielded chunk.
 */
export function startRequest(now, agentId = null) {
  const request = {
    startedAt: Number(now) || 0,
    firstChunkAt: null,
    agentId: agentId ?? null,
  };
  return {
    markFirstChunk(at) {
      if (request.firstChunkAt !== null) return false;
      request.firstChunkAt = Number(at) || 0;
      return true;
    },
    finish(at, usage) {
      const endedAt = Number(at) || 0;
      const ttftMs =
        request.firstChunkAt === null ? null : request.firstChunkAt - request.startedAt;
      const totalMs = endedAt - request.startedAt;
      const outputTokens = Number(usage?.output_tokens) || 0;
      // Decode speed excludes the wait for the first token, which would
      // otherwise drag the rate down whenever the model thinks for a while.
      const decodeMs =
        request.firstChunkAt === null ? totalMs : endedAt - request.firstChunkAt;

      return {
        agentId: request.agentId,
        ttftMs: ttftMs !== null && ttftMs >= 0 ? ttftMs : null,
        totalMs: totalMs >= 0 ? totalMs : null,
        decodeMs: decodeMs >= 0 ? decodeMs : null,
        outputTokens,
        inputTokens: Number(usage?.input_tokens) || 0,
        cacheReadTokens: Number(usage?.cache_read_input_tokens) || 0,
        cacheCreationTokens: Number(usage?.cache_creation_input_tokens) || 0,
        model: usage?.model ?? null,
      };
    },
  };
}

/** Fold a request record into the running session totals. */
export function accumulate(totals, record) {
  return {
    requests: totals.requests + 1,
    outputTokens: totals.outputTokens + record.outputTokens,
    inputTokens: totals.inputTokens + record.inputTokens,
    cacheReadTokens: totals.cacheReadTokens + record.cacheReadTokens,
    cacheCreationTokens: totals.cacheCreationTokens + record.cacheCreationTokens,
    ttftMs: record.ttftMs === null ? totals.ttftMs : [...totals.ttftMs, record.ttftMs],
    decodeMs: record.decodeMs === null ? totals.decodeMs : [...totals.decodeMs, record.decodeMs],
    decodeTokens:
      record.decodeMs === null ? totals.decodeTokens : totals.decodeTokens + record.outputTokens,
  };
}

export function emptyTotals() {
  return {
    requests: 0,
    outputTokens: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    ttftMs: [],
    decodeMs: [],
    decodeTokens: 0,
  };
}
