import { describe, expect, it } from "bun:test";
import { formatLatency, formatThroughputParts, formatThroughputText } from "./throughput.js";

describe("formatLatency", () => {
  it("uses milliseconds below one second", () => {
    expect(formatLatency(420)).toBe("420ms");
  });

  it("uses precise seconds above one second", () => {
    expect(formatLatency(1240)).toBe("1.24s");
  });
});

describe("formatThroughputText", () => {
  it("formats approximate response metrics", () => {
    expect(formatThroughputText({
      ttftMs: 1240,
      responseDurationMs: 5000,
      outputTokens: 312,
      tokensPerSecond: 62.4,
    })).toBe("TTFT 1.24s · Decode ~62.4 tok/s · ~312 tok");
    expect(formatThroughputParts({
      ttftMs: 1240,
      responseDurationMs: 5000,
      outputTokens: 312,
      tokensPerSecond: 62.4,
    })).toEqual([
      { key: "TTFT", value: "1.24s" },
      { key: "Decode", value: "~62.4 tok/s · ~312 tok" },
    ]);
  });

  it("omits the rate when the transcript has one assistant event", () => {
    expect(formatThroughputText({
      ttftMs: 300,
      responseDurationMs: 0,
      outputTokens: 12,
      tokensPerSecond: null,
    })).toBe("TTFT 300ms · Decode ~12 tok");
  });

  it("returns nothing without output usage", () => {
    expect(formatThroughputText(null)).toBeNull();
  });
});
